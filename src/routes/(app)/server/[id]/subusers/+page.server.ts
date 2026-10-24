import { AdapterError } from '#lib/adapter/sdk.ts';
import { getUserAdapter } from '#lib/server/panel/adapter.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	try {
		return { subusers: await getUserAdapter(locals.panelUserId).listSubusers(params.id) };
	} catch (cause) {
		if (cause instanceof AdapterError && cause.code === 'UNSUPPORTED') {
			return { subusers: [] };
		}
		throw cause;
	}
};
