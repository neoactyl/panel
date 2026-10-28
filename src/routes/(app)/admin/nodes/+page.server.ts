import { fail } from '@sveltejs/kit';
import { adminFailure } from '#lib/server/auth/admin.ts';
import { getAdapter } from '#lib/server/panel/adapter.ts';
import {
  getPanelConfig,
  getSetting,
  updateSettings,
  type SettingKey,
} from '#lib/server/config/settings.ts';
import { logActivity } from '#lib/server/system/logs.ts';
import type { Actions, PageServerLoad } from './$types';
import type { UpdateNode } from '#lib/adapter/sdk.ts';

type NodeCountryFlags = { allow: string[]; block: string[] };

export const load: PageServerLoad = async () => {
	const panel = getPanelConfig();

	try {
		const nodes = await getAdapter().getNodes();

		let countryOverrides: Record<string, NodeCountryFlags> = {};
		try {
			const raw = getSetting('panel.nodeCountries');
			countryOverrides = raw
				? (JSON.parse(raw) as Record<string, NodeCountryFlags>)
				: {};
		} catch {
			countryOverrides = {};
		}

		return {
			nodes,
			countryOverrides,
			panic: null,
			adapter: panel.adapter
		};
	} catch {
		return {
			nodes: [],
			countryOverrides: {},
			panic: 'The panel could not be reached with the current adapter settings.',
			adapter: panel.adapter
		};
	}
};

export const actions: Actions = {
	updateNode: async ({ locals, request }) => {
		const denied = adminFailure(locals);
		if (denied) return denied;

		const data = await request.formData();
		const nodeId = String(data.get('nodeId') ?? '');
		const deploymentEnabled = data.get('deploymentEnabled') === 'true';
		const maintenanceEnabled = data.get('maintenanceEnabled') === 'true';
		const memory = Number(String(data.get('memory') ?? '') || 0);
		const disk = Number(String(data.get('disk') ?? '') || 0);
		const allocations = Number(String(data.get('allocations') ?? '') || 0);

		if (!nodeId) {
			return fail(400, { message: 'Choose a node to update.' });
		}

		const adapter = getAdapter();

		if (!adapter.capabilities.nodes?.update) {
			return fail(403, { message: 'This panel does not support node updates.' });
		}

		const update: UpdateNode = {
			deploymentEnabled,
			maintenanceEnabled,
			memory: memory > 0 ? memory : undefined,
			disk: disk > 0 ? disk : undefined,
			allocations: allocations > 0 ? allocations : undefined
		};

		try {
			const node = await adapter.updateNode(nodeId, update);

			logActivity({
				userId: locals.user?.id,
				action: 'admin.node.update',
				message: `Updated node ${node.name}`,
				metadata: { nodeId, update }
			});

			return { success: `Updated node ${node.name}.` };
		} catch (cause) {
			return fail(400, {
				message: cause instanceof Error ? cause.message : 'Could not update the node.'
			});
		}
	},

	setNodeCountries: async ({ locals, request }) => {
		const denied = adminFailure(locals);
		if (denied) return denied;

		const data = await request.formData();
		const nodeId = String(data.get('nodeId') ?? '');
		const countries = String(data.get('countries') ?? '{}');

		if (!nodeId) {
			return fail(400, { message: 'Choose a node.' });
		}

		let parsed: NodeCountryFlags;
		try {
			parsed = JSON.parse(countries) as NodeCountryFlags;
		} catch {
			return fail(400, { message: 'Country flags must be valid JSON.' });
		}

		await updateSettings({
			'panel.nodeCountries': JSON.stringify({
				[nodeId]: {
					allow: Array.isArray(parsed.allow) ? parsed.allow : [],
					block: Array.isArray(parsed.block) ? parsed.block : []
				}
			})
		} as Partial<Record<SettingKey, string>>);

		logActivity({
			userId: locals.user?.id,
			action: 'admin.node.countries',
			message: `Updated country flags for node ${nodeId}`,
			metadata: { nodeId, allow: parsed.allow, block: parsed.block }
		});

		return { success: 'Node country flags updated.' };
	}
};
