<script lang="ts">
	import { untrack } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import IconSettings from '@tabler/icons-svelte/icons/settings';
	import IconAlertTriangle from '@tabler/icons-svelte/icons/alert-triangle';
	import { adapter } from '#lib/adapter/client.ts';
	import { getServerPanel } from '#lib/panel/state.svelte.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const panel = getServerPanel();
	const server = $derived(data.server);

	let serverName = $state(untrack(() => server.name));
	let serverDescription = $state(untrack(() => server.description));
	let savingSettings = $state(false);

	const saveSettings = async (event: SubmitEvent) => {
		event.preventDefault();
		savingSettings = true;

		try {
			await adapter.updateServer(server.id, {
				name: serverName.trim(),
				description: serverDescription.trim()
			});
			await invalidateAll();
			panel.showNotice('Settings saved.');
		} catch (cause) {
			panel.showNotice(cause instanceof Error ? cause.message : 'Could not save settings.');
		} finally {
			savingSettings = false;
		}
	};

	const reinstall = async () => {
		try {
			await adapter.reinstallServer(server.id);
			panel.showNotice('Server reinstall started.');
		} catch (cause) {
			panel.showNotice(cause instanceof Error ? cause.message : 'Could not reinstall server.');
		}
	};

	let confirmingDelete = $state(false);
	const deleteServer = async () => {
		try {
			await adapter.deleteServer(server.id);
			await goto('/server');
		} catch (cause) {
			panel.showNotice(cause instanceof Error ? cause.message : 'Could not delete server.');
		}
	};
</script>

<div class="mb-4">
	<h2 class="text-sm font-semibold text-white">Settings</h2>
	<p class="text-xs text-white/40">Rename the server or manage its lifecycle.</p>
</div>

<section class="border border-white/10 bg-[#1a1a1a] p-6">
	<div class="mb-5 flex items-center gap-2 text-white/50">
		<IconSettings class="h-4 w-4" />
		<span class="text-xs font-semibold tracking-widest uppercase">Configuration</span>
	</div>

	<form onsubmit={saveSettings} class="flex max-w-lg flex-col gap-4">
		<label class="flex flex-col gap-1.5">
			<span class="text-xs font-semibold tracking-widest text-white/40 uppercase">Name</span>
			<input
				bind:value={serverName}
				class="border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white transition focus:border-indigo-500/60 focus:outline-none"
			/>
		</label>

		<label class="flex flex-col gap-1.5">
			<span class="text-xs font-semibold tracking-widest text-white/40 uppercase">
				Description
			</span>
			<input
				bind:value={serverDescription}
				class="border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white transition focus:border-indigo-500/60 focus:outline-none"
			/>
		</label>

		<div class="grid gap-4 sm:grid-cols-2">
			<div>
				<p class="text-xs font-semibold tracking-widest text-white/40 uppercase">Docker image</p>
				<p class="mt-1 truncate font-mono text-xs text-white/60">{server.image}</p>
			</div>
			<div>
				<p class="text-xs font-semibold tracking-widest text-white/40 uppercase">Node</p>
				<p class="mt-1 font-mono text-xs text-white/60">{server.node}</p>
			</div>
		</div>

		<div class="flex items-center gap-3">
			<button
				type="submit"
				disabled={savingSettings}
				class="border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-50"
			>
				{savingSettings ? 'Saving...' : 'Save changes'}
			</button>
		</div>
	</form>
</section>

<section class="mt-4 border border-red-500/20 bg-[#1a1a1a] p-6">
	<div class="mb-4 flex items-center gap-2 text-red-300/80">
		<IconAlertTriangle class="h-4 w-4" />
		<span class="text-xs font-semibold tracking-widest uppercase">Danger zone</span>
	</div>
	<p class="text-sm text-white/50">
		Deleting this server is permanent and removes all files, allocations and databases.
	</p>

	<div class="mt-4 flex flex-wrap items-center gap-2">
		<button
			type="button"
			onclick={reinstall}
			class="border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10"
		>
			Reinstall server
		</button>

		{#if confirmingDelete}
			<button
				type="button"
				onclick={deleteServer}
				class="border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-500/20"
			>
				Yes, delete permanently
			</button>
			<button
				type="button"
				onclick={() => (confirmingDelete = false)}
				class="px-2 py-2 text-xs font-semibold text-white/50 transition hover:text-white"
			>
				Cancel
			</button>
		{:else}
			<button
				type="button"
				onclick={() => (confirmingDelete = true)}
				class="border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-500/20"
			>
				Delete server
			</button>
		{/if}
	</div>
</section>
