import { getUserAdapter } from '#lib/server/panel/adapter.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => ({
	databases: await getUserAdapter(locals.panelUserId).listDatabases(params.id)
});
