import { AdapterError } from '#lib/adapter/sdk.ts';
import { getUserAdapter } from '#lib/server/panel/adapter.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, parent, locals }) => {
	const adapter = getUserAdapter(locals.panelUserId);

	try {
		return { startup: await adapter.getStartup(params.id) };
	} catch (cause) {
		if (cause instanceof AdapterError && cause.code === 'UNSUPPORTED') {
			const { server } = await parent();
			return {
				startup: {
					image: server.image,
					command: '',
					variables: []
				}
			};
		}
		throw cause;
	}
};
