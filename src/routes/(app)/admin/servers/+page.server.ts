import { fail } from '@sveltejs/kit';
import { adminFailure } from '#lib/server/auth/admin.ts';
import { getAdapter } from '#lib/server/panel/adapter.ts';
import { getPanelConfig } from '#lib/server/config/settings.ts';
import { formString, toInt } from '#lib/server/forms.ts';
import { logActivity } from '#lib/server/system/logs.ts';
import type { Actions, PageServerLoad } from './$types';

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

export const actions: Actions = {
	updateResources: async ({ locals, request }) => {
		const denied = adminFailure(locals);
		if (denied) return denied;

		const data = await request.formData();
		const serverId = formString(data, 'serverId');
		const cpu = toInt(data.get('cpu'), 1);
		const ram = toInt(data.get('ram'), 1);
		const disk = toInt(data.get('disk'), 1);
		const databases = toInt(data.get('databases'));
		const allocations = toInt(data.get('allocations'));

		if (!serverId) {
			return fail(400, { message: 'Choose a server to update.' });
		}

		if (cpu === null || ram === null || disk === null) {
			return fail(400, { message: 'CPU, memory, and disk must be positive whole numbers.' });
		}

		if (databases === null || allocations === null) {
			return fail(400, { message: 'Database and allocation limits must be whole numbers.' });
		}

		const adapter = getAdapter();

		if (!adapter.capabilities.servers.update) {
			return fail(403, { message: 'This panel does not support server updates.' });
		}

		try {
			const server = await adapter.updateServer(serverId, {
				cpu,
				ram,
				disk,
				databases,
				allocations
			});

			logActivity({
				userId: locals.user?.id,
				action: 'admin.server.resources',
				message: `Updated resources for ${server.name}`,
				metadata: { serverId, cpu, ram, disk, databases, allocations }
			});

			return { success: `Updated resources for ${server.name}.` };
		} catch (cause) {
			return fail(400, {
				message: cause instanceof Error ? cause.message : 'Could not update the server resources.'
			});
		}
	}
};

