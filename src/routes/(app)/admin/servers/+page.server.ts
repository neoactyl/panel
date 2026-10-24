import { getAdapter } from '#lib/server/panel/adapter.ts';
import { getPanelConfig } from '#lib/server/config/settings.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const panel = getPanelConfig();

	try {
		return {
			servers: await getAdapter().getServers(),
			panic: null,
			adapter: panel.adapter
		};
	} catch {
		return {
			servers: [],
			panic: 'The panel could not be reached with the current adapter settings.',
			adapter: panel.adapter
		};
	}
};
