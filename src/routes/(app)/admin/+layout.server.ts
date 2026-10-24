import { error } from '@sveltejs/kit';
import { isAdmin } from '#lib/server/auth/admin.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!isAdmin(locals.user)) {
		error(403, { message: 'Administrator access is required.' });
	}
};
