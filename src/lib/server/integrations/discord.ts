import { eq } from 'drizzle-orm';
import { fetchWithTimeout } from '#lib/http.ts';
import { addCredits, getCreditBalance } from '#lib/server/billing/credits.ts';
import { account } from '#lib/server/db/auth.schema.ts';
import { db } from '#lib/server/db/index.ts';
import { discordProfile } from '#lib/server/db/ops.ts';
import { logActivity } from '#lib/server/system/logs.ts';
import { notifyUser } from '#lib/server/system/notifications.ts';
import { getBool, getNumber, getSetting } from '#lib/server/config/settings.ts';

export type DiscordCode =
	| 'NOT_LINKED'
	| 'NOT_CONFIGURED'
	| 'NOT_MEMBER'
	| 'MISSING_ROLE'
	| 'DISABLED'
	| 'ALREADY_CLAIMED'
	| 'LOOKUP_FAILED';

export class DiscordError extends Error {
	code: DiscordCode;

	constructor(message: string, code: DiscordCode) {
		super(message);
		this.name = 'DiscordError';
		this.code = code;
	}
}

const API = 'https://discord.com/api/v10';
const SYNC_TTL = 5 * 60 * 1000;

export type DiscordState = {
	linked: boolean;
	guildConfigured: boolean;
	guildId: string;
	discordId: string | null;
	username: string;
	member: boolean;
	roles: string[];
	requiredRoleId: string;
	hasRequiredRole: boolean;
	verified: boolean;
	j4rEnabled: boolean;
	j4rClaimedAt: string | null;
	lastCheckedAt: string | null;
	error?: string;
};

const config = () => ({
	guildId: getSetting('discord.guildId').trim(),
	botToken: getSetting('discord.botToken').trim(),
	requiredRoleId: getSetting('discord.requiredRoleId').trim(),
	requireMembership: getBool('discord.requireMembership'),
	j4rEnabled: getBool('discord.j4rEnabled'),
	j4rRewardCoins: Math.max(0, getNumber('discord.j4rRewardCoins'))
});

const discordAccount = async (userId: string) => {
	const rows = await db
		.select({
			accountId: account.accountId,
			providerId: account.providerId,
			accessToken: account.accessToken
		})
		.from(account)
		.where(eq(account.userId, userId))
		.all();

	return rows.find((row) => row.providerId === 'discord') ?? null;
};

const getProfile = async (userId: string) =>
	db.select().from(discordProfile).where(eq(discordProfile.userId, userId)).get();

const parseRoles = (value: string): string[] => {
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed.filter((role): role is string => typeof role === 'string') : [];
	} catch {
		return [];
	}
};

const toState = (
	profile: typeof discordProfile.$inferSelect | undefined,
	discordId: string | null
): DiscordState => {
	const settings = config();
	const roles = profile ? parseRoles(profile.roles) : [];
	const member = profile?.member ?? false;
	const hasRequiredRole =
		!settings.requiredRoleId || roles.includes(settings.requiredRoleId);

	return {
		linked: Boolean(discordId),
		guildConfigured: Boolean(settings.guildId),
		guildId: settings.guildId,
		discordId,
		username: profile?.username ?? '',
		member,
		roles,
		requiredRoleId: settings.requiredRoleId,
		hasRequiredRole,
		verified: Boolean(profile?.verifiedAt) && member && hasRequiredRole,
		j4rEnabled: settings.j4rEnabled,
		j4rClaimedAt: profile?.j4rClaimedAt ? profile.j4rClaimedAt.toISOString() : null,
		lastCheckedAt: profile?.lastCheckedAt ? profile.lastCheckedAt.toISOString() : null
	};
};

type GuildMember = {
	roles?: string[];
	user?: { username?: string; global_name?: string | null };
};

export const syncDiscordMembership = async (
	userId: string,
	options: { force?: boolean } = {}
): Promise<DiscordState> => {
	const settings = config();
	const discord = await discordAccount(userId);

	if (!discord?.accountId) {
		const state = toState(await getProfile(userId), null);
		return { ...state, linked: false };
	}

	const profile = await getProfile(userId);

	if (
		!options.force &&
		profile?.lastCheckedAt &&
		Date.now() - profile.lastCheckedAt.getTime() < SYNC_TTL
	) {
		return toState(profile, discord.accountId);
	}

	if (!settings.guildId) {
		const next = {
			userId,
			discordId: discord.accountId,
			username: profile?.username ?? '',
			guildId: '',
			member: false,
			roles: '[]',
			verifiedAt: null,
			lastCheckedAt: new Date(),
			j4rClaimedAt: profile?.j4rClaimedAt ?? null
		};

		await db
			.insert(discordProfile)
			.values(next)
			.onConflictDoUpdate({ target: discordProfile.userId, set: next })
			.run();

		return toState({ ...profile, ...next } as typeof discordProfile.$inferSelect, discord.accountId);
	}

	let member = false;
	let roles: string[] = [];
	let username = profile?.username ?? '';
	let error: string | undefined;

	try {
		if (settings.botToken) {
			const response = await fetchWithTimeout(
				`${API}/guilds/${encodeURIComponent(settings.guildId)}/members/${encodeURIComponent(discord.accountId)}`,
				{ headers: { Authorization: `Bot ${settings.botToken}` } },
				8000
			);

			if (response.status === 404) {
				member = false;
			} else if (!response.ok) {
				throw new Error(`Discord returned ${response.status}`);
			} else {
				const body = (await response.json()) as GuildMember;
				member = true;
				roles = body.roles ?? [];
				username = body.user?.global_name || body.user?.username || username;
			}
		} else if (discord.accessToken) {
			const response = await fetchWithTimeout(
				`${API}/users/@me/guilds`,
				{ headers: { Authorization: `Bearer ${discord.accessToken}` } },
				8000
			);

			if (response.ok) {
				const guilds = (await response.json()) as Array<{ id?: string }>;
				member = guilds.some((guild) => guild.id === settings.guildId);
			} else {
				throw new Error(`Discord returned ${response.status}`);
			}

			const me = await fetchWithTimeout(
				`${API}/users/@me`,
				{ headers: { Authorization: `Bearer ${discord.accessToken}` } },
				8000
			);

			if (me.ok) {
				const body = (await me.json()) as { username?: string; global_name?: string | null };
				username = body.global_name || body.username || username;
			}
		}
	} catch (cause) {
		error = cause instanceof Error ? cause.message : 'Discord lookup failed.';
	}

	const verified = member && (!settings.requiredRoleId || roles.includes(settings.requiredRoleId));
	const next = {
		userId,
		discordId: discord.accountId,
		username,
		guildId: settings.guildId,
		member,
		roles: JSON.stringify(roles),
		verifiedAt: verified ? new Date() : null,
		lastCheckedAt: new Date(),
		j4rClaimedAt: profile?.j4rClaimedAt ?? null
	};

	await db
		.insert(discordProfile)
		.values(next)
		.onConflictDoUpdate({ target: discordProfile.userId, set: next })
		.run();

	return { ...toState({ ...profile, ...next } as typeof discordProfile.$inferSelect, discord.accountId), error };
};

export const getDiscordState = async (userId: string, force = false): Promise<DiscordState> => {
	const discord = await discordAccount(userId);
	const profile = await getProfile(userId);
	const state = toState(profile, discord?.accountId ?? null);

	if (!discord?.accountId) return { ...state, linked: false };

	if (force) return syncDiscordMembership(userId, { force: true });

	return state;
};

export const claimJ4R = async (userId: string) => {
	const settings = config();

	if (!settings.j4rEnabled) {
		throw new DiscordError('Join-for-resources is currently disabled.', 'DISABLED');
	}
	if (!settings.guildId) {
		throw new DiscordError('The Discord server has not been configured yet.', 'NOT_CONFIGURED');
	}

	const state = await syncDiscordMembership(userId, { force: true });

	if (!state.linked) throw new DiscordError('Link your Discord account first.', 'NOT_LINKED');
	if (state.j4rClaimedAt) throw new DiscordError('You already claimed this reward.', 'ALREADY_CLAIMED');
	if (settings.requireMembership && !state.member) {
		throw new DiscordError('Join the Discord server before claiming this reward.', 'NOT_MEMBER');
	}
	if (settings.requiredRoleId && !state.hasRequiredRole) {
		throw new DiscordError('You need the required Discord role to claim this reward.', 'MISSING_ROLE');
	}
	if (state.error) throw new DiscordError(state.error, 'LOOKUP_FAILED');

	const reward = settings.j4rRewardCoins;

	if (reward > 0) {
		await addCredits({
			userId,
			amount: reward,
			kind: 'discord_j4r',
			reference: `discord-j4r:${userId}`,
			description: 'Join-for-resources Discord reward',
			metadata: { guildId: settings.guildId }
		});
	}

	await db
		.update(discordProfile)
		.set({ j4rClaimedAt: new Date() })
		.where(eq(discordProfile.userId, userId))
		.run();

	logActivity({
		userId,
		action: 'discord.j4r',
		severity: 'info',
		message: 'Claimed the Discord join-for-resources reward.',
		metadata: { guildId: settings.guildId, reward }
	});

	await notifyUser({
		userId,
		kind: 'discord',
		title: 'Discord reward claimed',
		body: reward > 0 ? `${reward} credits were added to your balance.` : 'Your Discord membership is verified.',
		url: '/j4r'
	});

	return { reward, balance: await getCreditBalance(userId) };
};
