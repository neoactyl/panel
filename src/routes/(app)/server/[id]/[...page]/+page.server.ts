import { error } from '@sveltejs/kit';
import { getUserAdapter } from '#lib/server/panel/adapter.ts';
import type { PageServerLoad } from './$types';

const normalize = (path: string) => path.replace(/^\/+|\/+$/g, '');

export const load: PageServerLoad = async ({ params, locals }) => {
	const adapter = getUserAdapter(locals.panelUserId);
	const blueprint = await adapter.getPanelBlueprint('server', params.id);
	const requested = normalize(params.page);
	const page = blueprint.pages.find((entry) => normalize(entry.path) === requested);

	if (!page) {
		error(404, { message: 'Page not found.' });
	}

	return {
		blueprintPage: page,
		scope: 'server' as const,
		serverId: params.id
	};
};
