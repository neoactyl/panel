import { fail, redirect } from '@sveltejs/kit';
import { getAuth } from '#lib/server/auth/auth.ts';
import {
	DiscordError,
	claimJ4R,
	getDiscordState,
	syncDiscordMembership
} from '#lib/server/integrations/discord.ts';
import { getNumber, getSetting } from '#lib/server/config/settings.ts';
import type { Actions, PageServerLoad } from './$types';

const message = (cause: unknown) =>
	cause instanceof DiscordError ? cause.message : 'Discord verification failed. Please try again.';

export const load: PageServerLoad = async ({ locals }) => {
	const state = await getDiscordState(locals.user!.id);

	return {
		state,
		inviteUrl: getSetting('discord.inviteUrl').trim(),
		reward: getNumber('discord.j4rRewardCoins')
	};
};

export const actions: Actions = {
	link: async (event) => {
		let url: string | undefined;

		try {
			const result = await getAuth().api.linkSocialAccount({
				body: {
					provider: 'discord',
					callbackURL: '/j4r',
					errorCallbackURL: '/j4r'
				},
				headers: event.request.headers
			});

			url = result.url;
		} catch (cause) {
			if (cause instanceof DiscordError) return fail(400, { error: cause.message });
			return fail(400, { error: 'Discord linking is currently unavailable.' });
		}

		if (!url) {
			return fail(400, { error: 'Discord linking is not configured.' });
		}

		redirect(302, url, { external: true });
	},

	verify: async ({ locals }) => {
		try {
			const state = await syncDiscordMembership(locals.user!.id, { force: true });
			return { state };
		} catch (cause) {
			return fail(400, { error: message(cause) });
		}
	},

	claim: async ({ locals, request }) => {
		const data = await request.formData();
		const guildId = String(data.get('guildId') ?? '').trim();

		if (!guildId) {
			return fail(400, { error: 'Choose a Discord server to claim.' });
		}

		try {
			const result = await claimJ4R(locals.user!.id, guildId);
			return { claimed: result.reward, claimedGuildId: result.guildId };
		} catch (cause) {
			return fail(400, { error: message(cause) });
		}
	}
};
