<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import IconActivity from '@tabler/icons-svelte/icons/activity';
	import IconDatabase from '@tabler/icons-svelte/icons/database';
	import IconRefresh from '@tabler/icons-svelte/icons/refresh';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const { enhance: resetEnhance, message: resetMessage, submitting: resetting } = superForm(
		data.resetForm,
		{ id: 'reset' }
	);

	const bytes = (value: number) => {
		const units = ['B', 'KB', 'MB', 'GB'];
		let amount = value;
		let unit = 0;
		while (amount >= 1024 && unit < units.length - 1) {
			amount /= 1024;
			unit += 1;
		}
		return `${amount.toFixed(1)} ${units[unit]}`;
	};

	const duration = (value: number) => {
		const hours = Math.floor(value / 3600);
		const minutes = Math.floor((value % 3600) / 60);
		return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
	};
</script>

<svelte:head>
	<title>System - {data.branding.name}</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-xl font-semibold tracking-tight text-white">System monitor</h1>
			<p class="mt-1 text-sm text-white/50">
				Request performance, cache activity, database health and container footprint.
			</p>
		</div>
		<form method="POST" action="?/reset" use:resetEnhance>
			<button
				type="submit"
				disabled={$resetting}
				class="flex items-center gap-2 border border-white/10 px-3 py-2 text-[10px] font-semibold tracking-widest text-white/60 uppercase transition hover:border-white/20 hover:text-white"
			>
				<IconRefresh class="size-3.5" /> Reset counters
			</button>
		</form>
	</div>

	{#if $resetMessage && typeof $resetMessage !== 'string'}
		<div
			class="border px-4 py-3 text-sm {$resetMessage.status === 'error'
				? 'border-red-500/30 bg-red-500/10 text-red-300'
				: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}"
		>
			{$resetMessage.text}
		</div>
	{/if}

	<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
		<div class="border border-white/10 bg-[#1a1a1a] p-4">
			<div class="text-[10px] tracking-widest text-white/40 uppercase">Requests</div>
			<div class="mt-2 text-2xl font-semibold text-white">{data.metrics.requests}</div>
			<div class="mt-1 text-xs text-white/40">
				{data.metrics.averageMs.toFixed(0)} ms average · {data.metrics.maxMs.toFixed(0)} ms max
			</div>
		</div>
		<div class="border border-white/10 bg-[#1a1a1a] p-4">
			<div class="text-[10px] tracking-widest text-white/40 uppercase">Error rate</div>
			<div class="mt-2 text-2xl font-semibold text-white">
				{data.metrics.errorRate.toFixed(2)}%
			</div>
			<div class="mt-1 text-xs text-white/40">{data.metrics.errors} server errors</div>
		</div>
		<div class="border border-white/10 bg-[#1a1a1a] p-4">
			<div class="text-[10px] tracking-widest text-white/40 uppercase">Settings cache</div>
			<div class="mt-2 text-2xl font-semibold text-white">
				{data.metrics.cache.hitRate.toFixed(1)}%
			</div>
			<div class="mt-1 text-xs text-white/40">
				{data.metrics.cache.hits} hits · {data.metrics.cache.misses} misses
			</div>
		</div>
		<div class="border border-white/10 bg-[#1a1a1a] p-4">
			<div class="text-[10px] tracking-widest text-white/40 uppercase">Uptime</div>
			<div class="mt-2 text-2xl font-semibold text-white">
				{duration(data.metrics.uptimeSeconds)}
			</div>
			<div class="mt-1 text-xs text-white/40">
				Since {new Date(data.metrics.startedAt).toLocaleString()}
			</div>
		</div>
	</div>

	<div class="grid gap-4 lg:grid-cols-2">
		<div class="border border-white/10 bg-[#1a1a1a] p-5">
			<div class="flex items-center gap-2">
				<IconDatabase class="size-4 text-white/50" />
				<h2 class="text-[10px] font-semibold tracking-widest text-white/50 uppercase">
					Database
				</h2>
			</div>
			<div class="mt-3 flex items-center gap-2">
				<span
					class="size-2 rounded-full {data.database.ok ? 'bg-emerald-500' : 'bg-red-500'}"
				></span>
				<span class="text-sm text-white">{data.database.ok ? 'Connected' : 'Unavailable'}</span>
				<span class="text-xs text-white/40">· {data.database.latencyMs} ms</span>
			</div>
			{#if !data.database.ok}
				<p class="mt-2 text-xs text-red-300">{data.database.error}</p>
			{/if}
			<div class="mt-4 grid grid-cols-2 gap-3 text-sm">
				<div>
					<div class="text-[10px] tracking-widest text-white/40 uppercase">Users</div>
					<div class="text-white">{data.counts.users}</div>
				</div>
				<div>
					<div class="text-[10px] tracking-widest text-white/40 uppercase">Servers</div>
					<div class="text-white">{data.counts.servers}</div>
				</div>
				<div>
					<div class="text-[10px] tracking-widest text-white/40 uppercase">Activity logs</div>
					<div class="text-white">{data.counts.activities}</div>
				</div>
				<div>
					<div class="text-[10px] tracking-widest text-white/40 uppercase">Error groups</div>
					<div class="text-white">{data.counts.errors}</div>
				</div>
				<div>
					<div class="text-[10px] tracking-widest text-white/40 uppercase">Transactions</div>
					<div class="text-white">{data.counts.transactions}</div>
				</div>
				<div>
					<div class="text-[10px] tracking-widest text-white/40 uppercase">Panel</div>
					<div class="text-white">
						{data.panel.adapter}
						<span class="text-xs {data.panel.reachable ? 'text-emerald-400' : 'text-red-400'}">
							· {data.panel.reachable ? 'online' : 'offline'}
						</span>
					</div>
				</div>
			</div>
		</div>

		<div class="border border-white/10 bg-[#1a1a1a] p-5">
			<div class="flex items-center gap-2">
				<IconActivity class="size-4 text-white/50" />
				<h2 class="text-[10px] font-semibold tracking-widest text-white/50 uppercase">
					Container footprint
				</h2>
			</div>
			<div class="mt-3 grid grid-cols-2 gap-3 text-sm">
				<div>
					<div class="text-[10px] tracking-widest text-white/40 uppercase">RSS</div>
					<div class="text-white">{bytes(data.runtime.rss)}</div>
				</div>
				<div>
					<div class="text-[10px] tracking-widest text-white/40 uppercase">Heap</div>
					<div class="text-white">
						{bytes(data.runtime.heapUsed)} / {bytes(data.runtime.heapTotal)}
					</div>
				</div>
				<div>
					<div class="text-[10px] tracking-widest text-white/40 uppercase">Node</div>
					<div class="text-white">{data.runtime.node}</div>
				</div>
				<div>
					<div class="text-[10px] tracking-widest text-white/40 uppercase">Platform</div>
					<div class="text-white">{data.runtime.platform} / {data.runtime.arch}</div>
				</div>
				<div>
					<div class="text-[10px] tracking-widest text-white/40 uppercase">PID</div>
					<div class="text-white">{data.runtime.pid}</div>
				</div>
				<div>
					<div class="text-[10px] tracking-widest text-white/40 uppercase">Process uptime</div>
					<div class="text-white">{duration(data.runtime.processUptime)}</div>
				</div>
			</div>
		</div>
	</div>

	<div class="space-y-3">
		<div class="flex items-center justify-between">
			<h2 class="text-[10px] font-semibold tracking-widest text-white/50 uppercase">
				Slow calls (≥ {data.slowThreshold} ms)
			</h2>
			<span class="text-[10px] tracking-widest text-white/30 uppercase">
				{data.metrics.slowCalls.length} recorded
			</span>
		</div>
		<div class="border border-white/10 bg-[#1a1a1a]">
			{#if data.metrics.slowCalls.length === 0}
				<div class="px-4 py-4 text-sm text-white/40">
					No slow calls have been recorded since the last reset.
				</div>
			{:else}
				<div class="divide-y divide-white/5">
					{#each data.metrics.slowCalls as call (call.at + call.path + call.durationMs)}
						<div class="flex items-center justify-between gap-3 px-4 py-2.5">
							<div class="flex min-w-0 items-center gap-2">
								<span class="shrink-0 font-mono text-[10px] text-indigo-300">{call.method}</span>
								<span class="truncate font-mono text-xs text-white/60">{call.path}</span>
							</div>
							<div class="flex shrink-0 items-center gap-3 text-[10px] tracking-widest text-white/40 uppercase">
								<span>{call.status || 'ERR'}</span>
								<span class="text-amber-300">{call.durationMs} ms</span>
								<span>{new Date(call.at).toLocaleTimeString()}</span>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>
