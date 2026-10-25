<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import IconArrowLeft from '@tabler/icons-svelte/icons/arrow-left';
	import IconArrowRight from '@tabler/icons-svelte/icons/arrow-right';
	import IconServer from '@tabler/icons-svelte/icons/server';
	import EggLogo from '#lib/components/app/EggLogo.svelte';
	import IconStack2 from '@tabler/icons-svelte/icons/stack-2';
	import IconCheck from '@tabler/icons-svelte/icons/check';
	import IconLoader from '@tabler/icons-svelte/icons/loader-2';
	import { Button } from '#lib/components/ui/button/index.js';
	import { adapter } from '#lib/adapter/client.ts';
	import type { SoftwareVariable } from '#lib/adapter/sdk.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const steps = ['Details', 'Game', 'Variables', 'Node', 'Review'] as const;

	let step = $state(0);
	let name = $state('');
	let description = $state('');
	let cpu = $state('');
	let ram = $state('');
	let disk = $state('');
	let databases = $state('');
	let allocations = $state('');

	let nestId = $state<number | null>(null);
	let eggId = $state<number | null>(null);
	let nodeId = $state<string | null>(untrack(() => data.nodes.find((node) => node.available)?.id ?? null));

	let variables = $state<SoftwareVariable[]>([]);
	let variableValues = $state<Record<string, string>>({});
	let variablesLoading = $state(false);
	let variablesError = $state('');

	let creating = $state(false);
	let errorMessage = $state('');

	const nestEggs = $derived(data.eggs.filter((egg) => egg.groupId === nestId));
	const selectedNest = $derived(data.nests.find((nest) => nest.id === nestId) ?? null);
	const selectedEgg = $derived(data.eggs.find((egg) => egg.id === eggId) ?? null);
	const selectedNode = $derived(data.nodes.find((node) => node.id === nodeId) ?? null);

	$effect(() => {
		const egg = selectedEgg;
		if (!egg) {
			variables = [];
			variableValues = {};
			variablesError = '';
			variablesLoading = false;
			return;
		}

		const editable = new Set(egg.policy.editableVariables);
		if (editable.size === 0) {
			variables = [];
			variableValues = {};
			variablesError = '';
			variablesLoading = false;
			return;
		}

		let cancelled = false;
		variablesLoading = true;
		variablesError = '';

		adapter
			.getSoftwareVariables(egg.groupId, egg.id)
			.then((list) => {
				if (cancelled) return;

				variables = list.filter(
					(variable) => variable.editable && editable.has(variable.key)
				);
				const next: Record<string, string> = {};
				for (const variable of variables) next[variable.key] = variable.defaultValue;
				variableValues = next;
			})
			.catch((cause) => {
				if (!cancelled) {
					variablesError =
						cause instanceof Error ? cause.message : 'Could not load egg variables.';
				}
			})
			.finally(() => {
				if (!cancelled) variablesLoading = false;
			});

		return () => {
			cancelled = true;
		};
	});

	const eggCount = (id: number) => data.eggs.filter((egg) => egg.groupId === id).length;

	const selectNest = (id: number) => {
		if (eggCount(id) === 0) return;
		nestId = id;
		eggId = data.eggs.find((egg) => egg.groupId === id)?.id ?? null;
	};

	const percent = (used: number, limit: number) =>
		limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

	const gigabytes = (megabytes: number) => `${(megabytes / 1024).toFixed(1)} GB`;
	const rangeText = (minimum: number, maximum: number, unit: string) =>
		Number.isFinite(maximum) ? `${minimum}-${maximum}${unit}` : `${minimum}${unit}+`;

	const positive = (value: string) => {
		const parsed = Number(value);
		return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
	};

	const nonNegative = (value: string) => {
		const parsed = Number(value);
		return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
	};

	const freeMemory = $derived(
		selectedNode && selectedNode.memory.limit > 0
			? Math.max(0, selectedNode.memory.limit - selectedNode.memory.allocated)
			: Number.POSITIVE_INFINITY
	);
	const freeDisk = $derived(
		selectedNode && selectedNode.disk.limit > 0
			? Math.max(0, selectedNode.disk.limit - selectedNode.disk.allocated)
			: Number.POSITIVE_INFINITY
	);
	const minimumCpu = $derived(Math.max(1, selectedEgg?.policy.minCpu ?? 1));
	const minimumRam = $derived(Math.max(1, selectedEgg?.policy.minMemory ?? 1));
	const minimumDisk = $derived(Math.max(1, selectedEgg?.policy.minDisk ?? 1));
	const maximumCpu = $derived(selectedEgg?.policy.maxCpu ?? Number.POSITIVE_INFINITY);
	const maximumRam = $derived(selectedEgg?.policy.maxMemory ?? Number.POSITIVE_INFINITY);
	const maximumDisk = $derived(selectedEgg?.policy.maxDisk ?? Number.POSITIVE_INFINITY);
	const clamp = (value: number, minimum: number, maximum: number) =>
		Math.min(maximum, Math.max(minimum, value));

	const defaultCpu = $derived(
		clamp(data.remaining?.cpu ?? data.defaults.cpu, minimumCpu, maximumCpu)
	);
	const defaultRam = $derived(
		clamp(
			Math.min(data.remaining?.memory ?? data.defaults.memory, freeMemory),
			minimumRam,
			maximumRam
		)
	);
	const defaultDisk = $derived(
		clamp(
			Math.min(data.remaining?.disk ?? data.defaults.disk, freeDisk),
			minimumDisk,
			maximumDisk
		)
	);
	const requestedCpu = $derived(positive(cpu) ?? defaultCpu);
	const requestedRam = $derived(positive(ram) ?? defaultRam);
	const requestedDisk = $derived(positive(disk) ?? defaultDisk);
	const requestedDatabases = $derived(nonNegative(databases));
	const requestedAllocations = $derived(nonNegative(allocations));
	const databaseLimit = $derived(data.quota?.maxDatabases ?? 0);
	const allocationLimit = $derived(data.quota?.maxAllocations ?? 0);
	const noResources = $derived(requestedCpu < 1 || requestedRam < 1 || requestedDisk < 1);
	const policyCpuExceeds = $derived(
		selectedEgg !== null && (requestedCpu < minimumCpu || requestedCpu > maximumCpu)
	);
	const policyMemoryExceeds = $derived(
		selectedEgg !== null && (requestedRam < minimumRam || requestedRam > maximumRam)
	);
	const policyDiskExceeds = $derived(
		selectedEgg !== null && (requestedDisk < minimumDisk || requestedDisk > maximumDisk)
	);
	const policyExceeds = $derived(
		policyCpuExceeds || policyMemoryExceeds || policyDiskExceeds
	);
	const costAffordable = $derived(
		data.creationCost === 0 || (data.credits ?? 0) >= data.creationCost
	);
	const memoryExceeds = $derived(selectedNode !== null && requestedRam > freeMemory);
	const diskExceeds = $derived(selectedNode !== null && requestedDisk > freeDisk);
	const quotaCpuExceeds = $derived(data.remaining !== null && requestedCpu > data.remaining.cpu);
	const quotaMemoryExceeds = $derived(
		data.remaining !== null && requestedRam > data.remaining.memory
	);
	const quotaDiskExceeds = $derived(data.remaining !== null && requestedDisk > data.remaining.disk);
	const quotaDatabasesExceed = $derived(
		databaseLimit > 0 && requestedDatabases > databaseLimit
	);
	const quotaAllocationsExceed = $derived(
		allocationLimit > 0 && requestedAllocations > allocationLimit
	);
	const quotaExceeds = $derived(
		quotaCpuExceeds ||
			quotaMemoryExceeds ||
			quotaDiskExceeds ||
			quotaDatabasesExceed ||
			quotaAllocationsExceed
	);
	const resourcesFit = $derived(
		!memoryExceeds && !diskExceeds && !quotaExceeds && !policyExceeds
	);

	const canContinue = $derived(
		step === 0
			? name.trim().length >= 2 && !quotaExceeds && !noResources
			: step === 1
				? selectedEgg !== null
				: step === 2
					? !variablesLoading && !variablesError
					: step === 3
						? selectedNode?.available === true && resourcesFit
						: false
	);

	const next = () => {
		if (step < steps.length - 1 && canContinue) step += 1;
	};

	const back = () => {
		if (step > 0) step -= 1;
	};

	const actionError = $derived(errorMessage || form?.message || '');

	const enhanceCreate: SubmitFunction = () => {
		creating = true;
		errorMessage = '';

		return async ({ result, update }) => {
			if (result.type === 'redirect') {
				await goto(result.location);
				return;
			}

			await update();
			creating = false;
		};
	};
</script>

<svelte:head>
	<title>Create server - {data.branding.name}</title>
</svelte:head>

<div in:fly={{ y: 16, duration: 350, easing: cubicOut }} class="mx-auto max-w-3xl">
	<header class="mb-6">
		<a
			href="/server"
			class="mb-4 inline-flex items-center gap-2 text-xs font-semibold tracking-widest text-white/40 uppercase transition hover:text-white"
		>
			<IconArrowLeft class="h-3.5 w-3.5" />
			Servers
		</a>
		<h1 class="text-xl font-extrabold tracking-tight text-white">Create server</h1>
		<p class="mt-1 text-sm text-white/60">Pick your game, a node, and review before deploying.</p>
	</header>

	<ol class="mb-6 grid grid-cols-5 border border-white/10 bg-[#1a1a1a]">
		{#each steps as label, index (label)}
			<li class="relative">
				<button
					type="button"
					disabled={index > step}
					onclick={() => {
						if (index < step) step = index;
					}}
					aria-current={index === step ? 'step' : undefined}
					class="flex w-full items-center gap-2 px-3 py-3 text-left transition disabled:cursor-not-allowed
						{index === step ? 'bg-white/5' : ''} {index < step ? 'hover:bg-white/5' : ''}"
				>
					<span
						class="flex h-6 w-6 shrink-0 items-center justify-center border text-[11px] font-bold
							{index < step
							? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-300'
							: index === step
								? 'border-white/30 bg-white/10 text-white'
								: 'border-white/10 text-white/30'}"
					>
						{#if index < step}
							<IconCheck class="h-3.5 w-3.5" />
						{:else}
							{index + 1}
						{/if}
					</span>
					<span
						class="truncate text-xs font-semibold tracking-wider uppercase
							{index <= step ? 'text-white/80' : 'text-white/30'}"
					>
						{label}
					</span>
				</button>
			</li>
		{/each}
	</ol>

	<div class="border border-white/10 bg-[#1a1a1a]">
		{#if step === 0}
			<div in:fly={{ x: 12, duration: 200 }} class="flex flex-col gap-5 p-5">
				<div>
					<h2 class="text-sm font-bold text-white">Server details</h2>
					<p class="mt-1 text-sm text-white/50">Name your server and optionally cap its resources.</p>
				</div>

				<label class="flex flex-col gap-1.5">
					<span class="text-xs font-semibold tracking-widest text-white/40 uppercase">Name</span>
					<input
						bind:value={name}
						placeholder="My new server"
						maxlength="100"
						autocomplete="off"
						class="border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-indigo-500/60 focus:outline-none"
					/>
				</label>

				<label class="flex flex-col gap-1.5">
					<span class="text-xs font-semibold tracking-widest text-white/40 uppercase">
						Description <span class="text-white/20 normal-case">(optional)</span>
					</span>
					<textarea
						bind:value={description}
						rows="3"
						maxlength="255"
						placeholder="What is this server for?"
						class="resize-none border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-indigo-500/60 focus:outline-none"
					></textarea>
				</label>

				{#if data.quota && data.used && data.remaining}
					<div
						class="border px-3 py-2 text-sm
							{quotaExceeds
							? 'border-red-500/30 bg-red-500/10 text-red-200'
							: 'border-white/10 bg-[#121212] text-white/60'}"
					>
						<p>
							Your allocation: {data.used.cpu} / {data.quota.cpu}% CPU ·
							{gigabytes(data.used.memory)} / {gigabytes(data.quota.memory)} memory ·
							{gigabytes(data.used.disk)} / {gigabytes(data.quota.disk)} disk
						</p>
						<p class="mt-1 text-xs text-white/40">
							Remaining: {data.remaining.cpu}% CPU · {gigabytes(data.remaining.memory)} memory ·
							{gigabytes(data.remaining.disk)} disk
						</p>
						{#if quotaExceeds}
							<p class="mt-1 text-xs text-red-300">
								Requested resources exceed your remaining allocation.
							</p>
						{/if}
					</div>
				{/if}

				<div>
					<span class="text-xs font-semibold tracking-widest text-white/40 uppercase">
						Resources <span class="text-white/20 normal-case">(optional)</span>
					</span>
					<div class="mt-2 grid gap-3 sm:grid-cols-3">
						<label class="flex flex-col gap-1.5">
							<span class="text-xs text-white/50">CPU limit (%)</span>
							<input
								bind:value={cpu}
								type="number"
								min="1"
								step="1"
								placeholder={String(Math.round(defaultCpu))}
								class="border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-indigo-500/60 focus:outline-none"
							/>
						</label>
						<label class="flex flex-col gap-1.5">
							<span class="text-xs text-white/50">Memory (MB)</span>
							<input
								bind:value={ram}
								type="number"
								min="128"
								step="128"
								placeholder={String(Math.round(defaultRam))}
								class="border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-indigo-500/60 focus:outline-none"
							/>
						</label>
						<label class="flex flex-col gap-1.5">
							<span class="text-xs text-white/50">Disk (MB)</span>
							<input
								bind:value={disk}
								type="number"
								min="128"
								step="128"
								placeholder={String(Math.round(defaultDisk))}
								class="border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-indigo-500/60 focus:outline-none"
							/>
						</label>
					</div>
					<p class="mt-2 text-xs text-white/30">Leave blank to allocate all remaining resources.</p>
					{#if noResources}
						<p class="mt-1 text-xs text-red-300">No resources remain to allocate.</p>
					{/if}
				</div>

				<div>
					<span class="text-xs font-semibold tracking-widest text-white/40 uppercase">
						Databases &amp; extra allocations
					</span>
					<div class="mt-2 grid gap-3 sm:grid-cols-2">
						<label class="flex flex-col gap-1.5">
							<span class="text-xs text-white/50">Databases</span>
							<input
								bind:value={databases}
								type="number"
								min="0"
								step="1"
								placeholder="0"
								class="border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-indigo-500/60 focus:outline-none"
							/>
							<span class="text-[11px] text-white/30">
								{databaseLimit > 0 ? `Up to ${databaseLimit}` : 'Unlimited'} · 0 disables
								databases
							</span>
						</label>
						<label class="flex flex-col gap-1.5">
							<span class="text-xs text-white/50">Extra allocations (ports)</span>
							<input
								bind:value={allocations}
								type="number"
								min="0"
								step="1"
								placeholder="0"
								class="border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-indigo-500/60 focus:outline-none"
							/>
							<span class="text-[11px] text-white/30">
								{allocationLimit > 0 ? `Up to ${allocationLimit}` : 'Unlimited'} · 0 leaves only
								the primary IP
							</span>
						</label>
					</div>
					<p class="mt-2 text-xs text-white/30">
						Extra allocations do not include the server's primary address. Leave these at 0 to
						disable databases and additional ports.
					</p>
					{#if quotaDatabasesExceed || quotaAllocationsExceed}
						<p class="mt-1 text-xs text-red-300">
							Database or allocation request exceeds your per-server limit.
						</p>
					{/if}
				</div>
			</div>
		{:else if step === 1}
			<div in:fly={{ x: 12, duration: 200 }} class="p-5">
				<div class="mb-4">
					<h2 class="text-sm font-bold text-white">Game &amp; egg</h2>
					<p class="mt-1 text-sm text-white/50">Choose a nest, then the egg to deploy.</p>
				</div>

				{#if data.nests.length === 0 || data.eggs.length === 0}
					<div class="border border-white/10 bg-[#121212] px-4 py-10 text-center text-sm text-white/40">
						No deployable software is available on this panel.
					</div>
				{:else}
					<div class="flex flex-col gap-5">
						<div class="flex flex-col gap-1.5">
							<span class="text-xs font-semibold tracking-widest text-white/40 uppercase">Nest</span>
							<div class="flex max-h-80 flex-col gap-1.5 overflow-y-auto pr-1">
								{#each data.nests as nest (nest.id)}
									{@const count = eggCount(nest.id)}
									<button
										type="button"
										disabled={count === 0}
										onclick={() => selectNest(nest.id)}
										class="flex items-start gap-2 border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-40
											{nest.id === nestId
											? 'border-indigo-500/50 bg-indigo-500/10'
											: 'border-white/10 bg-[#121212] hover:border-white/20'}"
									>
										<IconStack2 class="mt-0.5 h-4 w-4 shrink-0 text-white/40" />
										<span class="min-w-0">
											<span class="block truncate text-sm font-semibold text-white">{nest.name}</span>
											<span class="block text-xs text-white/40">
												{count} {count === 1 ? 'egg' : 'eggs'}
											</span>
										</span>
									</button>
								{/each}
							</div>
						</div>

						<div class="flex flex-col gap-1.5">
							<span class="text-xs font-semibold tracking-widest text-white/40 uppercase">
								Egg
							</span>
							{#if nestId === null}
								<div class="flex min-h-40 items-center justify-center border border-dashed border-white/10 bg-[#121212] px-4 py-10 text-center text-sm text-white/40">
									Choose a nest to see its eggs.
								</div>
							{:else if nestEggs.length === 0}
								<div class="border border-white/10 bg-[#121212] px-4 py-10 text-center text-sm text-white/40">
									This nest has no eggs.
								</div>
							{:else}
								<div
									in:fly={{ x: 8, duration: 180 }}
									class="grid max-h-80 gap-2 overflow-y-auto pr-1 sm:grid-cols-2"
								>
									{#each nestEggs as egg (egg.id)}
										<button
											type="button"
											onclick={() => (eggId = egg.id)}
											class="flex min-h-20 flex-col items-start gap-1 border px-3 py-3 text-left transition
												{egg.id === eggId
												? 'border-indigo-500/50 bg-indigo-500/10'
												: 'border-white/10 bg-[#121212] hover:border-white/20'}"
										>
											<span class="flex items-center gap-2 text-sm font-semibold text-white">
												<EggLogo name={egg.name} />
												{egg.name}
											</span>
											{#if egg.description}
												<span class="line-clamp-2 text-xs text-white/40">{egg.description}</span>
											{/if}
											{#if egg.versions.length}
												<span class="mt-auto text-[11px] text-white/30">
													{egg.versions.find((version) => version.latest)?.name ??
														egg.versions[0].name}
												</span>
											{/if}
										</button>
									{/each}
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{:else if step === 2}
			<div in:fly={{ x: 12, duration: 200 }} class="p-5">
				<div class="mb-4">
					<h2 class="text-sm font-bold text-white">Egg variables</h2>
					<p class="mt-1 text-sm text-white/50">
						Set any values the administrator has made editable for this egg.
					</p>
				</div>

				{#if variablesLoading}
					<div class="flex items-center justify-center gap-2 border border-white/10 bg-[#121212] px-4 py-10 text-sm text-white/40">
						<IconLoader class="h-4 w-4 animate-spin" />
						Loading variables...
					</div>
				{:else if variablesError}
					<p class="border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
						{variablesError}
					</p>
				{:else if variables.length === 0}
					<div class="border border-white/10 bg-[#121212] px-4 py-10 text-center text-sm text-white/40">
						This egg has no user-editable variables. You can continue to choose a node.
					</div>
				{:else}
					<div class="flex flex-col gap-3">
						{#each variables as variable (variable.key)}
							<label class="block border border-white/10 bg-[#121212] p-4">
								<span class="flex flex-wrap items-center gap-2">
									<span class="text-sm font-semibold text-white">{variable.name}</span>
									<code class="border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/50">
										{variable.key}
									</code>
								</span>
								<span class="mt-1 block text-xs text-white/40">
									{variable.description || 'No description provided.'}
								</span>
								<input
									bind:value={variableValues[variable.key]}
									maxlength="2000"
									autocomplete="off"
									class="mt-2 w-full border border-white/10 bg-[#0f0f0f] px-3 py-2 font-mono text-xs text-white placeholder:text-white/25 focus:border-indigo-500/60 focus:outline-none"
								/>
								<span class="mt-1 block font-mono text-[10px] text-white/30">
									Default: {variable.defaultValue || '(empty)'}
								</span>
							</label>
						{/each}
					</div>
				{/if}
			</div>
		{:else if step === 3}
			<div in:fly={{ x: 12, duration: 200 }} class="p-5">
				<div class="mb-4">
					<h2 class="text-sm font-bold text-white">Node</h2>
				</div>

				{#if selectedEgg}
					<p class="mb-3 border border-white/10 bg-[#121212] px-3 py-2 text-xs text-white/50">
						Allowed for {selectedEgg.name}: CPU {rangeText(minimumCpu, maximumCpu, '%')},
						RAM {rangeText(minimumRam, maximumRam, ' MB')}, disk
						{rangeText(minimumDisk, maximumDisk, ' MB')}.
					</p>
				{/if}

				{#if selectedNode}
					<div
						class="mb-3 border px-3 py-2 text-sm
							{memoryExceeds || diskExceeds || quotaExceeds || policyExceeds
							? 'border-red-500/30 bg-red-500/10 text-red-200'
							: 'border-white/10 bg-[#121212] text-white/60'}"
					>
						
						{#if policyExceeds}
							<p class="mt-1 text-red-300">
								Requested resources are outside the allowed range for this egg.
							</p>
						{/if}
						{#if memoryExceeds}
							<p class="mt-1 text-red-300">
								Memory request exceeds the free capacity on this node.
							</p>
						{/if}
						{#if diskExceeds}
							<p class="mt-1 text-red-300">
								Disk request exceeds the free capacity on this node.
							</p>
						{/if}
						{#if quotaExceeds}
							<p class="mt-1 text-red-300">
								Requested resources exceed your remaining allocation.
							</p>
						{/if}
					</div>
				{/if}

				{#if data.nodes.length === 0}
					<div class="border border-white/10 bg-[#121212] px-4 py-10 text-center text-sm text-white/40">
						No nodes are configured on this panel.
					</div>
				{:else}
					<div class="flex flex-col gap-2">
						{#each data.nodes as node (node.id)}
							{@const memoryPercent = percent(node.memory.allocated, node.memory.limit)}
							{@const diskPercent = percent(node.disk.allocated, node.disk.limit)}
							<button
								type="button"
								disabled={!node.available}
								onclick={() => (nodeId = node.id)}
								class="flex flex-col gap-3 border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50
									{node.id === nodeId && node.available
									? 'border-indigo-500/50 bg-indigo-500/10'
									: 'border-white/10 bg-[#121212] enabled:hover:border-white/20'}"
							>
								<div class="flex flex-wrap items-center justify-between gap-2">
									<span class="flex items-center gap-2 text-sm font-semibold text-white">
										<IconServer class="h-4 w-4 text-white/40" />
										{node.name}
									</span>
									<span
										class="text-xs font-semibold tracking-wider uppercase
											{node.available ? 'text-emerald-300' : 'text-red-300'}"
									>
										{node.available ? 'Available' : (node.reason ?? 'Unavailable')}
									</span>
								</div>

								<div class="grid gap-3 sm:grid-cols-2">
									<div class="flex flex-col gap-1">
										<div class="flex justify-between text-[11px] text-white/40 uppercase">
											<span>Memory</span>
											<span>{gigabytes(node.memory.allocated)} / {gigabytes(node.memory.limit)}</span>
										</div>
										<div class="h-1.5 bg-white/5">
											<div
												class="h-full {memoryPercent >= 90 ? 'bg-red-400' : 'bg-indigo-400'}"
												style="width: {memoryPercent}%"
											></div>
										</div>
									</div>
									<div class="flex flex-col gap-1">
										<div class="flex justify-between text-[11px] text-white/40 uppercase">
											<span>Disk</span>
											<span>{gigabytes(node.disk.allocated)} / {gigabytes(node.disk.limit)}</span>
										</div>
										<div class="h-1.5 bg-white/5">
											<div
												class="h-full {diskPercent >= 90 ? 'bg-red-400' : 'bg-indigo-400'}"
												style="width: {diskPercent}%"
											></div>
										</div>
									</div>
								</div>

								<div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/40">
									<span>{node.servers} {node.servers === 1 ? 'server' : 'servers'}</span>
									<span>
										{node.allocations < 0
											? 'Allocation availability unknown'
											: `${node.allocations} free ${node.allocations === 1 ? 'allocation' : 'allocations'}`}
									</span>
								</div>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{:else}
			<div in:fly={{ x: 12, duration: 200 }} class="p-5">
				<div class="mb-4">
					<h2 class="text-sm font-bold text-white">Review</h2>
					<p class="mt-1 text-sm text-white/50">Confirm the configuration before deployment.</p>
				</div>

				<dl class="divide-y divide-white/10 border border-white/10 bg-[#121212]">
					<div class="flex items-start justify-between gap-4 px-4 py-3">
						<dt class="text-xs font-semibold tracking-widest text-white/40 uppercase">Name</dt>
						<dd class="text-right text-sm text-white">{name.trim() || '—'}</dd>
					</div>
					<div class="flex items-start justify-between gap-4 px-4 py-3">
						<dt class="text-xs font-semibold tracking-widest text-white/40 uppercase">Description</dt>
						<dd class="max-w-md text-right text-sm text-white/60">{description.trim() || '—'}</dd>
					</div>
					<div class="flex items-start justify-between gap-4 px-4 py-3">
						<dt class="text-xs font-semibold tracking-widest text-white/40 uppercase">Nest</dt>
						<dd class="text-right text-sm text-white">{selectedNest?.name ?? '—'}</dd>
					</div>
					<div class="flex items-start justify-between gap-4 px-4 py-3">
						<dt class="text-xs font-semibold tracking-widest text-white/40 uppercase">Egg</dt>
						<dd class="text-right text-sm text-white">{selectedEgg?.name ?? '—'}</dd>
					</div>
					<div class="flex items-start justify-between gap-4 px-4 py-3">
						<dt class="text-xs font-semibold tracking-widest text-white/40 uppercase">Node</dt>
						<dd class="text-right text-sm text-white">{selectedNode?.name ?? '—'}</dd>
					</div>
					<div class="flex items-start justify-between gap-4 px-4 py-3">
						<dt class="text-xs font-semibold tracking-widest text-white/40 uppercase">Resources</dt>
						<dd class="text-right text-sm text-white/60">
							CPU {requestedCpu}% A��� RAM {requestedRam} MB A��� Disk {requestedDisk} MB
						</dd>
					</div>
					<div class="flex items-start justify-between gap-4 px-4 py-3">
						<dt class="text-xs font-semibold tracking-widest text-white/40 uppercase">
							Databases
						</dt>
						<dd class="text-right text-sm text-white/60">
							{requestedDatabases > 0 ? requestedDatabases : 'Disabled'}
						</dd>
					</div>
					<div class="flex items-start justify-between gap-4 px-4 py-3">
						<dt class="text-xs font-semibold tracking-widest text-white/40 uppercase">
							Extra allocations
						</dt>
						<dd class="text-right text-sm text-white/60">
							{requestedAllocations > 0 ? `${requestedAllocations} extra` : 'Primary only'}
						</dd>
					</div>
					{#if variables.length > 0}
						<div class="flex items-start justify-between gap-4 px-4 py-3">
							<dt class="text-xs font-semibold tracking-widest text-white/40 uppercase">
								Variables
							</dt>
							<dd class="max-h-32 overflow-y-auto text-right font-mono text-[11px] text-white/50">
								{#each variables as variable (variable.key)}
									<span class="block break-all">
										<span class="text-white/30">{variable.key}</span>
										= {variableValues[variable.key] || '(empty)'}
									</span>
								{/each}
							</dd>
						</div>
					{/if}
					{#if data.renewal.enabled}
						<div class="flex items-start justify-between gap-4 px-4 py-3">
							<dt class="text-xs font-semibold tracking-widest text-white/40 uppercase">Credits</dt>
							<dd class="text-right text-sm text-white/60">
								<span class="block">Balance: {data.credits ?? 0} {data.renewal.currency}</span>
								{#if data.creationCost > 0}
									<span class="block">
										Creation cost: {data.creationCost}
										{data.renewal.currency}
									</span>
								{/if}
								{#if data.renewal.defaultRenewalPrice > 0}
									<span class="block">
										Renews every {data.renewal.intervalDays} days for {data.renewal
											.defaultRenewalPrice}
										{data.renewal.currency}
									</span>
								{/if}
							</dd>
						</div>
					{/if}
				</dl>

				{#if !costAffordable}
					<p class="mt-4 border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
						You need {data.creationCost - (data.credits ?? 0)} more
						{data.renewal.currency} to create this server.
					</p>
				{/if}

				{#if actionError}
					<p class="mt-4 border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
						{actionError}
					</p>
				{/if}
			</div>
		{/if}
	</div>

	<div class="mt-4 flex items-center justify-between gap-3">
		<Button
			variant="outline"
			onclick={step === 0 ? () => goto('/server') : back}
			class="border-white/10 bg-white/5 text-white hover:bg-white/10"
		>
			<IconArrowLeft class="h-4 w-4" />
			{step === 0 ? 'Cancel' : 'Back'}
		</Button>

		{#if step < steps.length - 1}
			<Button
				disabled={!canContinue}
				onclick={next}
				class="bg-indigo-500 text-white hover:bg-indigo-400"
			>
				Continue
				<IconArrowRight class="h-4 w-4" />
			</Button>
		{:else}
			<form method="POST" action="?/create" use:enhance={enhanceCreate}>
				<input type="hidden" name="name" value={name} />
				<input type="hidden" name="description" value={description} />
				<input type="hidden" name="node" value={selectedNode?.id ?? ''} />
				<input type="hidden" name="software" value={selectedEgg?.id ?? ''} />
				<input type="hidden" name="softwareGroup" value={nestId ?? ''} />
				<input type="hidden" name="cpu" value={cpu} />
				<input type="hidden" name="ram" value={ram} />
				<input type="hidden" name="disk" value={disk} />
				<input type="hidden" name="databases" value={String(requestedDatabases)} />
				<input type="hidden" name="allocations" value={String(requestedAllocations)} />
				{#each variables as variable (variable.key)}
					<input
						type="hidden"
						name={`variable:${variable.key}`}
						value={variableValues[variable.key] ?? ''}
					/>
				{/each}
				<Button
					type="submit"
					disabled={creating ||
						!name.trim() ||
						!selectedEgg ||
						!selectedNode?.available ||
						!resourcesFit ||
						variablesLoading ||
						variablesError !== '' ||
						!costAffordable}
					class="bg-indigo-500 text-white hover:bg-indigo-400"
				>
					{#if creating}
						<IconLoader class="h-4 w-4 animate-spin" />
						Creating…
					{:else}
						Create server
					{/if}
				</Button>
			</form>
		{/if}
	</div>
</div>
