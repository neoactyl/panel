import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { getAdapter } from "#lib/server/panel/adapter.ts";
import { deleteServerOwner } from "#lib/server/panel/ownership.ts";
import { CreditError, spendCredits } from "#lib/server/billing/credits.ts";
import { db } from "#lib/server/db/index.ts";
import { serverBilling, serverEntitlement } from "#lib/server/db/ops.ts";
import { logActivity } from "#lib/server/system/logs.ts";
import { notifyUser } from "#lib/server/system/notifications.ts";
import { getBool, getNumber, getSetting } from "#lib/server/config/settings.ts";
import {
  getRenewalWindow,
  RENEWAL_WINDOW_FRACTION,
} from "#lib/renewal-window.ts";

const DAY = 24 * 60 * 60 * 1000;

export type RenewalSettings = {
  enabled: boolean;
  currency: string;
  creationCostEnabled: boolean;
  creationCost: number;
  defaultRenewalPrice: number;
  intervalDays: number;
  retryHours: number;
  deleteAfterDays: number;
  allowPurchase: boolean;
  allowEarn: boolean;
};

export const getRenewalSettings = (): RenewalSettings => ({
  enabled: getBool("credits.enabled"),
  currency: getSetting("credits.currency") || "Credits",
  creationCostEnabled: getBool("credits.creationCostEnabled"),
  creationCost: getNumber("credits.creationCost"),
  defaultRenewalPrice: getNumber("credits.defaultRenewalPrice"),
  intervalDays: Math.max(1, getNumber("credits.intervalDays")),
  retryHours: Math.max(0, getNumber("credits.retryHours")),
  deleteAfterDays: Math.max(0, getNumber("credits.deleteAfterDays")),
  allowPurchase: getBool("credits.allowPurchase"),
  allowEarn: getBool("credits.allowEarn"),
});

export const formatCredits = (
  amount: number,
  currency = getRenewalSettings().currency,
) => `${amount.toLocaleString()} ${currency}`;

const addDays = (date: Date, days: number) =>
  new Date(date.getTime() + days * DAY);

export const getServerBilling = async (serverId: string) =>
  db
    .select()
    .from(serverBilling)
    .where(eq(serverBilling.serverId, serverId))
    .get();

export const listServerBillings = async (userId: string) =>
  db.select().from(serverBilling).where(eq(serverBilling.userId, userId));

/**
 * Create billing rows for servers that predate renewals being enabled.
 *
 * Without this, only servers created after `credits.enabled` was switched on
 * have billing records, so existing servers never show a renewal option. It
 * also repairs zero-price records left behind when the default renewal price
 * was still 0 at creation time.
 */
export const ensureServerBillings = async (
  serverIds: string[],
  userId: string,
) => {
  const settings = getRenewalSettings();
  if (!settings.enabled || serverIds.length === 0) return;

  const existing = await db
    .select()
    .from(serverBilling)
    .where(inArray(serverBilling.serverId, serverIds));
  const byServer = new Map(
    existing.map((billing) => [billing.serverId, billing]),
  );
  const now = new Date();

  for (const serverId of serverIds) {
    const billing = byServer.get(serverId);

    if (!billing) {
      await createServerBilling({
        serverId,
        userId,
        intervalDays: settings.intervalDays,
        baseRenewalPrice: settings.defaultRenewalPrice,
        renewalPrice: settings.defaultRenewalPrice,
        autoRenew: false,
      });
      continue;
    }

    // Never repair (or otherwise touch) a billing row that belongs to a
    // different user; the caller may not own this server.
    if (billing.userId !== userId) continue;

    const repair =
      billing.status === "active" &&
      billing.baseRenewalPrice <= 0 &&
      billing.renewalPrice <= 0 &&
      settings.defaultRenewalPrice > 0;

    if (!repair) continue;

    await db
      .update(serverBilling)
      .set({
        intervalDays: settings.intervalDays,
        baseRenewalPrice: settings.defaultRenewalPrice,
        renewalPrice: settings.defaultRenewalPrice,
        nextRenewalAt: addDays(now, settings.intervalDays),
        updatedAt: now,
      })
      .where(eq(serverBilling.id, billing.id))
      .run();
  }
};

export const createServerBilling = async ({
  serverId,
  userId,
  storefrontItemId,
  intervalDays,
  baseRenewalPrice,
  renewalPrice,
  autoRenew,
  nextRenewalAt,
}: {
  serverId: string;
  userId: string;
  storefrontItemId?: string | null;
  intervalDays?: number;
  baseRenewalPrice?: number;
  renewalPrice?: number;
  autoRenew?: boolean;
  nextRenewalAt?: Date;
}) => {
  const settings = getRenewalSettings();
  const interval = Math.max(
    1,
    Math.floor(intervalDays ?? settings.intervalDays),
  );
  const base = Math.max(
    0,
    Math.floor(baseRenewalPrice ?? settings.defaultRenewalPrice),
  );
  const total = Math.max(0, Math.floor(renewalPrice ?? base));
  const next = nextRenewalAt ?? addDays(new Date(), interval);

  await db
    .insert(serverBilling)
    .values({
      serverId,
      userId,
      storefrontItemId: storefrontItemId ?? null,
      intervalDays: interval,
      baseRenewalPrice: base,
      renewalPrice: total,
      nextRenewalAt: next,
      autoRenew: autoRenew ?? false,
      status: "active",
    })
    .onConflictDoUpdate({
      target: serverBilling.serverId,
      set: {
        storefrontItemId: storefrontItemId ?? null,
        intervalDays: interval,
        baseRenewalPrice: base,
        renewalPrice: total,
        updatedAt: new Date(),
      },
    })
    .run();

  return getServerBilling(serverId);
};

export const setAutoRenew = async (
  userId: string,
  serverId: string,
  enabled: boolean,
) => {
  const billing = await getServerBilling(serverId);
  if (!billing || billing.userId !== userId) return false;

  await db
    .update(serverBilling)
    .set({ autoRenew: enabled, updatedAt: new Date() })
    .where(eq(serverBilling.serverId, serverId))
    .run();

  return true;
};

export const addServerEntitlement = async ({
  serverId,
  userId,
  storefrontItemId,
  cpu,
  memory,
  disk,
  renewalPrice,
}: {
  serverId: string;
  userId: string;
  storefrontItemId: string;
  cpu: number;
  memory: number;
  disk: number;
  renewalPrice: number;
}) => {
  const billing = await getServerBilling(serverId);
  if (!billing) {
    await createServerBilling({ serverId, userId });
  }

  const [entitlement] = await db
    .insert(serverEntitlement)
    .values({
      serverId,
      userId,
      storefrontItemId,
      cpu,
      memory,
      disk,
      renewalPrice: Math.max(0, Math.floor(renewalPrice)),
      createdAt: new Date(),
    })
    .returning();

  await db
    .update(serverBilling)
    .set({
      renewalPrice: sql`${serverBilling.renewalPrice} + ${Math.max(0, Math.floor(renewalPrice))}`,
      updatedAt: new Date(),
    })
    .where(eq(serverBilling.serverId, serverId))
    .run();

  return entitlement;
};

const resumeBillingServer = async (serverId: string) => {
  const adapter = getAdapter();

  try {
    const unsuspend = (
      adapter as typeof adapter & {
        unsuspendServer?: (serverId: string) => Promise<void>;
      }
    ).unsuspendServer;

    if (adapter.capabilities.servers.suspend && unsuspend) {
      await unsuspend.call(adapter, serverId);
    } else if (adapter.capabilities.servers.power) {
      await adapter.startServer(serverId);
    }
  } catch (cause) {
    console.error(`Unable to unsuspend server ${serverId}.`, cause);
  }
};

const suspendBilling = async (
  billing: typeof serverBilling.$inferSelect,
  reason: string,
) => {
  const adapter = getAdapter();
  let suspended = false;

  try {
    const suspend = (
      adapter as typeof adapter & {
        suspendServer?: (serverId: string) => Promise<void>;
      }
    ).suspendServer;

    if (adapter.capabilities.servers.suspend && suspend) {
      await suspend.call(adapter, billing.serverId);
      suspended = true;
    } else if (adapter.capabilities.servers.power) {
      await adapter.stopServer(billing.serverId);
      suspended = true;
    }
  } catch (cause) {
    console.error(
      `Unable to suspend server ${billing.serverId} for billing.`,
      cause,
    );
  }

  const settings = getRenewalSettings();
  const now = new Date();
  const deleteAt = addDays(now, settings.deleteAfterDays);

  await db
    .update(serverBilling)
    .set({
      status: "suspended",
      suspendedAt: now,
      deleteAt,
      deletionWarnedAt: null,
      updatedAt: now,
    })
    .where(eq(serverBilling.id, billing.id))
    .run();

  logActivity({
    action: "billing.suspend",
    severity: "warning",
    message: `Suspended server ${billing.serverId} for non-payment`,
    metadata: {
      serverId: billing.serverId,
      userId: billing.userId,
      reason,
      suspended,
      deleteAt,
    },
  });

  const autoRenewDisabled = reason === "auto-renew is disabled";
  const body = autoRenewDisabled
    ? `Your server was suspended because its renewal date passed and auto-renew is off. Renew it before ${deleteAt.toLocaleDateString()} or it will be deleted.`
    : `Your server was suspended because the renewal payment failed. It will be deleted on ${deleteAt.toLocaleDateString()}. Add credits to renew it before then.`;

  await notifyUser({
    userId: billing.userId,
    kind: "billing.suspended",
    title: autoRenewDisabled
      ? "Server suspended after renewal date"
      : "Server suspended for non-payment",
    body,
    url: "/server",
    email: {
      variables: {
        serverId: billing.serverId,
        reason: autoRenewDisabled
          ? "its renewal date passed and auto-renew is off"
          : "the renewal payment failed",
        deleteDate: deleteAt.toLocaleDateString(),
      },
    },
  });
};

const deleteBillingServer = async (
  billing: typeof serverBilling.$inferSelect,
) => {
  const adapter = getAdapter();

  try {
    await adapter.deleteServer(billing.serverId);
  } catch (cause) {
    const notFound = cause instanceof Error && /not found/i.test(cause.message);
    if (!notFound) {
      console.error(
        `Unable to delete server ${billing.serverId} for billing.`,
        cause,
      );
      return;
    }
  }

  await db
    .update(serverBilling)
    .set({ status: "deleted", updatedAt: new Date() })
    .where(eq(serverBilling.id, billing.id))
    .run();

  await deleteServerOwner(billing.serverId);

  logActivity({
    action: "billing.delete",
    severity: "warning",
    message: `Deleted server ${billing.serverId} after failed renewal`,
    metadata: { serverId: billing.serverId, userId: billing.userId },
  });

  await notifyUser({
    userId: billing.userId,
    kind: "billing.deleted",
    title: "Server deleted",
    body: "Your server was deleted because its renewal payment was not received in time.",
    url: "/storefront",
    email: { variables: { serverId: billing.serverId } },
  });
};

const DELETION_WARNING_MS = 24 * 60 * 60 * 1000;

/**
 * Warn the owner once, during the last day before a suspended server is
 * permanently deleted. `deletionWarnedAt` avoids duplicate emails when the
 * worker runs every few minutes.
 */
const notifyDeletionWarning = async (
  billing: typeof serverBilling.$inferSelect,
) => {
  if (!billing.deleteAt || billing.deletionWarnedAt) return;

  const remaining = billing.deleteAt.getTime() - Date.now();
  if (remaining > DELETION_WARNING_MS) return;

  const now = new Date();
  // Claim the warning atomically so concurrent workers cannot both send it.
  const claimed = await db
    .update(serverBilling)
    .set({ deletionWarnedAt: now, updatedAt: now })
    .where(
      and(
        eq(serverBilling.id, billing.id),
        isNull(serverBilling.deletionWarnedAt),
      ),
    )
    .returning({ id: serverBilling.id });

  if (claimed.length === 0) return;

  const deleteDate = billing.deleteAt.toLocaleDateString();

  await notifyUser({
    userId: billing.userId,
    kind: "billing.deletionWarning",
    title: "Server deletion warning",
    body: `Your server will be deleted on ${deleteDate}. Renew it before then to keep your files.`,
    url: "/server",
    email: {
      variables: { serverId: billing.serverId, deleteDate },
    },
  });
};

const notifyRenewalDue = async (
  billing: typeof serverBilling.$inferSelect,
  remainingMs: number,
) => {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 12 * 60 * 60 * 1000);
  const claimed = await db
    .update(serverBilling)
    .set({ lastNotifiedAt: now, updatedAt: now })
    .where(
      and(
        eq(serverBilling.id, billing.id),
        or(
          isNull(serverBilling.lastNotifiedAt),
          lte(serverBilling.lastNotifiedAt, cutoff),
        ),
      ),
    )
    .returning({ id: serverBilling.id });

  if (claimed.length === 0) return;

  const due = new Date(billing.nextRenewalAt).toLocaleDateString();
  const left =
    remainingMs > 0
      ? `${Math.max(1, Math.ceil(remainingMs / (60 * 60 * 1000)))} hours`
      : "now";

  await notifyUser({
    userId: billing.userId,
    kind: "billing.due",
    title: "Server renewal due soon",
    body: `Your server renews on ${due} for ${formatCredits(billing.renewalPrice)}. Auto-renew is off, so renew within ${left} or the server will be suspended.`,
    url: "/server",
    email: {
      variables: {
        serverId: billing.serverId,
        renewalDate: due,
        amount: formatCredits(billing.renewalPrice),
        timeLeft: left,
      },
    },
  });
};

const notifyRenewalFailure = async (
  billing: typeof serverBilling.$inferSelect,
  amount: number,
  reason: string,
) => {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 60 * 60 * 1000);
  const claimed = await db
    .update(serverBilling)
    .set({ lastNotifiedAt: now, updatedAt: now })
    .where(
      and(
        eq(serverBilling.id, billing.id),
        or(
          isNull(serverBilling.lastNotifiedAt),
          lte(serverBilling.lastNotifiedAt, cutoff),
        ),
      ),
    )
    .returning({ id: serverBilling.id });

  if (claimed.length === 0) return;

  await notifyUser({
    userId: billing.userId,
    kind: "billing.failed",
    title: "Renewal payment failed",
    body: `${reason} The renewal costs ${formatCredits(amount)}. Add credits before ${billing.nextRenewalAt.toLocaleDateString()} to keep the server online.`,
    url: "/storefront",
    email: {
      variables: {
        serverId: billing.serverId,
        reason,
        amount: formatCredits(amount),
        renewalDate: billing.nextRenewalAt.toLocaleDateString(),
      },
    },
  });
};

export const renewBillingNow = async (userId: string, serverId: string) => {
  const billing = await getServerBilling(serverId);
  if (!billing || billing.userId !== userId)
    throw new Error("Server billing was not found.");
  if (billing.status === "deleted")
    throw new Error("This server has already been deleted.");
  if (billing.renewalPrice <= 0)
    throw new Error("This server has nothing to renew.");

  // Guard against a double-submit: once the first request has advanced the
  // renewal date, a second request sees a billing period that is no longer
  // inside the renewal window and is rejected instead of charging again.
  if (!getRenewalWindow(billing).canRenew) {
    throw new Error("This server is not due for renewal yet.");
  }

  await spendCredits({
    userId,
    amount: billing.renewalPrice,
    kind: "renewal",
    reference: `renewal:${billing.id}:${billing.nextRenewalAt.getTime()}`,
    description: `Manual renewal for server ${billing.serverId}`,
    metadata: { serverId: billing.serverId, manual: true },
  });

  const now = new Date();
  const stillActive =
    billing.status !== "suspended" &&
    billing.nextRenewalAt.getTime() > now.getTime();
  const next = addDays(
    stillActive ? billing.nextRenewalAt : now,
    billing.intervalDays,
  );

  await db
    .update(serverBilling)
    .set({
      status: "active",
      nextRenewalAt: next,
      lastRenewedAt: now,
      suspendedAt: null,
      deleteAt: null,
      lastNotifiedAt: null,
      deletionWarnedAt: null,
      updatedAt: now,
    })
    .where(eq(serverBilling.id, billing.id))
    .run();

  if (billing.status === "suspended") {
    await resumeBillingServer(billing.serverId);
  }

  await notifyUser({
    userId,
    kind: "billing.renewed",
    title: "Server renewed",
    body: `Your server was renewed for another ${billing.intervalDays} days.`,
    url: "/storefront",
    email: {
      variables: {
        serverId: billing.serverId,
        intervalDays: billing.intervalDays,
      },
    },
  });

  logActivity({
    userId,
    action: "billing.renew",
    message: `Renewed server ${billing.serverId}`,
    metadata: { serverId: billing.serverId, amount: billing.renewalPrice },
  });

  return { amount: billing.renewalPrice, nextRenewalAt: next };
};

export const runRenewals = async () => {
  const settings = getRenewalSettings();
  if (!settings.enabled)
    return { processed: 0, renewed: 0, suspended: 0, deleted: 0 };

  const now = new Date();
  const retryWindow = settings.retryHours * 60 * 60 * 1000;
  const billings = await db
    .select()
    .from(serverBilling)
    .where(inArray(serverBilling.status, ["active", "suspended"]));

  let renewed = 0;
  let suspended = 0;
  let deleted = 0;

  for (const billing of billings) {
    if (billing.status === "suspended") {
      if (billing.deleteAt && billing.deleteAt.getTime() <= now.getTime()) {
        await deleteBillingServer(billing);
        deleted += 1;
        continue;
      }

      await notifyDeletionWarning(billing);

      if (billing.renewalPrice <= 0) {
        const next = addDays(billing.nextRenewalAt, billing.intervalDays);
        await db
          .update(serverBilling)
          .set({
            status: "active",
            nextRenewalAt:
              next.getTime() <= now.getTime()
                ? addDays(now, billing.intervalDays)
                : next,
            lastRenewedAt: now,
            suspendedAt: null,
            deleteAt: null,
            lastNotifiedAt: null,
            deletionWarnedAt: null,
            updatedAt: now,
          })
          .where(eq(serverBilling.id, billing.id))
          .run();

        await resumeBillingServer(billing.serverId);
        renewed += 1;
        continue;
      }

      const lastAttempt = billing.lastNotifiedAt?.getTime() ?? 0;
      if (now.getTime() - lastAttempt < 60 * 60 * 1000) continue;

      if (!billing.autoRenew) {
        continue;
      }

      const reference = `renewal:${billing.id}:${billing.nextRenewalAt.getTime()}`;

      try {
        await spendCredits({
          userId: billing.userId,
          amount: billing.renewalPrice,
          kind: "renewal",
          reference,
          description: `Renewal for server ${billing.serverId}`,
          metadata: { serverId: billing.serverId },
        });

        const next = addDays(billing.nextRenewalAt, billing.intervalDays);
        await db
          .update(serverBilling)
          .set({
            status: "active",
            nextRenewalAt:
              next.getTime() <= now.getTime()
                ? addDays(now, billing.intervalDays)
                : next,
            lastRenewedAt: now,
            suspendedAt: null,
            deleteAt: null,
            lastNotifiedAt: null,
            deletionWarnedAt: null,
            updatedAt: now,
          })
          .where(eq(serverBilling.id, billing.id))
          .run();

        await resumeBillingServer(billing.serverId);

        await notifyUser({
          userId: billing.userId,
          kind: "billing.renewed",
          title: "Server renewed",
          body: `Your server was renewed for another ${billing.intervalDays} days.`,
          url: "/storefront",
          email: {
            variables: {
              serverId: billing.serverId,
              intervalDays: billing.intervalDays,
            },
          },
        });

        renewed += 1;
      } catch (cause) {
        if (cause instanceof CreditError) {
          await notifyRenewalFailure(
            billing,
            billing.renewalPrice,
            cause.message,
          );
        } else {
          console.error(`Unable to renew server ${billing.serverId}.`, cause);
        }
      }

      continue;
    }

    const due = billing.nextRenewalAt.getTime();
    const renewalWindow = getRenewalWindow(billing, now.getTime());
    const processWindow = Math.max(
      retryWindow,
      renewalWindow.intervalMs * RENEWAL_WINDOW_FRACTION,
    );

    if (due > now.getTime() + processWindow) continue;

    if (!billing.autoRenew) {
      if (billing.renewalPrice <= 0) {
        if (due <= now.getTime()) {
          const next = addDays(billing.nextRenewalAt, billing.intervalDays);
          await db
            .update(serverBilling)
            .set({
              nextRenewalAt:
                next.getTime() <= now.getTime()
                  ? addDays(now, billing.intervalDays)
                  : next,
              lastRenewedAt: now,
              lastNotifiedAt: null,
              deletionWarnedAt: null,
              updatedAt: now,
            })
            .where(eq(serverBilling.id, billing.id))
            .run();

          renewed += 1;
        }
        continue;
      }

      if (due <= now.getTime()) {
        await suspendBilling(billing, "auto-renew is disabled");
        suspended += 1;
      } else if (renewalWindow.canRenew) {
        await notifyRenewalDue(billing, renewalWindow.remainingMs);
      }
      continue;
    }

    if (billing.renewalPrice > 0) {
      const reference = `renewal:${billing.id}:${billing.nextRenewalAt.getTime()}`;

      try {
        await spendCredits({
          userId: billing.userId,
          amount: billing.renewalPrice,
          kind: "renewal",
          reference,
          description: `Renewal for server ${billing.serverId}`,
          metadata: { serverId: billing.serverId },
        });
      } catch (cause) {
        if (cause instanceof CreditError) {
          if (due <= now.getTime()) {
            await suspendBilling(billing, cause.message);
            suspended += 1;
          } else {
            await notifyRenewalFailure(
              billing,
              billing.renewalPrice,
              cause.message,
            );
          }
          continue;
        }

        console.error(
          `Unable to charge renewal for server ${billing.serverId}.`,
          cause,
        );
        continue;
      }
    }

    const next = addDays(billing.nextRenewalAt, billing.intervalDays);
    await db
      .update(serverBilling)
      .set({
        nextRenewalAt:
          next.getTime() <= now.getTime()
            ? addDays(now, billing.intervalDays)
            : next,
        lastRenewedAt: now,
        lastNotifiedAt: null,
        deletionWarnedAt: null,
        updatedAt: now,
      })
      .where(eq(serverBilling.id, billing.id))
      .run();

    await notifyUser({
      userId: billing.userId,
      kind: "billing.renewed",
      title: "Server renewed",
      body: `Your server was renewed for another ${billing.intervalDays} days.`,
      url: "/storefront",
      email: {
        variables: {
          serverId: billing.serverId,
          intervalDays: billing.intervalDays,
        },
      },
    });

    renewed += 1;
  }

  return { processed: billings.length, renewed, suspended, deleted };
};

let running = false;
let lastRun = 0;

export const maybeRunRenewals = async (intervalMs = 5 * 60 * 1000) => {
  if (running || Date.now() - lastRun < intervalMs) return;

  running = true;
  lastRun = Date.now();

  try {
    await runRenewals();
  } catch (cause) {
    console.error("Renewal worker failed.", cause);
  } finally {
    running = false;
  }
};

export const getExpiringBillings = async (userId: string, days = 7) => {
  const threshold = addDays(new Date(), days);

  return db
    .select()
    .from(serverBilling)
    .where(
      and(
        eq(serverBilling.userId, userId),
        eq(serverBilling.status, "active"),
        lte(serverBilling.nextRenewalAt, threshold),
      ),
    );
};
