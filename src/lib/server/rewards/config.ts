import { z } from 'zod';
import { getBool, getNumber, getSetting } from '#lib/server/config/settings.ts';

export const inviteTiersSchema = z
	.array(
		z.object({
			invites: z.number().int().min(1),
			coins: z.number().int().min(0)
		})
	)
	.min(1);

export type InviteRewardTier = z.infer<typeof inviteTiersSchema>[number];

export const DEFAULT_INVITE_TIERS: InviteRewardTier[] = [
	{ invites: 1, coins: 10 },
	{ invites: 5, coins: 30 },
	{ invites: 10, coins: 75 }
];

const parseGuildIds = (raw: string) => {
	const values = raw
		.split(/[\s,]+/)
		.map((value) => value.trim())
		.filter(Boolean);

	return [...new Set(values)];
};

const parseTiers = (raw: string): InviteRewardTier[] => {
	let parsed: unknown;

	try {
		parsed = JSON.parse(raw);
	} catch {
		return DEFAULT_INVITE_TIERS;
	}

	const result = inviteTiersSchema.safeParse(parsed);

	if (!result.success) return DEFAULT_INVITE_TIERS;

	return [...result.data].sort((a, b) => a.invites - b.invites);
};

export const getDiscordRewardConfig = () => {
	const legacyGuildId = getSetting('discord.guildId').trim();
	const configuredGuildIds = parseGuildIds(getSetting('discord.j4rGuildIds'));
	const j4rGuildIds = configuredGuildIds.length
		? configuredGuildIds
		: legacyGuildId
			? [legacyGuildId]
			: [];

	return {
		legacyGuildId,
		j4rGuildIds,
		botToken: getSetting('discord.botToken').trim(),
		requiredRoleId: getSetting('discord.requiredRoleId').trim(),
		requireMembership: getBool('discord.requireMembership'),
		j4rEnabled: getBool('discord.j4rEnabled'),
		j4rRewardCoins: Math.max(0, getNumber('discord.j4rRewardCoins')),
		inviteTrackingEnabled: getBool('discord.inviteTrackingEnabled'),
		inviteMinAccountAgeDays: Math.max(0, getNumber('discord.inviteMinAccountAgeDays')),
		inviteRequireStillMember: getBool('discord.inviteRequireStillMember'),
		inviteTiers: parseTiers(getSetting('discord.inviteTiers'))
	};
};

export const findInviteTier = (invites: number, tiers: InviteRewardTier[]) =>
	[...tiers].reverse().find((tier) => invites >= tier.invites);

export const findNextInviteTier = (invites: number, tiers: InviteRewardTier[]) =>
	tiers.find((tier) => invites < tier.invites);
