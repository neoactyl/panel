import { and, eq } from 'drizzle-orm';
import { addCreditsWith } from '#lib/server/billing/credits.ts';
import { account } from '#lib/server/db/auth.schema.ts';
import { db } from '#lib/server/db/index.ts';
import { discordBoostReward } from '#lib/server/db/ops.ts';
import { getDiscordRewardConfig } from '#lib/server/rewards/config.ts';
import { logActivity } from '#lib/server/system/logs.ts';
import { notifyUser } from '#lib/server/system/notifications.ts';

export type DiscordBoostEvent = {
	type: 'boost';
	guildId: string;
	discordId: string;
	/** ISO timestamp of the boost, taken from Discord's `premiumSince`. */
	premiumSince: string;
};

const linkedUserId = async (discordId: string) => {
	const row = await db
		.select({ userId: account.userId })
		.from(account)
		.where(and(eq(account.providerId, 'discord'), eq(account.accountId, discordId)))
		.get();

	return row?.userId ?? null;
};

/**
 * Pay the configured per-boost reward. The `(guild, member, premium_since)`
 * unique index makes the insert the single point that decides whether this
 * boost has already been paid, so a duplicated gateway event cannot double
 * credit an account.
 */
export const recordBoostReward = async (event: DiscordBoostEvent) => {
	const config = getDiscordRewardConfig();

	if (config.boostRewardCoins <= 0) {
		return { recorded: false as const, reason: 'disabled' as const };
	}

	const premiumSince = new Date(event.premiumSince);

	if (Number.isNaN(premiumSince.getTime())) {
		return { recorded: false as const, reason: 'invalid_boost_date' as const };
	}

	const userId = await linkedUserId(event.discordId);
	const reward = config.boostRewardCoins;

	const result = await db.transaction(async (tx) => {
		const inserted = await tx
			.insert(discordBoostReward)
			.values({
				guildId: event.guildId,
				discordId: event.discordId,
				premiumSince,
				userId,
				rewardCoins: reward,
				creditedAt: null,
				createdAt: new Date()
			})
			.onConflictDoNothing()
			.returning({ id: discordBoostReward.id })
			.get();

		if (!inserted) {
			return { recorded: false as const, reason: 'duplicate' as const };
		}

		if (!userId) {
			return {
				recorded: true as const,
				credited: false as const,
				reason: 'not_linked' as const,
				reward: 0
			};
		}

		await addCreditsWith(tx, {
			userId,
			amount: reward,
			kind: 'discord_boost',
			reference: `discord-boost:${inserted.id}`,
			description: 'Discord server boost reward',
			metadata: {
				guildId: event.guildId,
				discordId: event.discordId,
				premiumSince: event.premiumSince
			}
		});

		await tx
			.update(discordBoostReward)
			.set({ creditedAt: new Date() })
			.where(eq(discordBoostReward.id, inserted.id))
			.run();

		return {
			recorded: true as const,
			credited: true as const,
			reward,
			userId
		};
	});

	if (result.recorded && !result.credited) {
		logActivity({
			action: 'discord.boost.unlinked',
			severity: 'warning',
			message: 'Tracked a Discord boost for a member without a linked panel account.',
			metadata: {
				guildId: event.guildId,
				discordId: event.discordId,
				premiumSince: event.premiumSince
			}
		});

		return result;
	}

	if (result.recorded && result.credited) {
		logActivity({
			userId: result.userId,
			action: 'discord.boost.reward',
			message: `Awarded ${result.reward} credits for a Discord boost.`,
			metadata: {
				guildId: event.guildId,
				discordId: event.discordId,
				premiumSince: event.premiumSince,
				reward: result.reward
			}
		});

		await notifyUser({
			userId: result.userId,
			kind: 'discord',
			title: 'Discord boost reward',
			body: `${result.reward} credits were added to your balance for boosting the Discord server.`,
			url: '/invite'
		});
	}

	return result;
};
