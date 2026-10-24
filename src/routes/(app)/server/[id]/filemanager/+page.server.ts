import { getUserAdapter } from '#lib/server/panel/adapter.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => ({
	fileSystem: await getUserAdapter(locals.panelUserId).getFileSystem(params.id)
});
