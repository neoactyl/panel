import { getUserAdapter } from '#lib/server/panel/adapter.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => ({
	backups: await getUserAdapter(locals.panelUserId).listBackups(params.id)
});
