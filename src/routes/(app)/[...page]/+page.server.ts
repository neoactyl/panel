import { error } from '@sveltejs/kit';
import type { PanelBlueprint } from '#lib/adapter/sdk.ts';
import { getUserAdapter } from '#lib/server/panel/adapter.ts';
import type { PageServerLoad } from './$types';

const normalize = (path: string) => path.replace(/^\/+|\/+$/g, '');

export const load: PageServerLoad = async ({ params, locals }) => {
	let blueprint: PanelBlueprint = { pages: [] };

	try {
		blueprint = await getUserAdapter(locals.panelUserId).getPanelBlueprint('app');
	} catch {
		error(404, { message: 'Page not found.' });
	}

	const requested = normalize(params.page);
	const page = blueprint.pages.find((entry) => normalize(entry.path) === requested);

	if (!page) {
		error(404, { message: 'Page not found.' });
	}

	return {
		blueprintPage: page,
		scope: 'app' as const
	};
};
