<script lang="ts">
	import { untrack } from 'svelte';
	import IconServer from '@tabler/icons-svelte/icons/server';
	import IconPlayerPlay from '@tabler/icons-svelte/icons/player-play';
	import IconPlayerStop from '@tabler/icons-svelte/icons/player-stop';
	import IconRefresh from '@tabler/icons-svelte/icons/refresh';
	import IconLoader from '@tabler/icons-svelte/icons/loader-2';
	import IconBolt from '@tabler/icons-svelte/icons/bolt';
	import { adapter } from '#lib/adapter/client.ts';
	import type { ServerAction, ServerState } from '#lib/adapter/sdk.ts';
	import { panelPrompts } from '#lib/panel/prompts.svelte.ts';
	import { createServerPanel, setServerPanel } from '#lib/panel/state.svelte.ts';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	const server = $derived(data.server);
	const panel = createServerPanel(
		untrack(() => server),
		untrack(() => data.consoleLines),
		untrack(() => data.allocations)
	);
	setServerPanel(panel);

	const STATE_STYLES: Record<ServerState, string> = {
		running: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
		starting: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300',
		stopping: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
		installing: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
		suspended: 'border-red-500/30 bg-red-500/10 text-red-300',
		offline: 'border-white/10 bg-white/5 text-white/50',
		unknown: 'border-white/10 bg-white/5 text-white/50'
	};

	const ACTIONS_BY_STATE: Record<ServerState, ServerAction[]> = {
		running: ['restart', 'stop', 'kill'],
		starting: ['stop', 'kill'],
		stopping: ['stop', 'kill'],
		offline: ['start'],
		installing: [],
		suspended: [],
		unknown: []
	};

	const availableActions = $derived(
		server.actions.filter((action) => ACTIONS_BY_STATE[panel.powerState].includes(action))
	);

	const ACTION_LABELS = {
		start: 'Start',
		stop: 'Stop',
		restart: 'Restart',
		kill: 'Kill'
	} as const;

	const ACTION_STYLES = {
		start: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20',
		stop: 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10',
		restart: 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10',
		kill: 'border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20'
	} as const;

	$effect(() => {
		if (data.prompts.length) panelPrompts.push(...data.prompts);
	});

	$effect(() => {
		if (!data.capabilities.console.history || data.capabilities.console.websocket) return;

		const id = setInterval(async () => {
			try {
				panel.syncLines(await adapter.getConsole(server.id));
			} catch {
				/* ignore transient polling errors */
			}
		}, 5000);

		return () => clearInterval(id);
	});
</script>

<svelte:head>
	<title>{server.name} - {data.branding.name}</title>
</svelte:head>

<div class="mx-auto max-w-4xl">
	<header class="mb-6 flex flex-wrap items-start justify-between gap-4">
		<div class="flex min-w-0 items-start gap-4">
			<div
				class="flex h-12 w-12 shrink-0 items-center justify-center border border-white/10 bg-[#1a1a1a]"
			>
				<IconServer class="h-6 w-6 text-white/60" />
			</div>
			<div class="min-w-0">
				<div class="flex flex-wrap items-center gap-2">
					<h1 class="truncate text-xl font-extrabold tracking-tight text-white">{server.name}</h1>
					<span
						class="border px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase {STATE_STYLES[
							panel.powerState
						]}"
					>
						{panel.powerState}
					</span>
				</div>
				<p class="mt-1 truncate font-mono text-[11px] text-white/40">
					{panel.address} · {server.node}
				</p>
			</div>
		</div>

		<div class="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
			{#each availableActions as action (action)}
				<button
					type="button"
					onclick={() => panel.power(action)}
					disabled={panel.powerPending}
					class="flex flex-1 items-center justify-center gap-2 border px-3 py-2 text-xs font-semibold transition disabled:opacity-50 sm:flex-none {ACTION_STYLES[
						action
					]}"
				>
					{#if panel.powerPending}
						<IconLoader class="h-4 w-4 animate-spin" />
					{:else if action === 'start'}
						<IconPlayerPlay class="h-4 w-4" />
					{:else if action === 'stop'}
						<IconPlayerStop class="h-4 w-4" />
					{:else if action === 'restart'}
						<IconRefresh class="h-4 w-4" />
					{:else}
						<IconBolt class="h-4 w-4" />
					{/if}
					{ACTION_LABELS[action]}
				</button>
			{/each}
		</div>
	</header>

	{#if panel.notice}
		<div
			class="mb-4 border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 text-xs font-medium text-indigo-200"
		>
			{panel.notice}
		</div>
	{/if}

	{@render children()}
</div>
