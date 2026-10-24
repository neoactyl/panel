import { redirect } from '@sveltejs/kit';
import { getUserAdapter } from '#lib/server/panel/adapter.ts';
import { getBool } from '#lib/server/config/settings.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.session || !locals.user) {
		redirect(302, '/auth/login');
	}

	if (url.searchParams.get('create') === '1') {
		redirect(307, '/server/create');
	}

	const adapter = getUserAdapter(locals.panelUserId);

	return {
		servers: await adapter.getServers(),
		allowCreate: getBool('server.allowCreate') && adapter.capabilities.servers.create
	};
};
