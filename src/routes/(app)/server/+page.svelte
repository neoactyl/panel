<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import IconSearch from '@tabler/icons-svelte/icons/search';
	import IconPlus from '@tabler/icons-svelte/icons/plus';
	import IconChevronRight from '@tabler/icons-svelte/icons/chevron-right';
	import IconServer from '@tabler/icons-svelte/icons/server';
	import IconPlayerPlay from '@tabler/icons-svelte/icons/player-play';
	import IconPlayerStop from '@tabler/icons-svelte/icons/player-stop';
	import IconRefresh from '@tabler/icons-svelte/icons/refresh';
	import IconTrash from '@tabler/icons-svelte/icons/trash';
	import IconLoader from '@tabler/icons-svelte/icons/loader-2';
	import IconBolt from '@tabler/icons-svelte/icons/bolt';
	import type { PageProps } from './$types';
	import { adapter } from '#lib/adapter/client.ts';
	import type { Server, ServerAction, ServerState } from '#lib/adapter/sdk.ts';
	import { usageColor } from '#lib/client/usage-color.ts';

	let { data }: PageProps = $props();

	let servers = $state<Server[]>(untrack(() => structuredClone(data.servers)));
	let query = $state('');
	let filter = $state<'all' | 'running' | 'offline'>('all');
	let pending = $state<Record<string, ServerState | 'delete' | null>>({});
	let confirming = $state<string | null>(null);


	const STATE_STYLES: Record<ServerState, string> = {
		running: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
		starting: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300',
		stopping: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
		installing: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
		suspended: 'border-red-500/30 bg-red-500/10 text-red-300',
		offline: 'border-white/10 bg-white/5 text-white/50',
		unknown: 'border-white/10 bg-white/5 text-white/50'
	};

	const filtered = $derived(
		servers.filter((server) => {
			const matchesQuery =
				!query ||
				server.name.toLowerCase().includes(query.toLowerCase()) ||
				server.node.toLowerCase().includes(query.toLowerCase()) ||
				server.id.toLowerCase().includes(query.toLowerCase());
			const matchesFilter =
				filter === 'all' ||
				(filter === 'running' ? server.state === 'running' : server.state === 'offline');
			return matchesQuery && matchesFilter;
		})
	);

	const counts = $derived({
		total: servers.length,
		running: servers.filter((s) => s.state === 'running').length,
		offline: servers.filter((s) => s.state === 'offline').length
	});

	const resources = (server: Server) => [
		{ label: 'CPU', used: server.cpu.used, limit: server.cpu.limit, unit: '%' },
		{
			label: 'Memory',
			used: server.memory.used / 1024,
			limit: server.memory.limit / 1024,
			unit: 'GB'
		},
		{
			label: 'Disk',
			used: server.disk.used / 1024,
			limit: server.disk.limit / 1024,
			unit: 'GB'
		}
	];

	const pct = (used: number, limit: number) => (limit ? Math.min(100, (used / limit) * 100) : 0);

	const power = async (server: Server, action: ServerAction) => {
		if (pending[server.id]) return;
		const transitional: ServerState =
			action === 'start' || action === 'restart' ? 'starting' : 'stopping';
		pending = { ...pending, [server.id]: transitional };

		try {
			if (action === 'start') await adapter.startServer(server.id);
			else if (action === 'stop') await adapter.stopServer(server.id);
			else if (action === 'restart') await adapter.restartServer(server.id);
			else await adapter.killServer(server.id);

			servers = await adapter.getServers();
		} finally {
			const rest = { ...pending };
			delete rest[server.id];
			pending = rest;
		}
	};

	const remove = async (id: string) => {
		await adapter.deleteServer(id);
		servers = servers.filter((s) => s.id !== id);
		confirming = null;
	};


</script>

<svelte:head>
	<title>Servers - {data.branding.name}</title>
</svelte:head>

<div in:fly={{ y: 16, duration: 350, easing: cubicOut }} class="mx-auto max-w-4xl">
	<header class="mb-6 flex flex-wrap items-center justify-between gap-4">
		<div>
			<h1 class="text-xl font-extrabold tracking-tight text-white">Servers</h1>
			<p class="mt-1 text-sm text-white/60">
				{counts.total} total · {counts.running} running · {counts.offline} offline
			</p>
		</div>
		{#if data.allowCreate}
			<a
				href="/server/create"
				class="flex items-center gap-2 border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition duration-150 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500"
			>
				<IconPlus class="h-4 w-4" />
				New server
			</a>
		{/if}
	</header>


	<div class="mb-2 flex flex-wrap items-center gap-3">
		<div class="relative flex-1 min-w-56">
			<IconSearch class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-white/40" />
			<input
				bind:value={query}
				placeholder="Search by name, node or UUID"
				class="w-full border border-white/10 bg-[#1a1a1a] py-2 pr-3 pl-9 text-sm text-white placeholder:text-white/30 focus:border-indigo-500/60 focus:outline-none"
			/>
		</div>
		<div class="flex border border-white/10">
			{#each [['all', 'All'], ['running', 'Running'], ['offline', 'Offline']] as [value, label] (value)}
				<button
					type="button"
					onclick={() => (filter = value as 'all' | 'running' | 'offline')}
					class="px-3 py-2 text-xs font-semibold tracking-wider uppercase transition
						{filter === value ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white'}"
				>
					{label}
				</button>
			{/each}
		</div>
	</div>

	{#if filtered.length === 0}
		<div class="flex flex-col items-center gap-3 border border-white/10 bg-[#1a1a1a] py-16 text-center">
			<IconServer class="h-8 w-8 text-white/20" />
			<p class="text-sm text-white/50">No servers match your filters.</p>
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			{#each filtered as server, index (server.id)}
				<div
					in:fly={{ y: 12, duration: 300, delay: 60 + Math.min(index, 8) * 50, easing: cubicOut }}
					role="link"
					tabindex="0"
					aria-label="Open {server.name}"
					onclick={(event) => {
						if (event.target instanceof Element && event.target.closest('button, a')) return;
						goto(`/server/${server.id}/console`);
					}}
					onkeydown={(event) => {
						if (event.target !== event.currentTarget) return;
						if (event.key !== 'Enter' && event.key !== ' ') return;
						event.preventDefault();
						goto(`/server/${server.id}/console`);
					}}
					class="cursor-pointer border border-white/10 bg-[#1a1a1a] p-5 transition duration-150 hover:border-white/20 focus:outline-none focus:ring-1 focus:ring-indigo-500"
				>
					<div class="flex flex-wrap items-start justify-between gap-4">
						<div class="flex min-w-0 items-start gap-4">
							<div class="flex h-10 w-10 shrink-0 items-center justify-center border border-white/10 bg-white/5">
								<IconServer class="h-5 w-5 text-white/60" />
							</div>
							<div class="min-w-0">
								<div class="flex items-center gap-2">
									<a
										href="/server/{server.id}/console"
										class="group/link flex min-w-0 items-center gap-1.5 text-sm font-bold text-white transition hover:text-indigo-300"
									>
										<span class="truncate">{server.name}</span>
										<IconChevronRight
											class="h-3.5 w-3.5 shrink-0 text-white/30 transition group-hover/link:translate-x-0.5 group-hover/link:text-indigo-300"
										/>
									</a>
									<span
										class="border px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase {STATE_STYLES[
											server.state
										]}"
									>
										{server.state}
									</span>
								</div>
								<p class="mt-1 text-xs text-white/50">{server.description}</p>
								<p class="mt-1 font-mono text-[11px] text-white/30">
									{server.id} · {server.node}
								</p>
							</div>
						</div>

						<div class="flex items-center gap-2">
							{#each server.actions as action (action)}
								<button
									type="button"
									onclick={() => power(server, action)}
									disabled={!!pending[server.id]}
									class="flex items-center gap-2 border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 {action ===
									'start'
										? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
										: action === 'kill'
											? 'border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20'
											: 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10'}"
								>
									{#if pending[server.id]}
										<IconLoader class="h-3.5 w-3.5 animate-spin" />
									{:else if action === 'start'}
										<IconPlayerPlay class="h-3.5 w-3.5" />
									{:else if action === 'stop'}
										<IconPlayerStop class="h-3.5 w-3.5" />
									{:else if action === 'restart'}
										<IconRefresh class="h-3.5 w-3.5" />
									{:else}
										<IconBolt class="h-3.5 w-3.5" />
									{/if}
									{action[0].toUpperCase() + action.slice(1)}
								</button>
							{/each}

							{#if confirming === server.id}
								<span class="flex items-center gap-2">
									<button
										type="button"
										onclick={() => remove(server.id)}
										class="border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/20"
									>
										Confirm
									</button>
									<button
										type="button"
										onclick={() => (confirming = null)}
										class="px-2 py-1.5 text-xs font-semibold text-white/50 transition hover:text-white"
									>
										Cancel
									</button>
								</span>
							{:else}
								<button
									type="button"
									onclick={() => (confirming = server.id)}
									aria-label="Delete server"
									class="flex h-8 w-8 items-center justify-center border border-white/10 text-white/40 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
								>
									<IconTrash class="h-4 w-4" />
								</button>
							{/if}
						</div>
					</div>

					<div class="mt-5 grid gap-4 sm:grid-cols-3">
						{#each resources(server) as resource (resource.label)}
							<div>
								<div class="mb-1.5 flex items-center justify-between text-xs">
									<span class="text-white/40">{resource.label}</span>
									<span class="font-mono text-white/60">
										{resource.used.toFixed(resource.unit === '%' ? 0 : 2)} /
										{resource.limit.toFixed(0)}{resource.unit}
									</span>
								</div>
								<div class="h-1 w-full bg-white/5">
									<div
										class="h-full transition-all duration-500"
										style="width: {pct(resource.used, resource.limit)}%; background-color: {usageColor(
											pct(resource.used, resource.limit)
										)}"
									></div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
