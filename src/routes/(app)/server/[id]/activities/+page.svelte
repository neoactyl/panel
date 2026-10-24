<script lang="ts">
	import IconHistory from '@tabler/icons-svelte/icons/history';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const formatDate = (value: string) =>
		new Date(value).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
</script>

<div class="mb-4">
	<h2 class="text-sm font-semibold text-white">Activities</h2>
	<p class="text-xs text-white/40">Audit log of actions performed on this server.</p>
</div>

<section class="border border-white/10 bg-[#1a1a1a]">
	{#each data.activities as activity (activity.id)}
		<div class="flex gap-4 border-b border-white/5 px-4 py-3 last:border-0 hover:bg-white/[0.02]">
			<div class="flex h-8 w-8 shrink-0 items-center justify-center border border-white/10 bg-white/5">
				<IconHistory class="h-4 w-4 text-white/40" />
			</div>
			<div class="min-w-0 flex-1">
				<div class="flex flex-wrap items-center gap-2">
					<span class="text-xs font-semibold text-white">{activity.actor}</span>
					<span class="font-mono text-[10px] text-indigo-300/80">{activity.event}</span>
				</div>
				<p class="mt-0.5 text-xs text-white/50">{activity.detail}</p>
			</div>
			<div class="shrink-0 text-right">
				<p class="text-[11px] text-white/40">{formatDate(activity.timestamp)}</p>
				<p class="font-mono text-[10px] text-white/25">{activity.ip}</p>
			</div>
		</div>
	{:else}
		<p class="px-4 py-8 text-center text-xs text-white/40">No activity recorded.</p>
	{/each}
</section>
