import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { serverOwnership } from '#lib/server/db/ops.ts';

/**
 * Ownership records for adapters that cannot link panel accounts to Neoactyl
 * accounts. They map a panel server id to the Neoactyl user that created it.
 */
export const getServerOwner = async (serverId: string): Promise<string | undefined> => {
	const row = await db
		.select({ userId: serverOwnership.userId })
		.from(serverOwnership)
		.where(eq(serverOwnership.serverId, serverId))
		.get();

	return row?.userId;
};

export const recordServerOwner = async (serverId: string, userId: string) => {
	await db.insert(serverOwnership).values({ serverId, userId }).onConflictDoNothing();
};

export const deleteServerOwner = async (serverId: string) => {
	await db.delete(serverOwnership).where(eq(serverOwnership.serverId, serverId));
};

export const listServerIdsForUser = async (userId: string): Promise<string[]> => {
	const rows = await db
		.select({ serverId: serverOwnership.serverId })
		.from(serverOwnership)
		.where(eq(serverOwnership.userId, userId));

	return rows.map((row) => row.serverId);
};
