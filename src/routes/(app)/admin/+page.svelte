<script lang="ts">
	import { fly } from 'svelte/transition';
	import IconUsers from '@tabler/icons-svelte/icons/users';
	import IconShieldLock from '@tabler/icons-svelte/icons/shield-lock';
	import IconServer from '@tabler/icons-svelte/icons/server';
	import IconPlugConnected from '@tabler/icons-svelte/icons/plug-connected';
	import IconAlertTriangle from '@tabler/icons-svelte/icons/alert-triangle';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const cards = $derived([
		{ label: 'Users', value: data.counts.users, icon: IconUsers, href: '/admin/users' },
		{ label: 'Administrators', value: data.counts.admins, icon: IconShieldLock, href: '/admin/users' },
		{ label: 'Servers', value: data.counts.servers, icon: IconServer, href: '/admin/servers' }
	]);
</script>

<svelte:head>
	<title>Admin - {data.branding.name}</title>
</svelte:head>

<div in:fly={{ y: 12, duration: 300 }} class="space-y-6">
	<div class="grid gap-3 sm:grid-cols-3">
		{#each cards as card (card.label)}
			<a
				href={card.href}
				class="border border-white/10 bg-[#1a1a1a] p-5 transition hover:border-white/20"
			>
				<div class="flex items-center justify-between">
					<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">
						{card.label}
					</span>
					<card.icon class="h-4 w-4 text-white/30" />
				</div>
				<p class="mt-3 text-2xl font-extrabold text-white">{card.value}</p>
			</a>
		{/each}
	</div>

	<div class="grid gap-3 lg:grid-cols-2">
		<div class="border border-white/10 bg-[#1a1a1a] p-5">
			<div class="flex items-center justify-between">
				<h2 class="text-sm font-bold text-white">Panel connection</h2>
				<IconPlugConnected class="h-4 w-4 text-white/30" />
			</div>
			<dl class="mt-4 space-y-2 text-sm">
				<div class="flex justify-between gap-4">
					<dt class="text-white/45">Adapter</dt>
					<dd class="font-mono text-white/80">{data.panel.adapter}</dd>
				</div>
				<div class="flex justify-between gap-4">
					<dt class="text-white/45">Configured</dt>
					<dd class="text-white/80">{data.panel.configured ? 'Yes' : 'No'}</dd>
				</div>
				<div class="flex justify-between gap-4">
					<dt class="text-white/45">Reachable</dt>
					<dd class={data.panel.reachable ? 'text-emerald-300' : 'text-amber-300'}>
						{data.panel.reachable ? 'Yes' : 'No'}
					</dd>
				</div>
			</dl>
			{#if !data.panel.configured}
				<p class="mt-4 flex items-center gap-2 text-xs text-amber-300/80">
					<IconAlertTriangle class="h-3.5 w-3.5" />
					The selected adapter is missing credentials.
				</p>
			{/if}
			<a href="/admin/settings" class="mt-4 inline-block text-xs font-semibold text-indigo-300 hover:text-indigo-200">
				Edit panel settings
			</a>
		</div>

		<div class="border border-white/10 bg-[#1a1a1a] p-5">
			<h2 class="text-sm font-bold text-white">Default user quota</h2>
			<dl class="mt-4 space-y-2 text-sm">
				<div class="flex justify-between gap-4">
					<dt class="text-white/45">CPU</dt>
					<dd class="font-mono text-white/80">{data.quota.cpu}%</dd>
				</div>
				<div class="flex justify-between gap-4">
					<dt class="text-white/45">Memory</dt>
					<dd class="font-mono text-white/80">{(data.quota.memory / 1024).toFixed(1)} GB</dd>
				</div>
				<div class="flex justify-between gap-4">
					<dt class="text-white/45">Disk</dt>
					<dd class="font-mono text-white/80">{(data.quota.disk / 1024).toFixed(1)} GB</dd>
				</div>
			</dl>
			<a href="/admin/settings" class="mt-4 inline-block text-xs font-semibold text-indigo-300 hover:text-indigo-200">
				Edit resource limits
			</a>
		</div>
	</div>
</div>
