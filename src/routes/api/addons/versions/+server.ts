import { error, json } from '@sveltejs/kit';
import {
	listAddonVersions,
	type AddonLoader,
	type AddonSource
} from '#lib/server/panel/addons.ts';
import { getBool } from '#lib/server/config/settings.ts';
import type { RequestHandler } from './$types';

const loaders: AddonLoader[] = [
	'paper',
	'spigot',
	'purpur',
	'fabric',
	'forge',
	'neoforge',
	'quilt',
	'any'
];

const parseLoader = (value: string | null): AddonLoader =>
	loaders.includes(value as AddonLoader) ? (value as AddonLoader) : 'any';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.session || !locals.user) {
		error(401, { message: 'Unauthorized' });
	}

	if (!getBool('addons.enabled')) {
		error(404, { message: 'The addon installer is disabled.' });
	}

	const source = url.searchParams.get('source') === 'curseforge' ? 'curseforge' : 'modrinth';
	const projectId = (url.searchParams.get('projectId') ?? '').trim();

	if (!projectId) {
		error(400, { message: 'Choose a project first.' });
	}

	try {
		const versions = await listAddonVersions(
			source as AddonSource,
			projectId,
			parseLoader(url.searchParams.get('loader'))
		);

		return json({ versions });
	} catch (cause) {
		return json(
			{
				message:
					cause instanceof Error ? cause.message : 'Could not load the versions for that project.'
			},
			{ status: 502 }
		);
	}
};
