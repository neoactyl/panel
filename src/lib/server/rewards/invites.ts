import { and, eq, sql } from 'drizzle-orm';
import { addCreditsWith, getCreditBalance } from '#lib/server/billing/credits.ts';
import { account } from '#lib/server/db/auth.schema.ts';
import { db } from '#lib/server/db/index.ts';
import {
	discordInviteClaim,
	discordProfile,
	invitedUser,
	inviter
} from '#lib/server/db/ops.ts';
import {
	findInviteTier,
	findNextInviteTier,
	getDiscordRewardConfig
} from '#lib/server/rewards/config.ts';
import { logActivity } from '#lib/server/system/logs.ts';
import { notifyUser } from '#lib/server/system/notifications.ts';

const DISCORD_EPOCH = 1420070400000n;

export class InviteRewardError extends Error {
	code: 'DISABLED' | 'NOT_LINKED' | 'NO_INVITES' | 'CONFLICT';

	constructor(message: string, code: InviteRewardError['code']) {
		super(message);
		this.name = 'InviteRewardError';
		this.code = code;
	}
}

export type DiscordInviteEvent =
	| {
			type: 'member_join';
			guildId: string;
			memberId: string;
			inviterId: string;
			memberIsBot: boolean;
			joinedAt: string;
	  }
	| {
			type: 'member_leave';
			guildId: string;
			memberId: string;
	  };

export const snowflakeCreatedAt = (id: string): Date | null => {
	if (!/^\d{15,20}$/.test(id)) return null;

	const timestamp = (BigInt(id) >> 22n) + DISCORD_EPOCH;
	const date = new Date(Number(timestamp));

	return Number.isNaN(date.getTime()) ? null : date;
};

const discordIdentity = async (userId: string) => {
	const rows = await db
		.select({ accountId: account.accountId, providerId: account.providerId })
		.from(account)
		.where(eq(account.userId, userId))
		.all();

	return rows.find((row) => row.providerId === 'discord') ?? null;
};

export const recordInviteJoin = async ({
	guildId,
	memberId,
	inviterId,
	memberIsBot,
	joinedAt
}: Extract<DiscordInviteEvent, { type: 'member_join' }>) => {
	const config = getDiscordRewardConfig();

	if (!config.inviteTrackingEnabled) return { recorded: false as const, reason: 'disabled' as const };
	if (memberIsBot || memberId === inviterId) {
		return { recorded: false as const, reason: 'ignored' as const };
	}

	const accountCreatedAt = snowflakeCreatedAt(memberId);

	if (!accountCreatedAt) {
		return { recorded: false as const, reason: 'invalid_member' as const };
	}

	const joined = new Date(joinedAt);

	if (Number.isNaN(joined.getTime())) {
		return { recorded: false as const, reason: 'invalid_join_date' as const };
	}

	const minimumAge = config.inviteMinAccountAgeDays * 24 * 60 * 60 * 1000;
	const counted = joined.getTime() - accountCreatedAt.getTime() >= minimumAge;

	return db.transaction(async (tx) => {
		await tx
			.insert(inviter)
			.values({ discordId: inviterId, createdAt: new Date() })
			.onConflictDoNothing()
			.run();

		const inserted = await tx
			.insert(invitedUser)
			.values({
				discordId: memberId,
				inviterId,
				guildId,
				joinedAt: joined,
				accountCreatedAt,
				counted,
				stillInServer: true,
				createdAt: new Date()
			})
			.onConflictDoNothing()
			.returning({ discordId: invitedUser.discordId })
			.get();

		if (!inserted) {
			await tx
				.update(invitedUser)
				.set({ stillInServer: true })
				.where(eq(invitedUser.discordId, memberId))
				.run();

			return { recorded: false as const, reason: 'duplicate' as const };
		}

		if (counted) {
			await tx
				.update(inviter)
				.set({
					currentInviteCount: sql`${inviter.currentInviteCount} + 1`,
					totalLifetimeInvites: sql`${inviter.totalLifetimeInvites} + 1`,
					updatedAt: new Date()
				})
				.where(eq(inviter.discordId, inviterId))
				.run();
		}

		return { recorded: true as const, counted };
	});
};

export const recordInviteLeave = async ({
	guildId,
	memberId
}: Extract<DiscordInviteEvent, { type: 'member_leave' }>) => {
	await db
		.update(invitedUser)
		.set({ stillInServer: false })
		.where(and(eq(invitedUser.discordId, memberId), eq(invitedUser.guildId, guildId)))
		.run();

	return { recorded: true as const };
};

export const getDiscordInviteState = async (userId: string) => {
	const config = getDiscordRewardConfig();
	const discord = await discordIdentity(userId);

	if (!discord) {
		return {
			enabled: config.inviteTrackingEnabled,
			linked: false,
			discordId: null,
			username: '',
			current: 0,
			lifetime: 0,
			claimable: 0,
			tier: null,
			nextTier: config.inviteTiers[0] ?? null,
			requireStillMember: config.inviteRequireStillMember,
			minAccountAgeDays: config.inviteMinAccountAgeDays,
			tiers: config.inviteTiers
		};
	}

	const [record, profile] = await Promise.all([
		db.select().from(inviter).where(eq(inviter.discordId, discord.accountId)).get(),
		db
			.select({ username: discordProfile.username })
			.from(discordProfile)
			.where(eq(discordProfile.userId, userId))
			.get()
	]);

	const conditions = [
		eq(invitedUser.inviterId, discord.accountId),
		eq(invitedUser.counted, true)
	];

	if (config.inviteRequireStillMember) {
		conditions.push(eq(invitedUser.stillInServer, true));
	}

	const valid = await db
		.select({ discordId: invitedUser.discordId })
		.from(invitedUser)
		.where(and(...conditions))
		.all();

	const current = valid.length;
	const tier = findInviteTier(current, config.inviteTiers) ?? null;

	return {
		enabled: config.inviteTrackingEnabled,
		linked: true,
		discordId: discord.accountId,
		username: profile?.username ?? '',
		current,
		lifetime: record?.totalLifetimeInvites ?? 0,
		claimable: tier?.coins ?? 0,
		tier,
		nextTier: findNextInviteTier(current, config.inviteTiers) ?? null,
		requireStillMember: config.inviteRequireStillMember,
		minAccountAgeDays: config.inviteMinAccountAgeDays,
		tiers: config.inviteTiers
	};
};

export const claimDiscordInvites = async (userId: string) => {
	const config = getDiscordRewardConfig();

	if (!config.inviteTrackingEnabled) {
		throw new InviteRewardError('Discord invite rewards are currently disabled.', 'DISABLED');
	}

	const discord = await discordIdentity(userId);

	if (!discord) {
		throw new InviteRewardError('Link your Discord account before claiming invites.', 'NOT_LINKED');
	}

	const claimId = crypto.randomUUID();

	const result = await db.transaction(async (tx) => {
		const record = await tx
			.select()
			.from(inviter)
			.where(eq(inviter.discordId, discord.accountId))
			.get();

		if (!record || record.currentInviteCount <= 0) {
			throw new InviteRewardError('You do not have any unclaimed invites yet.', 'NO_INVITES');
		}

		const conditions = [
			eq(invitedUser.inviterId, discord.accountId),
			eq(invitedUser.counted, true)
		];

		if (config.inviteRequireStillMember) {
			conditions.push(eq(invitedUser.stillInServer, true));
		}

		const valid = await tx
			.select({ discordId: invitedUser.discordId })
			.from(invitedUser)
			.where(and(...conditions))
			.all();

		const inviteCount = valid.length;
		const tier = findInviteTier(inviteCount, config.inviteTiers);

		if (!tier || inviteCount < 1) {
			throw new InviteRewardError('You have not reached the invite reward threshold yet.', 'NO_INVITES');
		}

		const claimed = await tx
			.update(inviter)
			.set({ currentInviteCount: 0, updatedAt: new Date() })
			.where(
				and(
					eq(inviter.discordId, discord.accountId),
					eq(inviter.currentInviteCount, record.currentInviteCount)
				)
			)
			.returning({ discordId: inviter.discordId })
			.get();

		if (!claimed) {
			throw new InviteRewardError(
				'Your invite balance changed while claiming. Please try again.',
				'CONFLICT'
			);
		}

		await tx
			.update(invitedUser)
			.set({ counted: false })
			.where(and(eq(invitedUser.inviterId, discord.accountId), eq(invitedUser.counted, true)))
			.run();

		await tx
			.insert(discordInviteClaim)
			.values({
				id: claimId,
				userId,
				inviterId: discord.accountId,
				inviteCount,
				rewardCoins: tier.coins,
				claimedAt: new Date()
			})
			.run();

		if (tier.coins > 0) {
			await addCreditsWith(tx, {
				userId,
				amount: tier.coins,
				kind: 'discord_invites',
				reference: `discord-invites:${claimId}`,
				description: `Discord invite reward (${inviteCount} invite${inviteCount === 1 ? '' : 's'})`,
				metadata: {
					guildId: config.legacyGuildId || config.j4rGuildIds[0] || '',
					inviterId: discord.accountId,
					inviteCount,
					tier: tier.invites
				}
			});
		}

		return { inviteCount, reward: tier.coins, tier: tier.invites };
	});

	logActivity({
		userId,
		action: 'discord.invites.claim',
		severity: 'info',
		message: 'Claimed Discord invite rewards.',
		metadata: {
			inviterId: discord.accountId,
			inviteCount: result.inviteCount,
			reward: result.reward,
			tier: result.tier
		}
	});

	await notifyUser({
		userId,
		kind: 'discord',
		title: 'Discord invite reward claimed',
		body:
			result.reward > 0
				? `${result.reward} credits were added for ${result.inviteCount} invite${result.inviteCount === 1 ? '' : 's'}.`
				: `Your ${result.inviteCount} Discord invites were verified.`,
		url: '/invite'
	});

	return {
		...result,
		balance: await getCreditBalance(userId)
	};
};
