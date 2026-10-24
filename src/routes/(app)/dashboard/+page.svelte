<script lang="ts">
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import IconPlus from '@tabler/icons-svelte/icons/plus';
	import IconCpu from '@tabler/icons-svelte/icons/cpu';
	import IconMemory from '@tabler/icons-svelte/icons/memory';
	import IconDatabase from '@tabler/icons-svelte/icons/database';
	import IconServer from '@tabler/icons-svelte/icons/server';
	import IconChevronRight from '@tabler/icons-svelte/icons/chevron-right';
	import IconArrowRight from '@tabler/icons-svelte/icons/arrow-right';
	import type { ServerState } from '#lib/adapter/sdk.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const user = $derived(data.user);

	const STATE_STYLES: Record<ServerState, string> = {
		running: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
		starting: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300',
		stopping: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
		installing: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
		suspended: 'border-red-500/30 bg-red-500/10 text-red-300',
		offline: 'border-white/10 bg-white/5 text-white/50',
		unknown: 'border-white/10 bg-white/5 text-white/50'
	};

	const totals = $derived.by(() => {
		let cpu = 0;
		let memory = 0;
		let disk = 0;

		for (const server of data.servers) {
			cpu += server.cpu.limit;
			memory += server.memory.limit;
			disk += server.disk.limit;
		}

		return { cpu, memory, disk };
	});

	const usage = $derived([
		{
			label: 'CPU',
			icon: IconCpu,
			allocated: totals.cpu,
			total: data.quota.cpu,
			unit: '%'
		},
		{
			label: 'Memory',
			icon: IconMemory,
			allocated: totals.memory,
			total: data.quota.memory,
			unit: 'GB'
		},
		{
			label: 'Disk',
			icon: IconDatabase,
			allocated: totals.disk,
			total: data.quota.disk,
			unit: 'GB'
		}
	]);

	const display = (value: number, unit: string) =>
		unit === '%' ? String(Math.round(value)) : (value / 1024).toFixed(1);

	const percent = (value: number, total: number) =>
		total ? Math.min(100, Math.max(0, (value / total) * 100)) : 0;

	const recent = $derived(data.servers.slice(0, 4));
</script>

<svelte:head>
	<title>Dashboard - {data.branding.name}</title>
</svelte:head>

<div class="relative">
	<div class="mx-auto max-w-4xl">
		<header
			in:fly={{ y: 16, duration: 350, easing: cubicOut }}
			class="mb-8 flex flex-wrap items-end justify-between gap-4"
		>
			<div>
				<h1 class="text-xl font-extrabold tracking-tight text-white">
					Welcome back{user.name ? `, ${user.name}` : ''}
				</h1>
				<p class="mt-1 text-sm text-white/60">Here is an overview of your resources.</p>
			</div>
			{#if data.linked || !data.panelLinkAvailable}
				<a
					href="/server/create"
					class="flex items-center gap-2 border border-indigo-500/40 bg-indigo-500/15 px-4 py-2 text-sm font-semibold text-indigo-200 transition duration-150 hover:bg-indigo-500/25 focus:outline-none focus:ring-2 focus:ring-indigo-500"
				>
					<IconPlus class="h-4 w-4" />
					Create server
				</a>
			{/if}
		</header>

		{#if data.panelLinkAvailable && !data.linked}
			<div
				class="mb-8 flex flex-wrap items-center justify-between gap-3 border border-amber-500/30 bg-amber-500/10 p-4"
			>
				<p class="text-sm text-amber-100">
					Link your panel account to see your servers and resources.
				</p>
				<a
					href="/settings"
					class="border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/25"
				>
					Link account
				</a>
			</div>
		{/if}

		<section>
			<div
				in:fly={{ y: 16, duration: 350, delay: 60, easing: cubicOut }}
				class="mb-3 flex items-center justify-between"
			>
				<h2 class="text-xs font-semibold tracking-widest text-white/50 uppercase">Resources</h2>
				<span class="font-mono text-[10px] text-white/30">Allocated / left</span>
			</div>
			<div class="grid gap-4 sm:grid-cols-3">
				{#each usage as resource, index (resource.label)}
					<div
						in:fly={{ y: 18, duration: 350, delay: 90 + index * 60, easing: cubicOut }}
						class="border border-white/10 bg-[#1a1a1a] p-5"
					>
						<div class="mb-4 flex items-center gap-2 text-white/50">
							<resource.icon class="h-4 w-4" />
							<span class="text-xs font-semibold tracking-widest uppercase">{resource.label}</span>
						</div>
						<p class="text-2xl font-extrabold tracking-tight text-white">
							{display(resource.allocated, resource.unit)}<span class="ml-1 text-sm font-medium text-white/40"
								>{resource.unit}</span
							>
						</p>
						<p class="mt-1 text-xs text-white/40">
							{display(Math.max(0, resource.total - resource.allocated), resource.unit)}{resource.unit} left of
							{display(resource.total, resource.unit)}{resource.unit}
						</p>
						<div class="mt-4 h-1 w-full bg-white/5">
							<div
								class="h-full bg-indigo-500 transition-all duration-500"
								style="width: {percent(resource.allocated, resource.total)}%"
							></div>
						</div>
					</div>
				{/each}
			</div>
		</section>

		<section
			in:fly={{ y: 16, duration: 350, delay: 240, easing: cubicOut }}
			class="mt-8"
		>
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-xs font-semibold tracking-widest text-white/50 uppercase">Recent servers</h2>
				<a
					href="/server"
					class="group flex items-center gap-1 text-xs font-semibold text-white/40 transition hover:text-white"
				>
					View all
					<IconArrowRight class="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
				</a>
			</div>

			{#if recent.length}
				<div class="flex flex-col gap-2">
					{#each recent as server, index (server.id)}
						<a
							in:fly={{ y: 12, duration: 300, delay: 300 + index * 60, easing: cubicOut }}
							href="/server/{server.id}/console"
							class="group flex items-center justify-between gap-4 border border-white/10 bg-[#1a1a1a] p-4 transition duration-150 hover:border-white/20 hover:bg-white/[0.03]"
						>
							<div class="flex min-w-0 items-center gap-3">
								<div
									class="flex h-9 w-9 shrink-0 items-center justify-center border border-white/10 bg-white/5"
								>
									<IconServer class="h-4 w-4 text-white/60" />
								</div>
								<div class="min-w-0">
									<p class="truncate text-sm font-bold text-white transition group-hover:text-indigo-300">
										{server.name}
									</p>
									<p class="truncate text-xs text-white/40">{server.description || server.node}</p>
								</div>
							</div>
							<div class="flex shrink-0 items-center gap-3">
								<span
									class="border px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase {STATE_STYLES[
										server.state
									]}"
								>
									{server.state}
								</span>
								<IconChevronRight
									class="h-4 w-4 text-white/20 transition group-hover:translate-x-0.5 group-hover:text-indigo-300"
								/>
							</div>
						</a>
					{/each}
				</div>
			{:else}
				<div class="flex flex-col items-center gap-3 border border-white/10 bg-[#1a1a1a] py-14 text-center">
					<IconServer class="h-8 w-8 text-white/20" />
					<p class="text-sm text-white/50">No servers yet. Create your first one to get started.</p>
				</div>
			{/if}
		</section>
	</div>
</div>
