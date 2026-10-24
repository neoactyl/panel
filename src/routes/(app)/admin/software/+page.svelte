<script lang="ts">
	import IconPackage from '@tabler/icons-svelte/icons/package';
	import IconSettings from '@tabler/icons-svelte/icons/settings';
	import IconStack2 from '@tabler/icons-svelte/icons/stack-2';
	import type { SoftwarePolicy } from '#lib/server/catalog/software-policy.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const limits = (policy: SoftwarePolicy) => {
		const parts: string[] = [];
		const range = (min: number | null, max: number | null, unit: string) => {
			if (min === null && max === null) return null;
			if (min !== null && max !== null) return `${min}-${max}${unit}`;
			if (min !== null) return `${min}${unit} min`;
			return `${max}${unit} max`;
		};

		const cpu = range(policy.minCpu, policy.maxCpu, '%');
		const memory = range(policy.minMemory, policy.maxMemory, ' MB');
		const disk = range(policy.minDisk, policy.maxDisk, ' MB');

		if (cpu) parts.push(`CPU ${cpu}`);
		if (memory) parts.push(`RAM ${memory}`);
		if (disk) parts.push(`Disk ${disk}`);

		return parts.length ? parts.join(' / ') : 'No resource limits';
	};
</script>

<svelte:head>
	<title>Software - {data.branding.name}</title>
</svelte:head>

<div class="space-y-5">
	<section class="border border-white/10 bg-[#1a1a1a] p-5">
		<div class="flex items-center gap-2">
			<IconStack2 class="h-4 w-4 text-white/30" />
			<div>
				<h2 class="text-sm font-bold text-white">Nests</h2>
				<p class="text-xs text-white/40">
					Control which nests users can deploy from and the resource limits applied to their eggs.
				</p>
			</div>
		</div>

		{#if data.catalogError}
			<p class="mt-4 border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
				{data.catalogError}
			</p>
		{/if}

		{#if data.groups.length === 0}
			<p class="mt-4 border border-dashed border-white/10 px-3 py-6 text-center text-xs text-white/35">
				No nests were returned by the panel.
			</p>
		{:else}
			<div class="mt-4 grid gap-3 sm:grid-cols-2">
				{#each data.groups as group (group.id)}
					<div class="border border-white/10 bg-[#121212] p-4">
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0">
								<p class="truncate text-sm font-semibold text-white">{group.name}</p>
								<p class="mt-0.5 line-clamp-2 text-xs text-white/40">
									{group.description || 'No description'}
								</p>
							</div>
							<span
								class="shrink-0 border px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase
									{group.policy.visible
									? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
									: 'border-white/10 bg-white/5 text-white/40'}"
							>
								{group.policy.visible ? 'Visible' : 'Hidden'}
							</span>
						</div>
						<p class="mt-3 text-[11px] text-white/40">{group.eggCount} eggs</p>
						<p class="mt-1 text-[11px] text-white/30">{limits(group.policy)}</p>
						<a
							href="/admin/software/{group.id}"
							class="mt-3 inline-flex items-center gap-1 border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-white/70 transition hover:bg-white/10"
						>
							<IconSettings class="h-3 w-3" />
							Configure nest
						</a>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<section class="border border-white/10 bg-[#1a1a1a] p-5">
		<div class="flex items-center gap-2">
			<IconPackage class="h-4 w-4 text-white/30" />
			<div>
				<h2 class="text-sm font-bold text-white">Eggs</h2>
				<p class="text-xs text-white/40">
					Egg settings override nest settings. Users only see visible eggs that belong to visible nests.
				</p>
			</div>
		</div>

		{#if data.eggs.length === 0}
			<p class="mt-4 border border-dashed border-white/10 px-3 py-6 text-center text-xs text-white/35">
				No eggs were returned by the panel.
			</p>
		{:else}
			<div class="mt-4 overflow-x-auto border border-white/10">
				<table class="w-full min-w-[720px] text-left text-sm">
					<thead>
						<tr class="border-b border-white/10 text-[10px] tracking-widest text-white/40 uppercase">
							<th class="px-3 py-2 font-semibold">Egg</th>
							<th class="px-3 py-2 font-semibold">Nest</th>
							<th class="px-3 py-2 font-semibold">Limits</th>
							<th class="px-3 py-2 font-semibold">Variables</th>
							<th class="px-3 py-2 font-semibold">Status</th>
							<th class="px-3 py-2 text-right font-semibold">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each data.eggs as egg (egg.id)}
							<tr class="border-b border-white/5 last:border-0">
								<td class="px-3 py-2">
									<p class="font-semibold text-white">{egg.name}</p>
									<p class="line-clamp-1 text-xs text-white/40">
										{egg.description || 'No description'}
									</p>
								</td>
								<td class="px-3 py-2 text-xs text-white/60">{egg.groupName}</td>
								<td class="px-3 py-2 text-[11px] text-white/50">{limits(egg.policy)}</td>
								<td class="px-3 py-2 text-xs text-white/60">
									{egg.policy.editableVariables.length} editable
								</td>
								<td class="px-3 py-2">
									<span
										class="border px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase
											{egg.policy.visible
											? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
											: 'border-white/10 bg-white/5 text-white/40'}"
									>
										{egg.policy.visible ? 'Visible' : 'Hidden'}
									</span>
								</td>
								<td class="px-3 py-2">
									<div class="flex justify-end">
										<a
											href="/admin/software/{egg.groupId}/{egg.id}"
											class="flex items-center gap-1 border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-white/70 transition hover:bg-white/10"
										>
											<IconSettings class="h-3 w-3" />
											Configure
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
