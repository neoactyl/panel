import { redirect } from '@sveltejs/kit';
import { getAuth } from '#lib/server/auth/auth.ts';
import { getUserAdapter } from '#lib/server/panel/adapter.ts';
import { panelAuthEnabled } from '#lib/server/auth/panel-auth.ts';
import { getEffectiveQuota } from '#lib/server/quota/user.ts';
import { setUserSetting } from '#lib/server/db/user-settings.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session || !locals.user) {
		redirect(302, '/auth/login');
	}

	const quota = await getEffectiveQuota(locals.user.id);
	const panelLinkAvailable = panelAuthEnabled();

	if (!panelLinkAvailable) {
		return {
			servers: await getUserAdapter(locals.user.id, locals.panelUserId).getServers(),
			linked: true,
			panelLinkAvailable,
			quota
		};
	}

	if (!locals.panelUserId) {
		return { servers: [], linked: false, panelLinkAvailable, quota };
	}

	const servers = await getUserAdapter(locals.user.id, locals.panelUserId).getServers();

	return { servers, linked: true, panelLinkAvailable, quota };
};

export const actions: Actions = {
	signout: async ({ request }) => {
		await getAuth().api.signOut({ headers: request.headers });
		redirect(302, '/auth/login');
	},
	saveSettings: async ({ locals, request }) => {
		if (!locals.user) {
			return { error: 'Not authenticated.' };
		}

		const data = await request.formData();
		const soundEnabled = String(data.get('soundEnabled') ?? '') === 'on';

		await setUserSetting(locals.user.id, 'soundEnabled', soundEnabled);

		return { success: 'Settings saved.' };
	}
};
