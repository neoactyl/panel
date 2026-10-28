<script lang="ts">
	import IconServer from '@tabler/icons-svelte/icons/server';
	import IconAlertTriangle from '@tabler/icons-svelte/icons/alert-triangle';
	import IconActivity from '@tabler/icons-svelte/icons/activity';
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type NodeCountryFlags = { allow: string[]; block: string[] };

	const countryOverrides = $derived(
		(data.countryOverrides ?? {}) as Record<string, NodeCountryFlags>
	);

	const splitList = (value: string) =>
		value
			.split(',')
			.map((entry) => entry.trim())
			.filter(Boolean);

	const toCountriesJson = (allow: string, block: string) =>
		JSON.stringify({
			allow: splitList(allow),
			block: splitList(block)
		});

	const nodeCountry = (nodeId: string) => {
		const override = countryOverrides[nodeId];
		return (
			countryDrafts[nodeId] ?? {
				allow: override?.allow.join(',') ?? '',
				block: override?.block.join(',') ?? ''
			}
		);
	};

	const countryDrafts = $state<Record<string, { allow: string; block: string }>>({});
</script>

<svelte:head>
	<title>Nodes - {data.branding.name}</title>
</svelte:head>

<div class="space-y-4">
	{#if data.panic}
		<div class="flex items-center gap-2 border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
			<IconAlertTriangle class="h-4 w-4" />
			{data.panic}
		</div>
	{/if}

	{#if form?.message || form?.success}
		<div
			class="border px-3 py-2 text-sm {form?.message
				? 'border-red-500/30 bg-red-500/10 text-red-200'
				: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}"
		>
			{form?.message ?? form?.success}
		</div>
	{/if}

	<p class="text-xs text-white/40">
		Manage nodes reported by the <span class="font-mono text-white/60">{data.adapter}</span> adapter:
		visibility, capacity, and country flags.
	</p>

	{#if data.nodes.length === 0}
		<div class="flex flex-col items-center gap-3 border border-white/10 bg-[#1a1a1a] py-16 text-center">
			<IconServer class="h-8 w-8 text-white/20" />
			<p class="text-sm text-white/50">No nodes were returned.</p>
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			{#each data.nodes as node (node.id)}
				{@const country = nodeCountry(node.id)}
				<div class="border border-white/10 bg-[#1a1a1a] p-4">
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div class="flex min-w-0 items-start gap-3">
							<div class="flex h-9 w-9 shrink-0 items-center justify-center border border-white/10 bg-white/5">
								<IconServer class="h-4 w-4 text-white/50" />
							</div>
							<div class="min-w-0">
								<div class="flex flex-wrap items-center gap-2">
									<p class="truncate text-sm font-bold text-white">{node.name}</p>
									<span
										class="border px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase {node.available
											? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
											: 'border-amber-500/30 bg-amber-500/10 text-amber-300'}"
									>
										{node.available ? 'Available' : (node.reason ?? 'Unavailable')}
									</span>
								</div>
								<p class="mt-1 font-mono text-[10px] text-white/35">{node.id}</p>
							</div>
						</div>
						<div class="flex items-center gap-2">
							<label class="flex items-center gap-2 text-xs text-white/60">
								<input type="checkbox" name="deploymentEnabled" value="true" checked={node.deploymentEnabled ?? true} class="h-4 w-4 accent-indigo-500" />
								<span>Deploy</span>
							</label>
							<label class="flex items-center gap-2 text-xs text-white/60">
								<input type="checkbox" name="maintenanceEnabled" value="true" checked={node.maintenanceEnabled ?? false} class="h-4 w-4 accent-indigo-500" />
								<span>Maintenance</span>
							</label>
						</div>
					</div>

					<div class="mt-4 grid gap-3 sm:grid-cols-4">
						<div class="border border-white/5 bg-[#121212] px-3 py-2">
							<p class="text-[10px] tracking-wider text-white/35 uppercase">Memory</p>
							<p class="mt-0.5 font-mono text-xs text-white/70">
								{Math.round(node.memory.allocated)}/{Math.round(node.memory.limit)} MB
							</p>
						</div>
						<div class="border border-white/5 bg-[#121212] px-3 py-2">
							<p class="text-[10px] tracking-wider text-white/35 uppercase">Disk</p>
							<p class="mt-0.5 font-mono text-xs text-white/70">
								{Math.round(node.disk.allocated)}/{Math.round(node.disk.limit)} MB
							</p>
						</div>
						<div class="border border-white/5 bg-[#121212] px-3 py-2">
							<p class="text-[10px] tracking-wider text-white/35 uppercase">Servers</p>
							<p class="mt-0.5 font-mono text-xs text-white/70">{node.servers}</p>
						</div>
						<div class="border border-white/5 bg-[#121212] px-3 py-2">
							<p class="text-[10px] tracking-wider text-white/35 uppercase">Allocations</p>
							<p class="mt-0.5 font-mono text-xs text-white/70">{node.allocations}</p>
						</div>
					</div>

					<form
						method="POST"
						action="?/updateNode"
						use:enhance
						class="mt-4 grid gap-3 border border-white/10 bg-[#121212] p-4 sm:grid-cols-4"
					>
						<input type="hidden" name="nodeId" value={node.id} />
						<label class="block">
							<span class="text-[10px] tracking-wider text-white/35 uppercase">Deploy enabled</span>
							<input type="checkbox" name="deploymentEnabled" value="true" checked={node.deploymentEnabled ?? true} class="mt-2 h-4 w-4 accent-indigo-500" />
						</label>
						<label class="block">
							<span class="text-[10px] tracking-wider text-white/35 uppercase">Maintenance enabled</span>
							<input type="checkbox" name="maintenanceEnabled" value="true" checked={node.maintenanceEnabled ?? false} class="mt-2 h-4 w-4 accent-indigo-500" />
						</label>
						<label class="block">
							<span class="text-[10px] tracking-wider text-white/35 uppercase">Memory limit (MB)</span>
							<input name="memory" type="number" min="1" step="1" defaultValue={node.memory.limit} class="mt-1 w-full border border-white/10 bg-[#0f0f0f] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50" />
						</label>
						<label class="block">
							<span class="text-[10px] tracking-wider text-white/35 uppercase">Disk limit (MB)</span>
							<input name="disk" type="number" min="1" step="1" defaultValue={node.disk.limit} class="mt-1 w-full border border-white/10 bg-[#0f0f0f] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50" />
						</label>
						<label class="block">
							<span class="text-[10px] tracking-wider text-white/35 uppercase">Max concurrent hosts</span>
							<input name="allocations" type="number" min="0" step="1" defaultValue={node.allocations > 0 ? node.allocations : 10} class="mt-1 w-full border border-white/10 bg-[#0f0f0f] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50" />
						</label>
						<div class="flex items-end">
							<button
								type="submit"
								class="border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-500/20"
							>
								Update node
							</button>
						</div>
					</form>

					<form
						method="POST"
						action="?/setNodeCountries"
						class="mt-4 grid gap-2 border border-white/10 bg-[#121212] p-4"
					>
						<input type="hidden" name="nodeId" value={node.id} />
						<input type="hidden" name="countries" value={toCountriesJson(country.allow, country.block)} />
						<div class="flex flex-wrap items-end gap-2">
							<label class="block">
								<span class="text-[10px] tracking-wider text-white/35 uppercase">Allow countries (comma separated)</span>
								<input
									name="allow"
									value={country.allow}
									placeholder="us, eu, jp"
									class="mt-1 w-full min-w-56 border border-white/10 bg-[#0f0f0f] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
								/>
							</label>
							<label class="block">
								<span class="text-[10px] tracking-wider text-white/35 uppercase">Block countries (comma separated)</span>
								<input
									name="block"
									value={country.block}
									placeholder="kp, ir"
									class="mt-1 w-full min-w-56 border border-white/10 bg-[#0f0f0f] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
								/>
							</label>
							<button
								type="submit"
								class="border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-500/20"
							>
								Save country flags
							</button>
						</div>
					</form>
				</div>
			{/each}
		</div>
	{/if}
</div>
