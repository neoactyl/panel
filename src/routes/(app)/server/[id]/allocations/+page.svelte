<script lang="ts">
	import { untrack } from 'svelte';
	import IconPlus from '@tabler/icons-svelte/icons/plus';
	import { adapter } from '#lib/adapter/client.ts';
	import { getServerPanel } from '#lib/panel/state.svelte.ts';
	import type { Allocation } from '#lib/adapter/sdk.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const panel = getServerPanel();

	let allocations = $state<Allocation[]>(untrack(() => [...data.allocations]));

	const addAllocation = async () => {
		try {
			const allocation = await adapter.createAllocation(panel.server.id);
			allocations = [...allocations, allocation];
			panel.showNotice(`Allocation :${allocation.port} created.`);
		} catch (cause) {
			panel.showNotice(cause instanceof Error ? cause.message : 'Could not add allocation.');
		}
	};

	const deleteAllocation = async (allocation: Allocation) => {
		try {
			await adapter.deleteAllocation(panel.server.id, allocation.id);
			allocations = allocations.filter((entry) => entry.id !== allocation.id);
			panel.showNotice(`Allocation :${allocation.port} deleted.`);
		} catch (cause) {
			panel.showNotice(cause instanceof Error ? cause.message : 'Could not delete allocation.');
		}
	};

	const makePrimary = async (allocation: Allocation) => {
		try {
			allocations = await adapter.setPrimaryAllocation(panel.server.id, allocation.id);
			panel.showNotice(`Allocation :${allocation.port} is now primary.`);
		} catch (cause) {
			panel.showNotice(cause instanceof Error ? cause.message : 'Could not update allocation.');
		}
	};
</script>

<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
	<div>
		<h2 class="text-sm font-semibold text-white">Allocations</h2>
		<p class="text-xs text-white/40">Ports and IPs assigned to this container.</p>
	</div>
	{#if data.capabilities.allocations}
		<button
			type="button"
			onclick={addAllocation}
			class="flex items-center gap-1.5 border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/10"
		>
			<IconPlus class="h-3.5 w-3.5" />
			Add allocation
		</button>
	{/if}
</div>

<section class="border border-white/10 bg-[#1a1a1a]">
	<table class="w-full text-left text-sm">
		<thead>
			<tr class="border-b border-white/10 text-[10px] tracking-widest text-white/40 uppercase">
				<th class="px-4 py-2 font-semibold">Address</th>
				<th class="px-4 py-2 font-semibold">Notes</th>
				<th class="px-4 py-2 font-semibold">Status</th>
				<th class="px-4 py-2"></th>
			</tr>
		</thead>
		<tbody>
			{#each allocations as allocation (allocation.id)}
				<tr class="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
					<td class="px-4 py-2.5 font-mono text-xs text-white/80">
						{allocation.ip}:{allocation.port}
					</td>
					<td class="px-4 py-2.5 text-xs text-white/40">{allocation.notes ?? '—'}</td>
					<td class="px-4 py-2.5">
						{#if allocation.primary}
							<span
								class="border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-indigo-300 uppercase"
							>
								Primary
							</span>
						{:else}
							<span class="text-xs text-white/40">Additional</span>
						{/if}
					</td>
					<td class="px-4 py-2.5">
						<div class="flex items-center justify-end gap-2">
							{#each allocation.actions ?? [] as action (action)}
								{#if action === 'primary'}
									<button
										type="button"
										onclick={() => makePrimary(allocation)}
										class="text-xs font-semibold text-white/50 transition hover:text-indigo-300"
									>
										Make primary
									</button>
								{:else if action === 'delete'}
									<button
										type="button"
										onclick={() => deleteAllocation(allocation)}
										class="text-xs font-semibold text-white/50 transition hover:text-red-300"
									>
										Delete
									</button>
								{/if}
							{/each}
						</div>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</section>
