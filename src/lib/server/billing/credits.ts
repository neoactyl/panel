import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "#lib/server/db/index.ts";
import { creditAccount, creditTransaction } from "#lib/server/db/ops.ts";

export class CreditError extends Error {
  code: "INSUFFICIENT_CREDITS" | "INVALID_AMOUNT" | "DUPLICATE_REFERENCE";

  constructor(
    message: string,
    code: "INSUFFICIENT_CREDITS" | "INVALID_AMOUNT" | "DUPLICATE_REFERENCE",
  ) {
    super(message);
    this.name = "CreditError";
    this.code = code;
  }
}

export type CreditEntry = {
  userId: string;
  amount: number;
  kind: string;
  reference: string;
  description?: string;
  metadata?: Record<string, unknown>;
};

type CreditExecutor = Pick<
  typeof db,
  "select" | "insert" | "update" | "delete"
>;

const requirePositive = (amount: number) => {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new CreditError(
      "Credit amounts must be positive whole numbers.",
      "INVALID_AMOUNT",
    );
  }
};

const serializable = (value?: Record<string, unknown>) =>
  value ? JSON.stringify(value) : null;

const readBalance = async (executor: CreditExecutor, userId: string) => {
  const account = await executor
    .select({ balance: creditAccount.balance })
    .from(creditAccount)
    .where(eq(creditAccount.userId, userId))
    .get();

  return account?.balance ?? 0;
};

export const getCreditBalance = async (userId: string) =>
  readBalance(db, userId);

/**
 * Atomically add `delta` to a balance.
 *
 * The read-modify-write happens inside a single SQLite upsert so concurrent
 * credits and debits cannot lose each other's updates. The `WHERE` clause on the
 * update (and the guarded insert) also makes the "not enough credits" check
 * atomic, so a balance can never be driven below zero.
 *
 * Returns the resulting balance, or `null` when the balance would go negative
 * (a spend against an account with insufficient funds, or no account at all).
 */
const applyBalance = async (
  executor: CreditExecutor,
  userId: string,
  delta: number,
  nowMs: number,
): Promise<number | null> => {
  const now = new Date(nowMs);

  // Try the atomic update first. The `balance + delta >= 0` guard means an
  // insufficient balance updates zero rows instead of going negative.
  const updated = await executor
    .update(creditAccount)
    .set({
      balance: sql`${creditAccount.balance} + ${delta}`,
      updatedAt: now,
    })
    .where(
      and(
        eq(creditAccount.userId, userId),
        sql`${creditAccount.balance} + ${delta} >= 0`,
      ),
    )
    .returning({ balance: creditAccount.balance });

  if (updated.length > 0) return updated[0]!.balance;

  const account = await executor
    .select({ balance: creditAccount.balance })
    .from(creditAccount)
    .where(eq(creditAccount.userId, userId))
    .get();

  // The account exists but the balance is too low, or it does not exist and
  // this is a spend: either way there is nothing to apply.
  if (account || delta < 0) return null;

  // First credit for this user: create the account. `onConflictDoNothing`
  // makes a concurrent creator harmless; the loser retries the update below.
  const inserted = await executor
    .insert(creditAccount)
    .values({ userId, balance: delta, updatedAt: now })
    .onConflictDoNothing()
    .returning({ balance: creditAccount.balance });

  if (inserted.length > 0) return inserted[0]!.balance;

  const retried = await executor
    .update(creditAccount)
    .set({
      balance: sql`${creditAccount.balance} + ${delta}`,
      updatedAt: now,
    })
    .where(
      and(
        eq(creditAccount.userId, userId),
        sql`${creditAccount.balance} + ${delta} >= 0`,
      ),
    )
    .returning({ balance: creditAccount.balance });

  return retried[0]?.balance ?? null;
};

const applyEntryWith = async (
  executor: CreditExecutor,
  entry: CreditEntry,
  delta: number,
) => {
  // Fast path: this reference was already applied.
  const existing = await executor
    .select({ id: creditTransaction.id })
    .from(creditTransaction)
    .where(eq(creditTransaction.reference, entry.reference))
    .get();

  if (existing) {
    return {
      applied: false as const,
      balance: await readBalance(executor, entry.userId),
    };
  }

  const now = new Date();
  const nowMs = now.getTime();

  // Claim the reference *before* touching the balance. The unique index makes
  // this insert the single point that decides which concurrent caller may
  // apply the entry, so a duplicate delivery can never credit the account
  // twice. `balanceAfter` is filled in once the balance is known.
  const claim = await executor
    .insert(creditTransaction)
    .values({
      userId: entry.userId,
      amount: delta,
      balanceAfter: 0,
      kind: entry.kind,
      reference: entry.reference,
      description: entry.description ?? "",
      metadata: serializable(entry.metadata),
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: creditTransaction.id })
    .get();

  if (!claim) {
    // Lost the race: another writer already applied this reference.
    return {
      applied: false as const,
      balance: await readBalance(executor, entry.userId),
    };
  }

  const next = await applyBalance(executor, entry.userId, delta, nowMs);

  if (next === null) {
    // Not enough credits (or a spend against a missing account): release the
    // claim so the reference can be retried once the balance is topped up.
    await executor
      .delete(creditTransaction)
      .where(eq(creditTransaction.reference, entry.reference))
      .run();

    const balance = await readBalance(executor, entry.userId);

    throw new CreditError(
      `Not enough credits. This action needs ${Math.abs(delta)} but your balance is ${balance}.`,
      "INSUFFICIENT_CREDITS",
    );
  }

  await executor
    .update(creditTransaction)
    .set({ balanceAfter: next })
    .where(eq(creditTransaction.reference, entry.reference))
    .run();

  return { applied: true as const, balance: next };
};

const applyEntry = (entry: CreditEntry, delta: number) =>
  applyEntryWith(db, entry, delta);

export const addCredits = async (
  entry: Omit<CreditEntry, "amount"> & { amount: number },
) => {
  requirePositive(entry.amount);
  return applyEntry(entry, entry.amount);
};

export const addCreditsWith = async (
  executor: CreditExecutor,
  entry: Omit<CreditEntry, "amount"> & { amount: number },
) => {
  requirePositive(entry.amount);
  return applyEntryWith(executor, entry, entry.amount);
};

export const spendCredits = async (
  entry: Omit<CreditEntry, "amount"> & { amount: number },
) => {
  requirePositive(entry.amount);
  return applyEntry(entry, -entry.amount);
};

export const grantCredits = async ({
  userId,
  amount,
  reference,
  description,
  metadata,
}: {
  userId: string;
  amount: number;
  reference: string;
  description?: string;
  metadata?: Record<string, unknown>;
}) =>
  addCredits({
    userId,
    amount,
    kind: "admin_grant",
    reference,
    description,
    metadata,
  });

export const listCreditTransactions = async (userId: string, limit = 50) =>
  db
    .select()
    .from(creditTransaction)
    .where(eq(creditTransaction.userId, userId))
    .orderBy(desc(creditTransaction.createdAt))
    .limit(limit);

export const findCreditTransaction = async (
  userId: string,
  reference: string,
) =>
  db
    .select()
    .from(creditTransaction)
    .where(
      and(
        eq(creditTransaction.userId, userId),
        eq(creditTransaction.reference, reference),
      ),
    )
    .get();
