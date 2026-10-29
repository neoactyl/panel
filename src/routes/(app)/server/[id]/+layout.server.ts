import { error } from '@sveltejs/kit';
import { AdapterError, type Allocation, type PanelBlueprint, type PanelPrompt } from '#lib/adapter/sdk.ts';
import { getUserAdapter } from '#lib/server/panel/adapter.ts';
import { getServerFeatures, serverFeatureEnabled } from '#lib/server/config/settings.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ params, locals, url }) => {
	const adapter = getUserAdapter(locals.panelUserId);
	const base = `/server/${params.id}`;
	const slug = url.pathname.slice(base.length).replace(/^\/+/, '').split('/')[0] || 'console';

	if (!serverFeatureEnabled(slug)) {
		error(404, { message: 'This feature is disabled.' });
	}

	try {
		const server = await adapter.getServer(params.id);
		let allocations: Allocation[] = [];

		try {
			allocations = await adapter.listAllocations(params.id);
		} catch (cause) {
			if (!(cause instanceof AdapterError) || !/currently installing/i.test(cause.message)) {
				throw cause;
			}
		}

		let serverBlueprint: PanelBlueprint = { pages: [] };

		try {
			serverBlueprint = await adapter.getPanelBlueprint('server', params.id);
		} catch {
			/* panel extensions are optional */
		}

		let prompts: PanelPrompt[] = [];

		try {
			prompts = await adapter.getPanelPrompts('server', params.id);
		} catch {
			/* prompts are best-effort */
		}

		return {
			server,
			allocations,
			consoleLines: [],
			capabilities: adapter.capabilities,
			serverBlueprint,
			serverFeatures: getServerFeatures(),
			prompts
		};
	} catch (cause) {
		if (cause instanceof AdapterError && cause.code === 'NOT_FOUND') {
			error(404, { message: 'Server not found.' });
		}

		throw cause;
	}
};
