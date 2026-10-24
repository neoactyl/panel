import { randomBytes } from 'node:crypto';
import { desc, eq, sql } from 'drizzle-orm';
import { addCredits } from '#lib/server/billing/credits.ts';
import { db } from '#lib/server/db/index.ts';
import { user } from '#lib/server/db/auth.schema.ts';
import { referral, referralProfile } from '#lib/server/db/ops.ts';
import { logActivity } from '#lib/server/system/logs.ts';
import { notifyUser } from '#lib/server/system/notifications.ts';
import { getBool, getNumber } from '#lib/server/config/settings.ts';
import { addUserQuota } from '#lib/server/quota/user.ts';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const makeCode = () => {
	const bytes = randomBytes(8);
	let code = '';
	for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length];
	return code;
};

export const getReferralCode = async (userId: string): Promise<string> => {
	const existing = await db
		.select({ code: referralProfile.code })
		.from(referralProfile)
		.where(eq(referralProfile.userId, userId))
		.get();

	if (existing) return existing.code;

	for (let attempt = 0; attempt < 5; attempt += 1) {
		const code = makeCode();

		try {
			await db
				.insert(referralProfile)
				.values({ userId, code, createdAt: new Date() })
				.run();
			return code;
		} catch {
			const raced = await db
				.select({ code: referralProfile.code })
				.from(referralProfile)
				.where(eq(referralProfile.userId, userId))
				.get();
			if (raced) return raced.code;
		}
	}

	throw new Error('Could not generate a referral code.');
};

export const resolveReferralCode = async (code: string) => {
	const normalized = code.trim().toUpperCase();
	if (!normalized) return null;

	return (
		(await db
			.select({
				userId: referralProfile.userId,
				code: referralProfile.code,
				name: user.name
			})
			.from(referralProfile)
			.innerJoin(user, eq(user.id, referralProfile.userId))
			.where(eq(referralProfile.code, normalized))
			.get()) ?? null
	);
};

export const applyReferral = async (inviteeId: string, code: string) => {
	if (!getBool('invites.enabled')) return null;

	const profile = await resolveReferralCode(code);
	if (!profile) return null;
	if (profile.userId === inviteeId) return null;

	const existing = await db
		.select({ id: referral.id })
		.from(referral)
		.where(eq(referral.inviteeId, inviteeId))
		.get();

	if (existing) return null;

	const rewards = {
		rewardCoins: Math.max(0, getNumber('invites.rewardCoins')),
		rewardCpu: Math.max(0, getNumber('invites.rewardCpu')),
		rewardMemory: Math.max(0, getNumber('invites.rewardMemory')),
		rewardDisk: Math.max(0, getNumber('invites.rewardDisk')),
		rewardServerSlots: Math.max(0, getNumber('invites.rewardServerSlots'))
	};

	await db
		.insert(referral)
		.values({
			inviterId: profile.userId,
			inviteeId,
			code: profile.code,
			...rewards,
			createdAt: new Date()
		})
		.run();

	if (rewards.rewardCoins > 0) {
		await addCredits({
			userId: profile.userId,
			amount: rewards.rewardCoins,
			kind: 'referral',
			reference: `referral:${inviteeId}`,
			description: 'Referral reward',
			metadata: { inviteeId }
		});
	}

	if (rewards.rewardCpu || rewards.rewardMemory || rewards.rewardDisk || rewards.rewardServerSlots) {
		await addUserQuota(profile.userId, {
			cpu: rewards.rewardCpu,
			memory: rewards.rewardMemory,
			disk: rewards.rewardDisk,
			maxServers: rewards.rewardServerSlots
		});
	}

	logActivity({
		userId: profile.userId,
		action: 'referral.completed',
		severity: 'info',
		message: 'A referred user finished registration.',
		metadata: { inviteeId, code: profile.code, ...rewards }
	});

	await notifyUser({
		userId: profile.userId,
		kind: 'referral',
		title: 'Referral reward earned',
		body:
			rewards.rewardCoins > 0
				? `You earned ${rewards.rewardCoins} credits from a referral.`
				: 'Someone joined using your referral link.',
		url: '/invite'
	});

	return { inviterId: profile.userId, ...rewards };
};

export type ReferralStats = {
	enabled: boolean;
	code: string;
	total: number;
	rewardCoins: number;
	referrals: Array<{ id: string; name: string; email: string; createdAt: string }>;
};

export const getReferralStats = async (userId: string): Promise<ReferralStats> => {
	const enabled = getBool('invites.enabled');
	const code = await getReferralCode(userId);

	const rows = await db
		.select({
			id: referral.id,
			name: user.name,
			email: user.email,
			createdAt: referral.createdAt
		})
		.from(referral)
		.innerJoin(user, eq(user.id, referral.inviteeId))
		.where(eq(referral.inviterId, userId))
		.orderBy(desc(referral.createdAt));

	const totals = await db
		.select({
			rewardCoins: sql<number>`coalesce(sum(${referral.rewardCoins}), 0)`
		})
		.from(referral)
		.where(eq(referral.inviterId, userId))
		.get();

	return {
		enabled,
		code,
		total: rows.length,
		rewardCoins: totals?.rewardCoins ?? 0,
		referrals: rows.map((row) => ({
			id: row.id,
			name: row.name,
			email: row.email,
			createdAt: row.createdAt.toISOString()
		}))
	};
};
