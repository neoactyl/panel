import { eq, sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { db } from "#lib/server/db/index.ts";
import { userQuota } from "#lib/server/db/ops.ts";
import { getNumber, getQuota } from "#lib/server/config/settings.ts";

export type EffectiveQuota = {
  cpu: number;
  memory: number;
  disk: number;
  maxServers: number;
  maxDatabases: number;
  maxAllocations: number;
  overridden: boolean;
};

export type UserQuotaOverrides = {
  cpu: number | null;
  memory: number | null;
  disk: number | null;
  maxServers: number | null;
  maxDatabases: number | null;
  maxAllocations: number | null;
};

export const getEffectiveQuota = async (
  userId?: string | null,
): Promise<EffectiveQuota> => {
  const defaults = getQuota();
  const maxServers = getNumber("server.maxPerUser");

  if (!userId) return { ...defaults, maxServers, overridden: false };

  const row = await db
    .select({
      cpu: userQuota.cpu,
      memory: userQuota.memory,
      disk: userQuota.disk,
      maxServers: userQuota.maxServers,
      maxDatabases: userQuota.maxDatabases,
      maxAllocations: userQuota.maxAllocations,
    })
    .from(userQuota)
    .where(eq(userQuota.userId, userId))
    .get();

  if (!row) return { ...defaults, maxServers, overridden: false };

  return {
    cpu: row.cpu ?? defaults.cpu,
    memory: row.memory ?? defaults.memory,
    disk: row.disk ?? defaults.disk,
    maxServers: row.maxServers ?? maxServers,
    maxDatabases: row.maxDatabases ?? defaults.maxDatabases,
    maxAllocations: row.maxAllocations ?? defaults.maxAllocations,
    overridden: true,
  };
};

export const getUserQuotaOverrides = async (
  userId: string,
): Promise<UserQuotaOverrides | null> => {
  const row = await db
    .select({
      cpu: userQuota.cpu,
      memory: userQuota.memory,
      disk: userQuota.disk,
      maxServers: userQuota.maxServers,
      maxDatabases: userQuota.maxDatabases,
      maxAllocations: userQuota.maxAllocations,
    })
    .from(userQuota)
    .where(eq(userQuota.userId, userId))
    .get();

  return row ?? null;
};

export const setUserQuota = async (
  userId: string,
  values: UserQuotaOverrides,
) => {
  const empty =
    values.cpu === null &&
    values.memory === null &&
    values.disk === null &&
    values.maxServers === null &&
    values.maxDatabases === null &&
    values.maxAllocations === null;

  if (empty) {
    await db.delete(userQuota).where(eq(userQuota.userId, userId)).run();
    return;
  }

  await db
    .insert(userQuota)
    .values({
      userId,
      cpu: values.cpu,
      memory: values.memory,
      disk: values.disk,
      maxServers: values.maxServers,
      maxDatabases: values.maxDatabases,
      maxAllocations: values.maxAllocations,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userQuota.userId,
      set: {
        cpu: values.cpu,
        memory: values.memory,
        disk: values.disk,
        maxServers: values.maxServers,
        maxDatabases: values.maxDatabases,
        maxAllocations: values.maxAllocations,
        updatedAt: new Date(),
      },
    })
    .run();
};

export const addUserQuota = async (
  userId: string,
  delta: {
    cpu?: number;
    memory?: number;
    disk?: number;
    maxServers?: number;
    maxDatabases?: number;
    maxAllocations?: number;
  },
) => {
  const defaults = getQuota();
  const defaultMaxServers = getNumber("server.maxPerUser");
  const now = new Date();

  const dCpu = delta.cpu ?? 0;
  const dMemory = delta.memory ?? 0;
  const dDisk = delta.disk ?? 0;
  const dServers = delta.maxServers ?? 0;
  const dDatabases = delta.maxDatabases ?? 0;
  const dAllocations = delta.maxAllocations ?? 0;

  // A `0` limit means unlimited, so it must stay `0` instead of growing.
  const insertMaxServers =
    defaultMaxServers === 0 ? 0 : Math.max(0, defaultMaxServers + dServers);
  const insertMaxDatabases =
    defaults.maxDatabases === 0
      ? 0
      : Math.max(0, defaults.maxDatabases + dDatabases);
  const insertMaxAllocations =
    defaults.maxAllocations === 0
      ? 0
      : Math.max(0, defaults.maxAllocations + dAllocations);

  const grow = (column: AnySQLiteColumn, fallback: number, amount: number) =>
    sql`MAX(0, COALESCE(${column}, ${fallback}) + ${amount})`;

  const growUnlessUnlimited = (
    column: AnySQLiteColumn,
    fallback: number,
    amount: number,
  ) =>
    sql`CASE WHEN COALESCE(${column}, ${fallback}) = 0 THEN 0 ELSE MAX(0, COALESCE(${column}, ${fallback}) + ${amount}) END`;

  // Apply the delta in SQL so two concurrent grants cannot overwrite each
  // other. `COALESCE` keeps the "null means use the global default" behaviour.
  await db
    .insert(userQuota)
    .values({
      userId,
      cpu: Math.max(0, defaults.cpu + dCpu),
      memory: Math.max(0, defaults.memory + dMemory),
      disk: Math.max(0, defaults.disk + dDisk),
      maxServers: insertMaxServers,
      maxDatabases: insertMaxDatabases,
      maxAllocations: insertMaxAllocations,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userQuota.userId,
      set: {
        cpu: grow(userQuota.cpu, defaults.cpu, dCpu),
        memory: grow(userQuota.memory, defaults.memory, dMemory),
        disk: grow(userQuota.disk, defaults.disk, dDisk),
        maxServers: growUnlessUnlimited(
          userQuota.maxServers,
          defaultMaxServers,
          dServers,
        ),
        maxDatabases: growUnlessUnlimited(
          userQuota.maxDatabases,
          defaults.maxDatabases,
          dDatabases,
        ),
        maxAllocations: growUnlessUnlimited(
          userQuota.maxAllocations,
          defaults.maxAllocations,
          dAllocations,
        ),
        updatedAt: now,
      },
    })
    .run();

  return getEffectiveQuota(userId);
};
