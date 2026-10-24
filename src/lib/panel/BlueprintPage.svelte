<script lang="ts">
	import { adapter } from '#lib/adapter/client.ts';
	import { page as currentPage } from '$app/state';
	import { Button } from '#lib/components/ui/button/index.js';
	import type { PanelPage, PanelScope } from '#lib/adapter/sdk.ts';
	import BlueprintForm from './BlueprintForm.svelte';
	import { feedback } from './feedback.svelte.ts';
	import { handlePanelResult } from './runtime.ts';

	let {
		page,
		scope,
		serverId
	}: { page: PanelPage; scope: PanelScope; serverId?: string } = $props();

	let busyAction = $state('');

	const brandName = $derived(
		(currentPage.data.branding as { name?: string } | undefined)?.name ?? 'Neoactyl'
	);

	const run = async (actionId: string, values?: Record<string, string | number | boolean>) => {
		if (busyAction) return;

		busyAction = actionId;

		try {
			const result = await adapter.runPanelAction({
				scope,
				serverId,
				pageId: page.id,
				actionId,
				values
			});

			await handlePanelResult(result);
		} catch (cause) {
			feedback.show(cause instanceof Error ? cause.message : 'Action failed.');
		} finally {
			busyAction = '';
		}
	};

	const alertStyles: Record<string, string> = {
		info: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-100',
		success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
		warning: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
		error: 'border-red-500/30 bg-red-500/10 text-red-100'
	};

	const variantFor = (kind?: 'primary' | 'secondary' | 'danger') =>
		kind === 'danger' ? 'destructive' : kind === 'primary' ? 'default' : 'outline';
</script>

<svelte:head>
	<title>{page.title ?? page.label} - {brandName}</title>
</svelte:head>

<header class="mb-6">
	<h1 class="text-xl font-extrabold tracking-tight text-white">
		{page.title ?? page.label}
	</h1>
	{#if page.description}
		<p class="mt-1 max-w-2xl text-sm text-white/50">{page.description}</p>
	{/if}
</header>

<div class="space-y-4">
	{#each page.blocks as block, index (index)}
		{#if block.type === 'text'}
			<section class="border border-white/10 bg-[#1a1a1a] p-4">
				{#if block.title}
					<h2 class="text-sm font-bold text-white">{block.title}</h2>
				{/if}
				<p class="mt-1 text-sm leading-relaxed whitespace-pre-line text-white/60">{block.body}</p>
			</section>
		{:else if block.type === 'alert'}
			<section class="border p-4 {alertStyles[block.tone]}">
				{#if block.title}
					<h2 class="text-sm font-bold">{block.title}</h2>
				{/if}
				<p class="mt-1 text-sm leading-relaxed whitespace-pre-line">{block.body}</p>
			</section>
		{:else if block.type === 'stats'}
			<section class="grid gap-3 sm:grid-cols-3">
				{#each block.items as item (item.label)}
					<div class="border border-white/10 bg-[#1a1a1a] p-4">
						<p class="text-[10px] font-semibold tracking-widest text-white/35 uppercase">
							{item.label}
						</p>
						<p class="mt-1 text-lg font-bold text-white">{item.value}</p>
						{#if item.detail}
							<p class="mt-0.5 text-xs text-white/40">{item.detail}</p>
						{/if}
					</div>
				{/each}
			</section>
		{:else if block.type === 'table'}
			<section class="overflow-x-auto border border-white/10 bg-[#1a1a1a]">
				<table class="w-full text-left text-sm">
					<thead>
						<tr class="border-b border-white/10">
							{#each block.columns as column (column)}
								<th class="px-4 py-2 text-[10px] font-semibold tracking-widest text-white/35 uppercase">
									{column}
								</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each block.rows as row, rowIndex (rowIndex)}
							<tr class="border-b border-white/5 last:border-0">
								{#each row as cell, cellIndex (cellIndex)}
									<td class="px-4 py-2 font-mono text-xs text-white/60">{cell}</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</section>
		{:else if block.type === 'actions'}
			<section class="flex flex-wrap gap-2 border border-white/10 bg-[#1a1a1a] p-4">
				{#each block.actions as action (action.actionId)}
					<Button
						variant={variantFor(action.kind)}
						disabled={Boolean(busyAction)}
						onclick={() => run(action.actionId)}
						class={action.kind === 'primary' ? 'bg-indigo-500 text-white hover:bg-indigo-400' : ''}
					>
						{busyAction === action.actionId ? 'Working...' : action.label}
					</Button>
				{/each}
			</section>
		{:else if block.type === 'form'}
			<section class="border border-white/10 bg-[#1a1a1a] p-4">
				<BlueprintForm
					actionId={block.actionId}
					fields={block.fields}
					submitLabel={block.submitLabel}
					busy={busyAction === block.actionId}
					onsubmit={(values) => run(block.actionId, values)}
				/>
			</section>
		{/if}
	{/each}
</div>
