import { fail } from '@sveltejs/kit';
import { EarnError, getAfkState, pingAfk } from '#lib/server/billing/earn.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const state = await getAfkState(locals.user!.id);
	return { state };
};

export const actions: Actions = {
	ping: async ({ locals }) => {
		try {
			const state = await pingAfk(locals.user!.id);
			return { state, awarded: state.awarded };
		} catch (cause) {
			if (cause instanceof EarnError) return fail(400, { error: cause.message });
			throw cause;
		}
	}
};
