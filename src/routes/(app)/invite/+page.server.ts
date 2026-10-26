import { fail, redirect } from '@sveltejs/kit';
import { getAuth } from '#lib/server/auth/auth.ts';
import { getReferralStats } from '#lib/server/billing/referrals.ts';
import { getBool, getNumber, getSetting } from '#lib/server/config/settings.ts';
import {
	InviteRewardError,
	claimDiscordInvites,
	getDiscordInviteState
} from '#lib/server/rewards/invites.ts';
import type { Actions, PageServerLoad } from './$types';

const message = (cause: unknown) =>
	cause instanceof InviteRewardError
		? cause.message
		: 'Discord invite rewards could not be claimed. Please try again.';

export const load: PageServerLoad = async ({ locals }) => {
	const [stats, discord] = await Promise.all([
		getReferralStats(locals.user!.id),
		getDiscordInviteState(locals.user!.id)
	]);

	return {
		stats,
		enabled: getBool('invites.enabled'),
		rewards: {
			coins: getNumber('invites.rewardCoins'),
			cpu: getNumber('invites.rewardCpu'),
			memory: getNumber('invites.rewardMemory'),
			disk: getNumber('invites.rewardDisk'),
			serverSlots: getNumber('invites.rewardServerSlots')
		},
		discord,
		inviteUrl: getSetting('discord.inviteUrl').trim()
	};
};

export const actions: Actions = {
	linkDiscord: async (event) => {
		let url: string | undefined;

		try {
			const result = await getAuth().api.linkSocialAccount({
				body: {
					provider: 'discord',
					callbackURL: '/invite',
					errorCallbackURL: '/invite'
				},
				headers: event.request.headers
			});

			url = result.url;
		} catch {
			return fail(400, { error: 'Discord linking is currently unavailable.' });
		}

		if (!url) {
			return fail(400, { error: 'Discord linking is not configured.' });
		}

		redirect(302, url, { external: true });
	},

	claimDiscord: async ({ locals }) => {
		try {
			const result = await claimDiscordInvites(locals.user!.id);
			return { claimed: result.reward, invites: result.inviteCount };
		} catch (cause) {
			return fail(400, { error: message(cause) });
		}
	}
};
