import { eq } from 'drizzle-orm';
import { fetchWithTimeout } from '#lib/http.ts';
import { addCreditsWith, getCreditBalance } from '#lib/server/billing/credits.ts';
import { account } from '#lib/server/db/auth.schema.ts';
import { db } from '#lib/server/db/index.ts';
import {
	discordJ4rClaim,
	discordMembership,
	discordProfile
} from '#lib/server/db/ops.ts';
import { getDiscordRewardConfig } from '#lib/server/rewards/config.ts';
import { logActivity } from '#lib/server/system/logs.ts';
import { notifyUser } from '#lib/server/system/notifications.ts';

export type DiscordCode =
	| 'NOT_LINKED'
	| 'NOT_CONFIGURED'
	| 'NOT_MEMBER'
	| 'MISSING_ROLE'
	| 'DISABLED'
	| 'ALREADY_CLAIMED'
	| 'REAUTH_REQUIRED'
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
const REQUIRED_SCOPES = ['identify', 'guilds'] as const;

export type DiscordGuildState = {
	guildId: string;
	member: boolean;
	roles: string[];
	hasRequiredRole: boolean;
	verified: boolean;
	claimedAt: string | null;
	lastCheckedAt: string | null;
};

export type DiscordState = {
	linked: boolean;
	guildConfigured: boolean;
	guildId: string;
	requiredGuildIds: string[];
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
	guilds: DiscordGuildState[];
	scopeMissing: boolean;
	error?: string;
};

type GuildMember = {
	roles?: string[];
	user?: { username?: string; global_name?: string | null };
};

type MembershipRow = typeof discordMembership.$inferSelect;
type ClaimRow = typeof discordJ4rClaim.$inferSelect;
type ProfileRow = typeof discordProfile.$inferSelect;

const discordAccount = async (userId: string) => {
	const rows = await db
		.select({
			accountId: account.accountId,
			providerId: account.providerId,
			accessToken: account.accessToken,
			scope: account.scope
		})
		.from(account)
		.where(eq(account.userId, userId))
		.all();

	return rows.find((row) => row.providerId === 'discord') ?? null;
};

const getProfile = async (userId: string) =>
	db.select().from(discordProfile).where(eq(discordProfile.userId, userId)).get();

const getMemberships = async (userId: string) =>
	db.select().from(discordMembership).where(eq(discordMembership.userId, userId)).all();

const getClaims = async (userId: string) =>
	db.select().from(discordJ4rClaim).where(eq(discordJ4rClaim.userId, userId)).all();

const parseRoles = (value: string): string[] => {
	try {
		const parsed: unknown = JSON.parse(value);
		return Array.isArray(parsed) ? parsed.filter((role): role is string => typeof role === 'string') : [];
	} catch {
		return [];
	}
};

const hasRequiredScopes = (scope: string | null) => {
	const scopes = new Set((scope ?? '').split(/[\s,]+/).filter(Boolean));
	return REQUIRED_SCOPES.every((required) => scopes.has(required));
};

const roleGuildId = (guildIds: string[], legacyGuildId: string) =>
	legacyGuildId || guildIds[0] || '';

const requiredRoleFor = (guildId: string, guildIds: string[], legacyGuildId: string, roleId: string) =>
	guildId === roleGuildId(guildIds, legacyGuildId) ? roleId : '';

const buildState = ({
	discordId,
	profile,
	memberships,
	claims,
	scopeMissing,
	error
}: {
	discordId: string | null;
	profile: ProfileRow | undefined;
	memberships: MembershipRow[];
	claims: ClaimRow[];
	scopeMissing: boolean;
	error?: string;
}): DiscordState => {
	const settings = getDiscordRewardConfig();
	const primaryGuildId = settings.legacyGuildId || settings.j4rGuildIds[0] || '';
	const claimsByGuild = new Map(claims.map((claim) => [claim.guildId, claim]));
	const membershipsByGuild = new Map(memberships.map((membership) => [membership.guildId, membership]));

	const guilds: DiscordGuildState[] = settings.j4rGuildIds.map((guildId) => {
		const membership = membershipsByGuild.get(guildId);
		const roles = membership ? parseRoles(membership.roles) : [];
		const roleId = requiredRoleFor(
			guildId,
			settings.j4rGuildIds,
			settings.legacyGuildId,
			settings.requiredRoleId
		);
		const hasRequiredRole = !roleId || roles.includes(roleId);
		const claimed = claimsByGuild.get(guildId);

		return {
			guildId,
			member: membership?.member ?? false,
			roles,
			hasRequiredRole,
			verified: Boolean(membership?.verifiedAt) && Boolean(membership?.member) && hasRequiredRole,
			claimedAt: claimed?.claimedAt ? claimed.claimedAt.toISOString() : null,
			lastCheckedAt: membership?.lastCheckedAt ? membership.lastCheckedAt.toISOString() : null
		};
	});

	const primary =
		guilds.find((guild) => guild.guildId === primaryGuildId) ?? guilds[0] ?? null;
	const claimedAt = guilds.length > 0 && guilds.every((guild) => guild.claimedAt)
		? guilds.reduce<string | null>((latest, guild) => {
				if (!guild.claimedAt) return latest;
				return !latest || guild.claimedAt > latest ? guild.claimedAt : latest;
			}, null)
		: null;
	const lastCheckedAt = guilds.reduce<string | null>((latest, guild) => {
		if (!guild.lastCheckedAt) return latest;
		return !latest || guild.lastCheckedAt > latest ? guild.lastCheckedAt : latest;
	}, profile?.lastCheckedAt ? profile.lastCheckedAt.toISOString() : null);

	return {
		linked: Boolean(discordId),
		guildConfigured: settings.j4rGuildIds.length > 0,
		guildId: primaryGuildId,
		requiredGuildIds: settings.j4rGuildIds,
		discordId,
		username: profile?.username ?? '',
		member: guilds.length > 0 && guilds.every((guild) => guild.member),
		roles: primary?.roles ?? [],
		requiredRoleId: primary ? requiredRoleFor(
			primary.guildId,
			settings.j4rGuildIds,
			settings.legacyGuildId,
			settings.requiredRoleId
		) : settings.requiredRoleId,
		hasRequiredRole: primary?.hasRequiredRole ?? !settings.requiredRoleId,
		verified: guilds.length > 0 && guilds.every((guild) => guild.verified),
		j4rEnabled: settings.j4rEnabled,
		j4rClaimedAt: claimedAt,
		lastCheckedAt,
		guilds,
		scopeMissing,
		error
	};
};

const fetchBotMembership = async (guildId: string, discordId: string, botToken: string) => {
	const response = await fetchWithTimeout(
		`${API}/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(discordId)}`,
		{ headers: { Authorization: `Bot ${botToken}` } },
		8000
	);

	if (response.status === 404) return { member: false, roles: [] as string[], username: '' };
	if (!response.ok) throw new Error(`Discord returned ${response.status}`);

	const body = (await response.json()) as GuildMember;

	return {
		member: true,
		roles: body.roles ?? [],
		username: body.user?.global_name || body.user?.username || ''
	};
};

const fetchOAuthMembership = async (accessToken: string) => {
	const guildResponse = await fetchWithTimeout(
		`${API}/users/@me/guilds`,
		{ headers: { Authorization: `Bearer ${accessToken}` } },
		8000
	);

	if (!guildResponse.ok) throw new Error(`Discord returned ${guildResponse.status}`);

	const guilds = (await guildResponse.json()) as Array<{ id?: string }>;
	const meResponse = await fetchWithTimeout(
		`${API}/users/@me`,
		{ headers: { Authorization: `Bearer ${accessToken}` } },
		8000
	);

	let username = '';

	if (meResponse.ok) {
		const body = (await meResponse.json()) as { username?: string; global_name?: string | null };
		username = body.global_name || body.username || '';
	}

	return {
		guildIds: new Set(guilds.flatMap((guild) => (guild.id ? [guild.id] : []))),
		username
	};
};

export const syncDiscordMembership = async (
	userId: string,
	options: { force?: boolean } = {}
): Promise<DiscordState> => {
	const settings = getDiscordRewardConfig();
	const discord = await discordAccount(userId);
	const profile = await getProfile(userId);
	const claims = await getClaims(userId);

	if (!discord?.accountId) {
		return buildState({
			discordId: null,
			profile,
			memberships: [],
			claims,
			scopeMissing: false
		});
	}

	const existingMemberships = await getMemberships(userId);
	const scopeMissing = !hasRequiredScopes(discord.scope);
	const now = new Date();

	const fresh =
		profile?.lastCheckedAt &&
		Date.now() - profile.lastCheckedAt.getTime() < SYNC_TTL &&
		settings.j4rGuildIds.every((guildId) =>
			existingMemberships.some(
				(membership) =>
					membership.guildId === guildId &&
					membership.lastCheckedAt &&
					Date.now() - membership.lastCheckedAt.getTime() < SYNC_TTL
			)
		);

	if (!options.force && fresh) {
		return buildState({
			discordId: discord.accountId,
			profile,
			memberships: existingMemberships,
			claims,
			scopeMissing
		});
	}

	if (settings.j4rGuildIds.length === 0) {
		await db
			.insert(discordProfile)
			.values({
				userId,
				discordId: discord.accountId,
				username: profile?.username ?? '',
				guildId: '',
				member: false,
				roles: '[]',
				verifiedAt: null,
				lastCheckedAt: now,
				j4rClaimedAt: profile?.j4rClaimedAt ?? null
			})
			.onConflictDoUpdate({
				target: discordProfile.userId,
				set: {
					discordId: discord.accountId,
					lastCheckedAt: now
				}
			})
			.run();

		return buildState({
			discordId: discord.accountId,
			profile: { ...profile, lastCheckedAt: now } as ProfileRow,
			memberships: [],
			claims,
			scopeMissing
		});
	}

	let username = profile?.username ?? '';
	let error: string | undefined;
	const fetched = new Map<string, { member: boolean; roles: string[] }>();
	const botToken = settings.botToken;

	if (botToken) {
		for (const guildId of settings.j4rGuildIds) {
			try {
				const membership = await fetchBotMembership(guildId, discord.accountId, botToken);
				fetched.set(guildId, { member: membership.member, roles: membership.roles });
				if (membership.username) username = membership.username;
			} catch (cause) {
				error = cause instanceof Error ? cause.message : 'Discord lookup failed.';
			}
		}
	} else if (discord.accessToken) {
		try {
			const oauth = await fetchOAuthMembership(discord.accessToken);
			if (oauth.username) username = oauth.username;

			for (const guildId of settings.j4rGuildIds) {
				fetched.set(guildId, { member: oauth.guildIds.has(guildId), roles: [] });
			}
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Discord lookup failed.';
		}
	} else {
		error = 'Discord access token is unavailable. Re-link your Discord account.';
	}

	const nextMemberships: MembershipRow[] = [];

	for (const guildId of settings.j4rGuildIds) {
		const previous = existingMemberships.find((membership) => membership.guildId === guildId);
		const result = fetched.get(guildId);

		if (!result) {
			if (previous) nextMemberships.push(previous);
			continue;
		}

		const roleId = requiredRoleFor(
			guildId,
			settings.j4rGuildIds,
			settings.legacyGuildId,
			settings.requiredRoleId
		);
		const hasRole = !roleId || result.roles.includes(roleId);
		const verified = result.member && hasRole;
		const row: MembershipRow = {
			userId,
			guildId,
			discordId: discord.accountId,
			member: result.member,
			roles: JSON.stringify(result.roles),
			verifiedAt: verified ? (previous?.verifiedAt ?? now) : null,
			lastCheckedAt: now
		};

		await db
			.insert(discordMembership)
			.values(row)
			.onConflictDoUpdate({
				target: [discordMembership.userId, discordMembership.guildId],
				set: {
					discordId: row.discordId,
					member: row.member,
					roles: row.roles,
					verifiedAt: row.verifiedAt,
					lastCheckedAt: row.lastCheckedAt
				}
			})
			.run();

		nextMemberships.push(row);
	}

	const primaryGuildId = roleGuildId(settings.j4rGuildIds, settings.legacyGuildId);
	const primary = nextMemberships.find((membership) => membership.guildId === primaryGuildId);

	await db
		.insert(discordProfile)
		.values({
			userId,
			discordId: discord.accountId,
			username,
			guildId: primaryGuildId,
			member: primary?.member ?? false,
			roles: primary?.roles ?? '[]',
			verifiedAt: primary?.verifiedAt ?? null,
			lastCheckedAt: now,
			j4rClaimedAt: profile?.j4rClaimedAt ?? null
		})
		.onConflictDoUpdate({
			target: discordProfile.userId,
			set: {
				discordId: discord.accountId,
				username,
				guildId: primaryGuildId,
				member: primary?.member ?? false,
				roles: primary?.roles ?? '[]',
				verifiedAt: primary?.verifiedAt ?? null,
				lastCheckedAt: now
			}
		})
		.run();

	return buildState({
		discordId: discord.accountId,
		profile: {
			...(profile ?? {
				userId,
				discordId: discord.accountId,
				username,
				guildId: primaryGuildId,
				member: primary?.member ?? false,
				roles: primary?.roles ?? '[]',
				verifiedAt: primary?.verifiedAt ?? null,
				lastCheckedAt: now,
				j4rClaimedAt: null
			}),
			username,
			lastCheckedAt: now
		} as ProfileRow,
		memberships: nextMemberships,
		claims,
		scopeMissing,
		error
	});
};

export const getDiscordState = async (userId: string, force = false): Promise<DiscordState> =>
	syncDiscordMembership(userId, { force });

export const claimJ4R = async (userId: string, guildId: string) => {
	const settings = getDiscordRewardConfig();

	if (!settings.j4rEnabled) {
		throw new DiscordError('Join-for-resources is currently disabled.', 'DISABLED');
	}
	if (!guildId || !settings.j4rGuildIds.includes(guildId)) {
		throw new DiscordError('That Discord server is not configured for this reward.', 'NOT_CONFIGURED');
	}

	const state = await syncDiscordMembership(userId, { force: true });

	if (!state.linked) throw new DiscordError('Link your Discord account first.', 'NOT_LINKED');
	if (state.scopeMissing) {
		throw new DiscordError(
			'Re-link your Discord account so server membership can be verified.',
			'REAUTH_REQUIRED'
		);
	}
	if (state.error) throw new DiscordError(state.error, 'LOOKUP_FAILED');

	const guild = state.guilds.find((entry) => entry.guildId === guildId);

	if (!guild) {
		throw new DiscordError('That Discord server is not configured for this reward.', 'NOT_CONFIGURED');
	}
	if (guild.claimedAt) {
		throw new DiscordError('You already claimed this server reward.', 'ALREADY_CLAIMED');
	}
	if (!guild.member) {
		throw new DiscordError('Join the Discord server before claiming this reward.', 'NOT_MEMBER');
	}
	if (!guild.hasRequiredRole) {
		throw new DiscordError('You need the required Discord role to claim this reward.', 'MISSING_ROLE');
	}

	const reward = settings.j4rRewardCoins;
	const claimId = crypto.randomUUID();

	await db.transaction(async (tx) => {
		const inserted = await tx
			.insert(discordJ4rClaim)
			.values({
				id: claimId,
				userId,
				discordId: state.discordId ?? '',
				guildId,
				rewardCoins: reward,
				claimedAt: new Date()
			})
			.onConflictDoNothing()
			.returning({ id: discordJ4rClaim.id })
			.get();

		if (!inserted) {
			throw new DiscordError('You already claimed this server reward.', 'ALREADY_CLAIMED');
		}

		if (reward > 0) {
			await addCreditsWith(tx, {
				userId,
				amount: reward,
				kind: 'discord_j4r',
				reference: `discord-j4r:${userId}:${guildId}`,
				description: 'Join-for-resources Discord reward',
				metadata: { guildId }
			});
		}
	});

	const primaryGuildId = roleGuildId(settings.j4rGuildIds, settings.legacyGuildId);

	if (guildId === primaryGuildId) {
		await db
			.update(discordProfile)
			.set({ j4rClaimedAt: new Date() })
			.where(eq(discordProfile.userId, userId))
			.run();
	}

	logActivity({
		userId,
		action: 'discord.j4r',
		severity: 'info',
		message: 'Claimed the Discord join-for-resources reward.',
		metadata: { guildId, reward }
	});

	await notifyUser({
		userId,
		kind: 'discord',
		title: 'Discord reward claimed',
		body:
			reward > 0
				? `${reward} credits were added to your balance.`
				: 'Your Discord membership is verified.',
		url: '/j4r'
	});

	return { reward, guildId, balance: await getCreditBalance(userId) };
};
