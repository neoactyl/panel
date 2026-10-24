import { error, fail } from '@sveltejs/kit';
import { AdapterError } from '#lib/adapter/sdk.ts';
import { getUserAdapter } from '#lib/server/panel/adapter.ts';
import {
	defaultAddonDirectory,
	installAddon,
	searchAddons,
	type AddonLoader,
	type AddonSource
} from '#lib/server/panel/addons.ts';
import { logActivity } from '#lib/server/system/logs.ts';
import { getBool, getSetting } from '#lib/server/config/settings.ts';
import type { Actions, PageServerLoad } from './$types';

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
	loaders.includes(value as AddonLoader) ? (value as AddonLoader) : 'paper';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!getBool('addons.enabled')) {
		error(404, { message: 'The addon installer is disabled.' });
	}

	const query = (url.searchParams.get('q') ?? '').trim();
	const loader = parseLoader(url.searchParams.get('loader'));
	const source = (url.searchParams.get('source') ?? 'all') as AddonSource | 'all';

	let results: Awaited<ReturnType<typeof searchAddons>>['results'] = [];
	let errors: string[] = [];

	if (query.length >= 2) {
		const search = await searchAddons(query, loader, source);
		results = search.results;
		errors = search.errors;
	}

	return {
		serverId: params.id,
		query,
		loader,
		source,
		results,
		errors,
		directory: defaultAddonDirectory(loader),
		curseforgeConfigured: Boolean(getSetting('addons.curseforgeKey').trim())
	};
};

export const actions: Actions = {
	install: async ({ locals, params, request }) => {
		if (!getBool('addons.enabled')) {
			return fail(400, { error: 'The addon installer is disabled.' });
		}

		const data = await request.formData();
		const source = String(data.get('source') ?? 'modrinth') as AddonSource;
		const projectId = String(data.get('projectId') ?? '').trim();
		const loader = parseLoader(String(data.get('loader') ?? 'paper'));
		const directory = String(data.get('directory') ?? '/plugins').trim() || '/plugins';
		const url = String(data.get('url') ?? '').trim() || undefined;
		const filename = String(data.get('filename') ?? '').trim() || undefined;

		if (!projectId) return fail(400, { error: 'Choose a project to install.' });
		if (!directory.startsWith('/')) {
			return fail(400, { error: 'The install directory must be an absolute path.' });
		}

		const adapter = getUserAdapter(locals.panelUserId);

		try {
			const entry = await installAddon(adapter, params.id, {
				source,
				projectId,
				loader,
				directory,
				url,
				filename
			});

			logActivity({
				userId: locals.user?.id,
				action: 'server.addon.install',
				message: `Installed ${entry.name} on server ${params.id}.`,
				path: `/server/${params.id}/addons`,
				metadata: { source, projectId, loader, directory, filename: entry.name }
			});

			return { installed: entry.name, directory };
		} catch (cause) {
			if (cause instanceof AdapterError) return fail(400, { error: cause.message });
			return fail(400, {
				error: cause instanceof Error ? cause.message : 'The addon could not be installed.'
			});
		}
	}
};
