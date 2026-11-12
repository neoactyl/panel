import { error, redirect } from '@sveltejs/kit';
import { AdapterError, type Allocation, type PanelBlueprint, type PanelPrompt } from '#lib/adapter/sdk.ts';
import { getServerBillingAccess } from '#lib/server/billing/access.ts';
import { getUserAdapter } from '#lib/server/panel/adapter.ts';
import { getServerFeatures, serverFeatureEnabled } from '#lib/server/config/settings.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ params, locals, url }) => {
	const adapter = getUserAdapter(locals.user?.id, locals.panelUserId);
	const base = `/server/${params.id}`;
	const slug = url.pathname.slice(base.length).replace(/^\/+/, '').split('/')[0] || 'console';

	if (!serverFeatureEnabled(slug)) {
		error(404, { message: 'This feature is disabled.' });
	}

	const billingAccess = await getServerBillingAccess(params.id);

	// An expired or suspended server is read-only: settings (where it can be
	// renewed or deleted) is the only page that stays reachable.
	if (billingAccess.restricted && slug !== 'settings') {
		redirect(307, `${base}/settings`);
	}

	try {
		const server = await adapter.getServer(params.id);
		let allocations: Allocation[] = [];

		if (!billingAccess.restricted) {
			try {
				allocations = await adapter.listAllocations(params.id);
			} catch (cause) {
				if (!(cause instanceof AdapterError) || !/currently installing/i.test(cause.message)) {
					throw cause;
				}
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
			prompts,
			billingAccess
		};
	} catch (cause) {
		if (cause instanceof AdapterError && cause.code === 'NOT_FOUND') {
			error(404, { message: 'Server not found.' });
		}

		throw cause;
	}
};
