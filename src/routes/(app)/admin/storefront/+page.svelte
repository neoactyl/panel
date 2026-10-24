<script lang="ts">
	import IconPencil from '@tabler/icons-svelte/icons/pencil';
	import IconPlus from '@tabler/icons-svelte/icons/plus';
	import IconShoppingBag from '@tabler/icons-svelte/icons/shopping-bag';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const gigabytes = (megabytes: number) => `${(megabytes / 1024).toFixed(1)} GB`;
</script>

<svelte:head>
	<title>Storefront - {data.branding.name}</title>
</svelte:head>

<div class="space-y-5">
	<section class="border border-white/10 bg-[#1a1a1a] p-5">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div>
				<div class="flex items-center gap-2">
					<IconShoppingBag class="h-4 w-4 text-white/30" />
					<h2 class="text-sm font-bold text-white">Storefront items</h2>
				</div>
				<p class="mt-1 text-xs text-white/40">
					Full-server items provision a new server. Resource items add CPU, memory, and disk to an
					existing server.
				</p>
			</div>
			<a
				href="/admin/storefront/new"
				class="flex items-center gap-1.5 border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-500/20"
			>
				<IconPlus class="h-3.5 w-3.5" />
				New item
			</a>
		</div>

		{#if data.items.length === 0}
			<p class="mt-4 border border-dashed border-white/10 px-3 py-6 text-center text-xs text-white/35">
				No storefront items yet.
			</p>
		{:else}
			<div class="mt-4 overflow-x-auto border border-white/10">
				<table class="w-full min-w-[720px] text-left text-sm">
					<thead>
						<tr class="border-b border-white/10 text-[10px] tracking-widest text-white/40 uppercase">
							<th class="px-3 py-2 font-semibold">Item</th>
							<th class="px-3 py-2 font-semibold">Type</th>
							<th class="px-3 py-2 font-semibold">Resources</th>
							<th class="px-3 py-2 font-semibold">Price</th>
							<th class="px-3 py-2 font-semibold">After claim</th>
							<th class="px-3 py-2 font-semibold">Status</th>
							<th class="px-3 py-2 text-right font-semibold">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each data.items as item (item.id)}
							<tr class="border-b border-white/5 last:border-0">
								<td class="px-3 py-2">
									<p class="font-semibold text-white">{item.name}</p>
									<p class="text-xs text-white/40">
										{item.description || 'No description'}
									</p>
								</td>
								<td class="px-3 py-2 text-xs text-white/60">
									{item.kind === 'resource' ? 'Upgrade' : 'Server'}
								</td>
								<td class="px-3 py-2 text-xs text-white/60">
									{item.kind === 'resource' ? '+' : ''}{item.cpu}% - {gigabytes(item.memory)} RAM
									- {gigabytes(item.disk)} disk
								</td>
								<td class="px-3 py-2 text-xs text-white/60">
									<span class="block font-semibold text-white">{item.price}</span>
									<span class="block">Renewal {item.renewalPrice}</span>
									{#if item.kind === 'server'}
										<span class="block">{item.durationDays} days</span>
									{/if}
								</td>
								<td class="px-3 py-2 text-xs text-white/60">{item.successMode}</td>
								<td class="px-3 py-2">
									<span
										class="border px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase
											{item.enabled
											? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
											: 'border-white/10 bg-white/5 text-white/40'}"
									>
										{item.enabled ? 'Enabled' : 'Disabled'}
									</span>
								</td>
								<td class="px-3 py-2">
									<div class="flex justify-end">
										<a
											href="/admin/storefront/{item.id}"
											class="flex items-center gap-1 border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-white/70 transition hover:bg-white/10"
										>
											<IconPencil class="h-3 w-3" />
											Edit
										</a>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
</div>
