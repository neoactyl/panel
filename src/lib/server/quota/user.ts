import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { userQuota } from '#lib/server/db/ops.ts';
import { getNumber, getQuota } from '#lib/server/config/settings.ts';

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

export const getEffectiveQuota = async (userId?: string | null): Promise<EffectiveQuota> => {
	const defaults = getQuota();
	const maxServers = getNumber('server.maxPerUser');

	if (!userId) return { ...defaults, maxServers, overridden: false };

	const row = await db
		.select({
			cpu: userQuota.cpu,
			memory: userQuota.memory,
			disk: userQuota.disk,
			maxServers: userQuota.maxServers,
			maxDatabases: userQuota.maxDatabases,
			maxAllocations: userQuota.maxAllocations
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
		overridden: true
	};
};

export const getUserQuotaOverrides = async (userId: string): Promise<UserQuotaOverrides | null> => {
	const row = await db
		.select({
			cpu: userQuota.cpu,
			memory: userQuota.memory,
			disk: userQuota.disk,
			maxServers: userQuota.maxServers,
			maxDatabases: userQuota.maxDatabases,
			maxAllocations: userQuota.maxAllocations
		})
		.from(userQuota)
		.where(eq(userQuota.userId, userId))
		.get();

	return row ?? null;
};

export const setUserQuota = async (userId: string, values: UserQuotaOverrides) => {
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
			updatedAt: new Date()
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
				updatedAt: new Date()
			}
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
	}
) => {
	const current = await getEffectiveQuota(userId);
	const next: UserQuotaOverrides = {
		cpu: Math.max(0, current.cpu + (delta.cpu ?? 0)),
		memory: Math.max(0, current.memory + (delta.memory ?? 0)),
		disk: Math.max(0, current.disk + (delta.disk ?? 0)),
		maxServers:
			current.maxServers === 0
				? 0
				: Math.max(0, current.maxServers + (delta.maxServers ?? 0)),
		maxDatabases:
			current.maxDatabases === 0
				? 0
				: Math.max(0, current.maxDatabases + (delta.maxDatabases ?? 0)),
		maxAllocations:
			current.maxAllocations === 0
				? 0
				: Math.max(0, current.maxAllocations + (delta.maxAllocations ?? 0))
	};

	await setUserQuota(userId, next);
	return { ...next, overridden: true };
};
