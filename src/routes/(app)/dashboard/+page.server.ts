import { redirect } from '@sveltejs/kit';
import { getAuth } from '#lib/server/auth/auth.ts';
import { getAdapter, getAdapterForUser } from '#lib/server/panel/adapter.ts';
import { panelAuthEnabled } from '#lib/server/auth/panel-auth.ts';
import { getQuota } from '#lib/server/config/settings.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session || !locals.user) {
		redirect(302, '/auth/login');
	}

	const quota = getQuota();
	const panelLinkAvailable = panelAuthEnabled();

	if (!panelLinkAvailable) {
		return { servers: await getAdapter().getServers(), linked: true, panelLinkAvailable, quota };
	}

	if (!locals.panelUserId) {
		return { servers: [], linked: false, panelLinkAvailable, quota };
	}

	const servers = await getAdapterForUser(locals.panelUserId).getServers();

	return { servers, linked: true, panelLinkAvailable, quota };
};

export const actions: Actions = {
	signout: async ({ request }) => {
		await getAuth().api.signOut({ headers: request.headers });
		redirect(302, '/auth/login');
	}
};
