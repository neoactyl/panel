import { fail } from '@sveltejs/kit';
import { isAdmin } from '#lib/server/auth/admin.ts';
import { getAdapter } from '#lib/server/panel/adapter.ts';
import { getPanelConfig } from '#lib/server/config/settings.ts';
import { logActivity } from '#lib/server/system/logs.ts';
import type { Actions, PageServerLoad } from './$types';

const positiveInt = (value: FormDataEntryValue | null) => {
	const parsed = Number(String(value ?? '').trim());
	return Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
};

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
		if (!isAdmin(locals.user)) {
			return fail(403, { message: 'Administrator access is required.' });
		}

		const data = await request.formData();
		const serverId = String(data.get('serverId') ?? '').trim();
		const cpu = positiveInt(data.get('cpu'));
		const ram = positiveInt(data.get('ram'));
		const disk = positiveInt(data.get('disk'));

		if (!serverId) {
			return fail(400, { message: 'Choose a server to update.' });
		}

		if (cpu === null || ram === null || disk === null) {
			return fail(400, { message: 'CPU, memory, and disk must be positive whole numbers.' });
		}

		const adapter = getAdapter();

		if (!adapter.capabilities.servers.update) {
			return fail(403, { message: 'This panel does not support server updates.' });
		}

		try {
			const server = await adapter.updateServer(serverId, { cpu, ram, disk });

			logActivity({
				userId: locals.user?.id,
				action: 'admin.server.resources',
				message: `Updated resources for ${server.name}`,
				metadata: { serverId, cpu, ram, disk }
			});

			return { success: `Updated resources for ${server.name}.` };
		} catch (cause) {
			return fail(400, {
				message: cause instanceof Error ? cause.message : 'Could not update the server resources.'
			});
		}
	}
};
