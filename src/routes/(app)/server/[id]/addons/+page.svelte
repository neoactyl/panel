<script lang="ts">
	import { enhance } from '$app/forms';
	import IconSearch from '@tabler/icons-svelte/icons/search';
	import IconDownload from '@tabler/icons-svelte/icons/download';
	import IconPackage from '@tabler/icons-svelte/icons/package';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let busy = $state('');

	const loaders = ['paper', 'spigot', 'purpur', 'fabric', 'forge', 'neoforge', 'quilt', 'any'];

	const install = (args: {
		source: string;
		projectId: string;
		url?: string | null;
		filename?: string;
	}) => {
		return () => {
			busy = `${args.source}:${args.projectId}`;
			return async ({ update }: { update: () => Promise<void> }) => {
				await update();
				busy = '';
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

					<form
						method="POST"
						action="?/install"
						use:enhance={install({
							source: result.source,
							projectId: result.id
						})}
						class="shrink-0"
					>
						<input type="hidden" name="source" value={result.source} />
						<input type="hidden" name="projectId" value={result.id} />
						<input type="hidden" name="loader" value={data.loader} />
						<input type="hidden" name="directory" value={data.directory} />
						{#if result.downloadUrl}
							<input type="hidden" name="url" value={result.downloadUrl} />
						{/if}
						{#if result.filename}
							<input type="hidden" name="filename" value={result.filename} />
						{/if}
						<button
							type="submit"
							disabled={busy === `${result.source}:${result.id}`}
							class="flex items-center gap-2 border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-[10px] font-semibold tracking-widest text-indigo-200 uppercase transition hover:bg-indigo-500/20 disabled:opacity-40"
						>
							<IconDownload class="size-3.5" />
							{busy === `${result.source}:${result.id}` ? 'Installing...' : 'Install'}
						</button>
					</form>
				</div>
			{/each}
		</div>
	{/if}
</div>
