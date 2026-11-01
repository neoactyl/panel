import { AdapterError } from '#lib/adapter/sdk.ts';
import { getUserAdapter } from '#lib/server/panel/adapter.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const adapter = getUserAdapter(locals.panelUserId);

	const permissionGroups = await adapter.listPermissionGroups().catch((cause) => {
		if (cause instanceof AdapterError && cause.code === 'UNSUPPORTED') return [];
		throw cause;
	});

	try {
		return {
			subusers: await adapter.listSubusers(params.id),
			permissionGroups
		};
	} catch (cause) {
		if (cause instanceof AdapterError && cause.code === 'UNSUPPORTED') {
			return { subusers: [], permissionGroups };
		}
		throw cause;
	}
};
