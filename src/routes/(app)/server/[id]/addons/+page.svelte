<script lang="ts">
	import { enhance } from '$app/forms';
	import IconSearch from '@tabler/icons-svelte/icons/search';
	import IconDownload from '@tabler/icons-svelte/icons/download';
	import IconPackage from '@tabler/icons-svelte/icons/package';
	import Modal from '#lib/components/app/Modal.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let busy = $state('');
	let installError = $state('');

	let versionOpen = $state(false);
	let versionLoading = $state(false);
	let versionError = $state('');
	let versionRequest = 0;
	let versions = $state<AddonVersion[]>([]);
	let selectedVersionId = $state('');
	let target = $state<{
		source: string;
		projectId: string;
		title: string;
		downloadUrl?: string | null;
		filename?: string;
	} | null>(null);

	type AddonVersion = {
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

	const loaders = ['paper', 'spigot', 'purpur', 'fabric', 'forge', 'neoforge', 'quilt', 'any'];

	const selectedVersion = $derived(
		versions.find((version) => version.id === selectedVersionId) ?? null
	);

	const versionLabel = (version: AddonVersion) => {
		const parts = [version.name];
		if (version.gameVersions.length > 0) parts.push(version.gameVersions.slice(0, 2).join(', '));
		if (version.channel !== 'release') parts.push(version.channel);
		return parts.join(' · ');
	};

	const openVersions = async (result: {
		source: string;
		id: string;
		title: string;
		downloadUrl?: string | null;
		filename?: string;
	}) => {
		target = {
			source: result.source,
			projectId: result.id,
			title: result.title,
			downloadUrl: result.downloadUrl,
			filename: result.filename
		};
		versionOpen = true;
		versionLoading = true;
		versionError = '';
		installError = '';
		versions = [];
		selectedVersionId = '';

		const requestId = ++versionRequest;
		const params = new URLSearchParams({
			source: result.source,
			projectId: result.id,
			loader: data.loader
		});

		try {
			const response = await fetch(`/api/addons/versions?${params}`);
			const body = (await response.json().catch(() => null)) as
				| { versions?: AddonVersion[]; message?: string }
				| null;

			if (requestId !== versionRequest) return;

			if (!response.ok) {
				throw new Error(body?.message ?? `Could not load versions (${response.status}).`);
			}

			versions = body?.versions ?? [];

			if (versions.length === 0) {
				versionError = 'No downloadable versions were found for this project.';
				return;
			}

			const preferred =
				versions.find((version) => version.channel === 'release' && version.url) ??
				versions.find((version) => version.url) ??
				versions[0];

			selectedVersionId = preferred?.id ?? '';
		} catch (cause) {
			if (requestId !== versionRequest) return;
			versionError = cause instanceof Error ? cause.message : 'Could not load versions.';
		} finally {
			if (requestId === versionRequest) versionLoading = false;
		}
	};

	const closeVersions = () => {
		if (busy) return;
		versionRequest += 1;
		versionLoading = false;
		versionOpen = false;
		target = null;
		versions = [];
		selectedVersionId = '';
		versionError = '';
		installError = '';
	};

	const install = (source: string, projectId: string) => {
		return () => {
			busy = `${source}:${projectId}`;
			installError = '';

			return async ({
				result,
				update
			}: {
				result: { type: string; data?: unknown };
				update: () => Promise<void>;
			}) => {
				await update();
				busy = '';

				if (result.type === 'success') {
					versionOpen = false;
					target = null;
					return;
				}

				if (result.type === 'failure') {
					installError =
						(result.data as { error?: string } | null)?.error ??
						'The addon could not be installed.';
				} else if (result.type !== 'success') {
					installError = 'The addon could not be installed. Try again.';
				}
			};
		};
	};
</script>

<svelte:head>
	<title>Addons - {data.branding.name}</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-xl font-semibold tracking-tight text-white">Addon installer</h1>
		<p class="mt-1 text-sm text-white/50">
			Search Modrinth{data.curseforgeConfigured ? ' and CurseForge' : ''} and install plugins or
			mods directly onto this server.
		</p>
	</div>

	{#if form?.error}
		<div class="border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
			{form.error}
		</div>
	{/if}
	{#if form?.installed}
		<div
			class="border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300"
		>
			Installed {form.installed} to {form.directory}.
		</div>
	{/if}

	<form method="GET" class="border border-white/10 bg-[#1a1a1a] p-4">
		<div class="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
			<div class="relative">
				<IconSearch class="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/30" />
				<input
					name="q"
					value={data.query}
					placeholder="Search projects..."
					class="w-full border border-white/10 bg-black/30 py-2 pr-3 pl-9 text-sm text-white placeholder:text-white/20 focus:border-indigo-500 focus:outline-none"
				/>
			</div>
			<select
				name="loader"
				class="border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
			>
				{#each loaders as loader (loader)}
					<option value={loader} selected={data.loader === loader}>{loader}</option>
				{/each}
			</select>
			<select
				name="source"
				class="border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
			>
				<option value="all" selected={data.source === 'all'}>All sources</option>
				<option value="modrinth" selected={data.source === 'modrinth'}>Modrinth</option>
				<option value="curseforge" selected={data.source === 'curseforge'}>CurseForge</option>
			</select>
		</div>
		<button
			type="submit"
			class="mt-3 border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-[10px] font-semibold tracking-widest text-indigo-200 uppercase transition hover:bg-indigo-500/20"
		>
			Search
		</button>
	</form>

	{#if data.errors.length > 0}
		<div class="space-y-2">
			{#each data.errors as message (message)}
				<div class="border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
					{message}
				</div>
			{/each}
		</div>
	{/if}

	{#if data.query && data.results.length === 0 && data.errors.length === 0}
		<div class="border border-white/10 bg-[#1a1a1a] p-4 text-sm text-white/40">
			No projects matched that search.
		</div>
	{/if}

	{#if data.results.length > 0}
		<div class="grid gap-3">
			{#each data.results as result (result.source + result.id)}
				<div class="flex items-start gap-4 border border-white/10 bg-[#1a1a1a] p-4">
					{#if result.iconUrl}
						<img src={result.iconUrl} alt="" class="size-12 shrink-0 object-cover" />
					{:else}
						<div class="flex size-12 shrink-0 items-center justify-center bg-white/5">
							<IconPackage class="size-5 text-white/30" />
						</div>
					{/if}

					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-2">
							<a
								href={result.url}
								target="_blank"
								rel="noopener noreferrer"
								class="text-sm font-semibold text-white hover:text-indigo-300"
							>
								{result.title}
							</a>
							<span
								class="border border-white/10 px-1.5 py-0.5 text-[9px] tracking-widest text-white/40 uppercase"
							>
								{result.source}
							</span>
							<span class="text-[10px] tracking-widest text-white/30 uppercase">
								{result.downloads.toLocaleString()} downloads
							</span>
						</div>
						<p class="mt-1 line-clamp-2 text-xs text-white/40">{result.description}</p>
						<div class="mt-2 flex flex-wrap gap-1">
							{#each result.categories.slice(0, 5) as category (category)}
								<span class="bg-white/5 px-1.5 py-0.5 text-[9px] text-white/40">{category}</span>
							{/each}
						</div>
					</div>

					<button
						type="button"
						onclick={() => openVersions(result)}
						disabled={busy === `${result.source}:${result.id}`}
						class="flex shrink-0 items-center gap-2 border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-[10px] font-semibold tracking-widest text-indigo-200 uppercase transition hover:bg-indigo-500/20 disabled:opacity-40"
					>
						<IconDownload class="size-3.5" />
						{busy === `${result.source}:${result.id}` ? 'Installing...' : 'Install'}
					</button>
				</div>
			{/each}
		</div>
	{/if}
</div>

<Modal
	open={versionOpen}
	title={target ? `Install ${target.title}` : 'Choose a version'}
	description="Select the exact release to install into this server."
	onclose={closeVersions}
	size="lg"
>
	{#if target}
		<form
			id="install-addon"
			method="POST"
			action="?/install"
			use:enhance={install(target.source, target.projectId)}
			class="space-y-4"
		>
			<input type="hidden" name="source" value={target.source} />
			<input type="hidden" name="projectId" value={target.projectId} />
			<input type="hidden" name="loader" value={data.loader} />
			<input type="hidden" name="directory" value={data.directory} />
			{#if target.downloadUrl}
				<input type="hidden" name="url" value={target.downloadUrl} />
			{/if}
			{#if target.filename}
				<input type="hidden" name="filename" value={target.filename} />
			{/if}

			{#if versionLoading}
				<p class="text-sm text-white/40">Loading versions...</p>
			{:else if versions.length > 0}
				<label class="block">
					<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">
						Version
					</span>
					<select
						name="versionId"
						bind:value={selectedVersionId}
						class="mt-1 w-full border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white focus:border-indigo-500/60 focus:outline-none"
					>
						{#each versions as version (version.id)}
							<option value={version.id}>{versionLabel(version)}</option>
						{/each}
					</select>
				</label>

				{#if selectedVersion}
					<div class="grid gap-2 border border-white/10 bg-black/20 p-3 text-xs text-white/50">
						<div class="flex flex-wrap gap-x-6 gap-y-1">
							<span>Channel: <span class="text-white/80">{selectedVersion.channel}</span></span>
							{#if selectedVersion.gameVersions.length > 0}
								<span>
									Game versions:
									<span class="text-white/80">{selectedVersion.gameVersions.join(', ')}</span>
								</span>
							{/if}
						</div>
						{#if selectedVersion.loaders.length > 0}
							<span>
								Loaders:
								<span class="text-white/80">{selectedVersion.loaders.join(', ')}</span>
							</span>
						{/if}
						{#if selectedVersion.filename}
							<span class="truncate font-mono text-[11px] text-white/40">
								{selectedVersion.filename}
							</span>
						{/if}
						{#if selectedVersion && !selectedVersion.url}
							<p class="border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-200">
								This version does not provide a direct download. Pick another version.
							</p>
						{/if}
					</div>
				{/if}
			{:else}
				<p class="text-sm text-white/50">
					{versionError ||
						'The version list is unavailable. The latest compatible version will be installed.'}
				</p>
				<p class="text-xs text-white/30">
					You can still install the latest version{target.source === 'curseforge' && !target.downloadUrl
						? ', but this project requires a manual upload.'
						: '.'}
				</p>
			{/if}

			{#if installError}
				<p class="border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
					{installError}
				</p>
			{/if}
		</form>
	{:else}
		<p class="text-sm text-white/40">Loading...</p>
	{/if}

	{#snippet footer()}
		<button
			type="button"
			onclick={closeVersions}
			disabled={Boolean(busy)}
			class="border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/10 disabled:opacity-40"
		>
			Cancel
		</button>
		<button
			type="submit"
			form="install-addon"
			disabled={Boolean(busy) || versionLoading || (selectedVersion !== null && !selectedVersion.url) || (target?.source === 'curseforge' && !target.downloadUrl && versions.length === 0)}
			class="border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-500/20 disabled:opacity-40"
		>
			{busy ? 'Installing...' : 'Install'}
		</button>
	{/snippet}
</Modal>
