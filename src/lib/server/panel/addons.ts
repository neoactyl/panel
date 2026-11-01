import { fetchWithTimeout } from '#lib/http.ts';
import type { Adapter, FileEntry } from '#lib/adapter/sdk.ts';
import { getSetting } from '#lib/server/config/settings.ts';

export type AddonSource = 'modrinth' | 'curseforge';

export type AddonHit = {
	source: AddonSource;
	id: string;
	slug: string;
	title: string;
	description: string;
	author: string;
	downloads: number;
	iconUrl: string | null;
	url: string;
	projectType: string;
	categories: string[];
	downloadUrl?: string | null;
	filename?: string;
};

export type AddonLoader = 'paper' | 'spigot' | 'purpur' | 'fabric' | 'forge' | 'neoforge' | 'quilt' | 'any';

export type AddonVersion = {
	id: string;
	name: string;
	gameVersions: string[];
	loaders: string[];
	published: string;
	downloads: number;
	filename: string | null;
	url: string | null;
	channel: string;
};

const MODRINTH = 'https://api.modrinth.com/v2';
const CURSEFORGE = 'https://api.curseforge.com/v1';
const USER_AGENT = 'Neoactyl/1.0 (addon-installer)';

const sanitizeFilename = (value: string) => {
	const cleaned = value.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '');
	return cleaned.slice(0, 160) || 'addon.jar';
};

const modrinthFacet = (loader: AddonLoader) => {
	const facets: string[][] = [];

	if (loader === 'any') return facets;

	const pluginLoaders: AddonLoader[] = ['paper', 'spigot', 'purpur'];
	if (pluginLoaders.includes(loader)) facets.push(['project_type:plugin']);
	else facets.push(['project_type:mod']);

	facets.push([`categories:${loader === 'purpur' ? 'paper' : loader}`]);
	return facets;
};

export const searchModrinth = async (
	query: string,
	loader: AddonLoader = 'any',
	limit = 20
): Promise<AddonHit[]> => {
	const params = new URLSearchParams({
		query: query.trim(),
		limit: String(Math.min(50, Math.max(1, limit))),
		index: 'relevance'
	});

	const facets = modrinthFacet(loader);
	if (facets.length > 0) params.set('facets', JSON.stringify(facets));

	const response = await fetchWithTimeout(
		`${MODRINTH}/search?${params}`,
		{ headers: { 'User-Agent': USER_AGENT } },
		10_000
	);

	if (!response.ok) throw new Error(`Modrinth search failed (${response.status}).`);

	const body = (await response.json()) as {
		hits?: Array<{
			project_id?: string;
			slug?: string;
			title?: string;
			description?: string;
			author?: string;
			downloads?: number;
			icon_url?: string | null;
			categories?: string[];
			project_type?: string;
		}>;
	};

	return (body.hits ?? []).map((hit) => ({
		source: 'modrinth',
		id: hit.project_id ?? hit.slug ?? '',
		slug: hit.slug ?? '',
		title: hit.title ?? 'Unknown project',
		description: hit.description ?? '',
		author: hit.author ?? '',
		downloads: hit.downloads ?? 0,
		iconUrl: hit.icon_url ?? null,
		url: hit.slug ? `https://modrinth.com/project/${hit.slug}` : 'https://modrinth.com',
		projectType: hit.project_type ?? 'mod',
		categories: hit.categories ?? []
	}));
};

type ModrinthVersion = {
	id: string;
	version_number?: string;
	name?: string;
	version_type?: string;
	date_published?: string;
	downloads?: number;
	game_versions?: string[];
	loaders?: string[];
	files?: Array<{ url?: string; filename?: string; primary?: boolean }>;
};

const versionFile = (version: ModrinthVersion) =>
	version.files?.find((entry) => entry.primary && entry.url) ??
	version.files?.find((entry) => entry.url);

const toAddonVersion = (version: ModrinthVersion): AddonVersion => {
	const file = versionFile(version);

	return {
		id: version.id,
		name: version.version_number || version.name || version.id,
		gameVersions: version.game_versions ?? [],
		loaders: version.loaders ?? [],
		published: version.date_published ?? '',
		downloads: version.downloads ?? 0,
		filename: file?.filename ? sanitizeFilename(file.filename) : null,
		url: file?.url ?? null,
		channel: version.version_type ?? 'release'
	};
};

export const listModrinthVersions = async (
	projectId: string,
	loader: AddonLoader = 'any'
): Promise<AddonVersion[]> => {
	const params = new URLSearchParams();

	if (loader !== 'any') {
		params.set('loaders', JSON.stringify([loader === 'purpur' ? 'paper' : loader]));
	}

	const response = await fetchWithTimeout(
		`${MODRINTH}/project/${encodeURIComponent(projectId)}/version?${params}`,
		{ headers: { 'User-Agent': USER_AGENT } },
		10_000
	);

	if (!response.ok) throw new Error(`Modrinth versions failed (${response.status}).`);

	return ((await response.json()) as ModrinthVersion[]).map(toAddonVersion);
};

export const resolveModrinthDownload = async (
	projectId: string,
	loader: AddonLoader = 'any',
	versionId?: string
): Promise<{ url: string; filename: string; version: string }> => {
	let version: ModrinthVersion | undefined;

	if (versionId) {
		const response = await fetchWithTimeout(
			`${MODRINTH}/version/${encodeURIComponent(versionId)}`,
			{ headers: { 'User-Agent': USER_AGENT } },
			10_000
		);

		if (!response.ok) throw new Error(`Modrinth version lookup failed (${response.status}).`);

		version = (await response.json()) as ModrinthVersion;
	} else {
		const params = new URLSearchParams();

		if (loader !== 'any') {
			params.set('loaders', JSON.stringify([loader === 'purpur' ? 'paper' : loader]));
		}

		const response = await fetchWithTimeout(
			`${MODRINTH}/project/${encodeURIComponent(projectId)}/version?${params}`,
			{ headers: { 'User-Agent': USER_AGENT } },
			10_000
		);

		if (!response.ok) throw new Error(`Modrinth versions failed (${response.status}).`);

		const versions = (await response.json()) as ModrinthVersion[];
		version =
			versions.find((entry) => entry.files?.some((file) => file.primary && file.url)) ??
			versions[0];
	}

	const file = version ? versionFile(version) : undefined;

	if (!version || !file?.url) {
		throw new Error('No downloadable file was found for that project.');
	}

	return {
		url: file.url,
		filename: sanitizeFilename(file.filename ?? `${projectId}.jar`),
		version: version.version_number ?? version.name ?? 'latest'
	};
};

export const searchCurseforge = async (query: string, limit = 20): Promise<AddonHit[]> => {
	const key = getSetting('addons.curseforgeKey').trim();
	if (!key) return [];

	const params = new URLSearchParams({
		gameId: '432',
		searchFilter: query.trim(),
		sortField: '2',
		sortOrder: 'desc',
		pageSize: String(Math.min(50, Math.max(1, limit)))
	});

	const response = await fetchWithTimeout(
		`${CURSEFORGE}/mods/search?${params}`,
		{ headers: { 'x-api-key': key, Accept: 'application/json' } },
		10_000
	);

	if (!response.ok) throw new Error(`CurseForge search failed (${response.status}).`);

	const body = (await response.json()) as {
		data?: Array<{
			id?: number;
			slug?: string;
			name?: string;
			summary?: string;
			authors?: Array<{ name?: string }>;
			downloadCount?: number;
			logo?: { thumbnailUrl?: string | null };
			links?: { websiteUrl?: string };
			latestFiles?: Array<{ downloadUrl?: string | null; fileName?: string }>;
		}>;
	};

	return (body.data ?? []).map((hit) => {
		const file = hit.latestFiles?.[0];
		return {
			source: 'curseforge' as const,
			id: String(hit.id ?? ''),
			slug: hit.slug ?? '',
			title: hit.name ?? 'Unknown project',
			description: hit.summary ?? '',
			author: hit.authors?.[0]?.name ?? '',
			downloads: hit.downloadCount ?? 0,
			iconUrl: hit.logo?.thumbnailUrl ?? null,
			url: hit.links?.websiteUrl ?? 'https://www.curseforge.com',
			projectType: 'mod',
			categories: [],
			downloadUrl: file?.downloadUrl ?? null,
			filename: file?.fileName ? sanitizeFilename(file.fileName) : undefined
		};
	});
};

export const listCurseforgeVersions = async (projectId: string): Promise<AddonVersion[]> => {
	const key = getSetting('addons.curseforgeKey').trim();
	if (!key) return [];

	const response = await fetchWithTimeout(
		`${CURSEFORGE}/mods/${encodeURIComponent(projectId)}/files?pageSize=50`,
		{ headers: { 'x-api-key': key, Accept: 'application/json' } },
		10_000
	);

	if (!response.ok) throw new Error(`CurseForge versions failed (${response.status}).`);

	const body = (await response.json()) as {
		data?: Array<{
			id?: number;
			displayName?: string;
			fileName?: string;
			fileDate?: string;
			fileLength?: number;
			downloadCount?: number;
			downloadUrl?: string | null;
			gameVersions?: string[];
			releaseType?: number;
		}>;
	};

	const channels = ['release', 'beta', 'alpha'];

	return (body.data ?? []).map((file) => ({
		id: String(file.id ?? ''),
		name: file.displayName || file.fileName || String(file.id ?? ''),
		gameVersions: (file.gameVersions ?? []).filter((entry) => /^\d/.test(entry)),
		loaders: (file.gameVersions ?? []).filter((entry) => !/^\d/.test(entry)),
		published: file.fileDate ?? '',
		downloads: file.downloadCount ?? 0,
		filename: file.fileName ? sanitizeFilename(file.fileName) : null,
		url: file.downloadUrl ?? null,
		channel: channels[file.releaseType ?? 0] ?? 'release'
	}));
};

export const listAddonVersions = async (
	source: AddonSource,
	projectId: string,
	loader: AddonLoader = 'any'
): Promise<AddonVersion[]> =>
	source === 'modrinth'
		? listModrinthVersions(projectId, loader)
		: listCurseforgeVersions(projectId);

export const searchAddons = async (
	query: string,
	loader: AddonLoader,
	source: AddonSource | 'all' = 'all'
) => {
	const results: AddonHit[] = [];
	const errors: string[] = [];

	if (source !== 'curseforge') {
		try {
			results.push(...(await searchModrinth(query, loader)));
		} catch (cause) {
			errors.push(cause instanceof Error ? cause.message : 'Modrinth search failed.');
		}
	}

	if (source !== 'modrinth') {
		try {
			results.push(...(await searchCurseforge(query)));
		} catch (cause) {
			errors.push(cause instanceof Error ? cause.message : 'CurseForge search failed.');
		}
	}

	return { results, errors };
};

export const installAddon = async (
	adapter: Adapter,
	serverId: string,
	input: {
		source: AddonSource;
		projectId: string;
		loader: AddonLoader;
		directory: string;
		versionId?: string;
		url?: string;
		filename?: string;
	}
): Promise<FileEntry> => {
	if (input.source === 'modrinth') {
		const file = await resolveModrinthDownload(input.projectId, input.loader, input.versionId);
		return adapter.downloadToServer(serverId, input.directory, file.filename, file.url);
	}

	let selectedUrl = input.url;
	let selectedFilename = input.filename;

	if (input.versionId) {
		const versions = await listCurseforgeVersions(input.projectId);
		const version = versions.find((entry) => entry.id === input.versionId);

		if (!version) {
			throw new Error('The selected CurseForge version is no longer available.');
		}

		selectedUrl = version.url ?? undefined;
		selectedFilename = version.filename ?? selectedFilename;

		if (!selectedUrl) {
			throw new Error(
				'CurseForge did not provide a direct download URL for that version. Upload the file manually or use Modrinth.'
			);
		}
	}

	if (!selectedUrl) {
		throw new Error(
			'CurseForge did not provide a direct download URL. Upload the file manually or use Modrinth.'
		);
	}

	let parsed: URL;
	try {
		parsed = new URL(selectedUrl);
	} catch {
		throw new Error('The addon download URL is invalid.');
	}

	if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
		throw new Error('Only HTTP(S) addon downloads are supported.');
	}

	return adapter.downloadToServer(
		serverId,
		input.directory,
		sanitizeFilename(selectedFilename ?? `${input.projectId}.jar`),
		parsed.toString()
	);
};

export const defaultAddonDirectory = (loader: AddonLoader): string =>
	['fabric', 'forge', 'neoforge', 'quilt'].includes(loader) ? '/mods' : '/plugins';
