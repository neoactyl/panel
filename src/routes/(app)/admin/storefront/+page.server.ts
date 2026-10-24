import { error } from '@sveltejs/kit';
import { isAdmin } from '#lib/server/auth/admin.ts';
import { listStorefrontItems } from '#lib/server/catalog/storefront-admin.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!isAdmin(locals.user)) error(403, { message: 'Administrator access is required.' });

	return { items: await listStorefrontItems() };
};
