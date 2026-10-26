import { and, desc, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { creditAccount, creditTransaction } from '#lib/server/db/ops.ts';

export class CreditError extends Error {
	code: 'INSUFFICIENT_CREDITS' | 'INVALID_AMOUNT' | 'DUPLICATE_REFERENCE';

	constructor(
		message: string,
		code: 'INSUFFICIENT_CREDITS' | 'INVALID_AMOUNT' | 'DUPLICATE_REFERENCE'
	) {
		super(message);
		this.name = 'CreditError';
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

type CreditExecutor = Pick<typeof db, 'select' | 'insert' | 'update'>;

const requirePositive = (amount: number) => {
	if (!Number.isInteger(amount) || amount <= 0) {
		throw new CreditError('Credit amounts must be positive whole numbers.', 'INVALID_AMOUNT');
	}
};

const serializable = (value?: Record<string, unknown>) =>
	value ? JSON.stringify(value) : null;

export const getCreditBalance = async (userId: string) => {
	const account = await db
		.select({ balance: creditAccount.balance })
		.from(creditAccount)
		.where(eq(creditAccount.userId, userId))
		.get();

	return account?.balance ?? 0;
};

const applyEntryWith = async (executor: CreditExecutor, entry: CreditEntry, delta: number) => {
	const existing = await executor
		.select({ balanceAfter: creditTransaction.balanceAfter })
		.from(creditTransaction)
		.where(eq(creditTransaction.reference, entry.reference))
		.get();

	if (existing) {
		return { applied: false as const, balance: existing.balanceAfter };
	}

	const account = await executor
		.select()
		.from(creditAccount)
		.where(eq(creditAccount.userId, entry.userId))
		.get();

	const balance = account?.balance ?? 0;
	const next = balance + delta;

	if (next < 0) {
		throw new CreditError(
			`Not enough credits. This action needs ${Math.abs(delta)} but your balance is ${balance}.`,
			'INSUFFICIENT_CREDITS'
		);
	}

	const now = new Date();

	if (account) {
		await executor
			.update(creditAccount)
			.set({ balance: next, updatedAt: now })
			.where(eq(creditAccount.userId, entry.userId))
			.run();
	} else {
		await executor.insert(creditAccount).values({ userId: entry.userId, balance: next, updatedAt: now }).run();
	}

	try {
		await executor
			.insert(creditTransaction)
			.values({
				userId: entry.userId,
				amount: delta,
				balanceAfter: next,
				kind: entry.kind,
				reference: entry.reference,
				description: entry.description ?? '',
				metadata: serializable(entry.metadata),
				createdAt: now
			})
			.run();
	} catch (cause) {
		const duplicate = await executor
			.select({ balanceAfter: creditTransaction.balanceAfter })
			.from(creditTransaction)
			.where(eq(creditTransaction.reference, entry.reference))
			.get();

		await executor
			.update(creditAccount)
			.set({ balance, updatedAt: now })
			.where(eq(creditAccount.userId, entry.userId))
			.run();

		if (duplicate) return { applied: false as const, balance: duplicate.balanceAfter };

		throw cause;
	}

	return { applied: true as const, balance: next };
};

const applyEntry = (entry: CreditEntry, delta: number) => applyEntryWith(db, entry, delta);

export const addCredits = async (entry: Omit<CreditEntry, 'amount'> & { amount: number }) => {
	requirePositive(entry.amount);
	return applyEntry(entry, entry.amount);
};

export const addCreditsWith = async (
	executor: CreditExecutor,
	entry: Omit<CreditEntry, 'amount'> & { amount: number }
) => {
	requirePositive(entry.amount);
	return applyEntryWith(executor, entry, entry.amount);
};

export const spendCredits = async (entry: Omit<CreditEntry, 'amount'> & { amount: number }) => {
	requirePositive(entry.amount);
	return applyEntry(entry, -entry.amount);
};

export const grantCredits = async ({
	userId,
	amount,
	reference,
	description,
	metadata
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
		kind: 'admin_grant',
		reference,
		description,
		metadata
	});

export const listCreditTransactions = async (userId: string, limit = 50) =>
	db
		.select()
		.from(creditTransaction)
		.where(eq(creditTransaction.userId, userId))
		.orderBy(desc(creditTransaction.createdAt))
		.limit(limit);

export const findCreditTransaction = async (userId: string, reference: string) =>
	db
		.select()
		.from(creditTransaction)
		.where(and(eq(creditTransaction.userId, userId), eq(creditTransaction.reference, reference)))
		.get();
