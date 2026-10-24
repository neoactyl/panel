<script lang="ts">
	import { untrack } from 'svelte';
	import IconDeviceFloppy from '@tabler/icons-svelte/icons/device-floppy';
	import IconCopy from '@tabler/icons-svelte/icons/copy';
	import IconCheck from '@tabler/icons-svelte/icons/check';
	import { adapter } from '#lib/adapter/client.ts';
	import { getServerPanel } from '#lib/panel/state.svelte.ts';
	import type { StartupVariable } from '#lib/adapter/sdk.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const panel = getServerPanel();

	let variables = $state<StartupVariable[]>(untrack(() => [...data.startup.variables]));
	let saving = $state(false);
	let copied = $state(false);

	const save = async (event: SubmitEvent) => {
		event.preventDefault();
		saving = true;

		try {
			const startup = await adapter.updateStartup(panel.server.id, {
				variables: variables.map(({ key, value }) => ({ key, value }))
			});
			variables = [...startup.variables];
			panel.showNotice('Startup variables saved.');
		} catch (cause) {
			panel.showNotice(cause instanceof Error ? cause.message : 'Could not save startup.');
		} finally {
			saving = false;
		}
	};

	const copyCommand = async () => {
		try {
			await navigator.clipboard.writeText(data.startup.command);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			panel.showNotice('Could not copy the startup command.');
		}
	};
</script>

<div class="mb-4">
	<h2 class="text-sm font-semibold text-white">Startup</h2>
	<p class="text-xs text-white/40">Variables injected into the container on every boot.</p>
</div>

<section class="border border-white/10 bg-[#1a1a1a] p-6">
	<div>
		<p class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">Docker image</p>
		<p class="mt-1 truncate font-mono text-xs text-white/60">{data.startup.image}</p>
	</div>

	<div class="mt-5">
		<p class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">Startup command</p>
		<div
			class="mt-1 flex items-start justify-between gap-3 border border-white/10 bg-[#0d0d0d] px-3 py-2"
		>
			<code class="break-all font-mono text-xs text-white/60">{data.startup.command}</code>
			<button
				type="button"
				onclick={copyCommand}
				aria-label="Copy startup command"
				class="flex h-7 w-7 shrink-0 items-center justify-center border transition
					{copied
					? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
					: 'border-white/10 bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'}"
			>
				{#if copied}
					<IconCheck class="h-3.5 w-3.5" />
				{:else}
					<IconCopy class="h-3.5 w-3.5" />
				{/if}
			</button>
		</div>
	</div>
</section>

<form onsubmit={save} class="mt-4 border border-white/10 bg-[#1a1a1a]">
	<div class="flex items-center justify-between border-b border-white/10 px-4 py-2">
		<span class="text-xs font-semibold tracking-widest text-white/40 uppercase">Variables</span>
		<button
			type="submit"
			disabled={saving || !data.capabilities.startup}
			class="flex items-center gap-1.5 border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/10 disabled:opacity-40"
		>
			<IconDeviceFloppy class="h-3.5 w-3.5" />
			{saving ? 'Saving...' : 'Save'}
		</button>
	</div>

	<div class="divide-y divide-white/5">
		{#each variables as variable (variable.key)}
			<div class="grid gap-3 px-4 py-3 sm:grid-cols-[14rem_1fr]">
				<div>
					<p class="font-mono text-xs text-white/80">{variable.key}</p>
					<p class="mt-0.5 text-[11px] text-white/40">{variable.description}</p>
				</div>
				<input
					bind:value={variable.value}
					disabled={!variable.editable || !data.capabilities.startup}
					class="border border-white/10 bg-[#121212] px-3 py-2 font-mono text-xs text-white transition focus:border-indigo-500/60 focus:outline-none disabled:cursor-not-allowed disabled:text-white/40"
				/>
			</div>
		{/each}
	</div>
</form>
