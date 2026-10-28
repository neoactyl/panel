import { getAfkState } from '#lib/server/afk/service.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const state = await getAfkState(locals.user!.id);

	return {
		state,
		transport: 'websocket' as const
	};
};
