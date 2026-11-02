<script lang="ts">
	import { untrack } from 'svelte';
	import IconPlus from '@tabler/icons-svelte/icons/plus';
	import IconTrash from '@tabler/icons-svelte/icons/trash';
	import { adapter } from '#lib/adapter/client.ts';
	import { getServerPanel } from '#lib/panel/state.svelte.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { monoInputClass } from '#lib/styles.ts';
	import Modal from '#lib/components/app/Modal.svelte';
	import type { Database } from '#lib/adapter/sdk.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const panel = getServerPanel();

	let databases = $state<Database[]>(untrack(() => [...data.databases]));
	let newDatabase = $state('');
	let createOpen = $state(false);
	let creating = $state(false);
	let createError = $state('');

	const openCreate = () => {
		newDatabase = '';
		createError = '';
		createOpen = true;
	};

	const createDatabase = async (event: SubmitEvent) => {
		event.preventDefault();
		const name = newDatabase.trim();
		if (!name) return;

		creating = true;
		createError = '';

		try {
			const database = await adapter.createDatabase(panel.server.id, { name });
			databases = [...databases, database];
			newDatabase = '';
			createOpen = false;
			panel.showNotice(`Database "${database.name}" created.`);
		} catch (cause) {
			createError = cause instanceof Error ? cause.message : 'Could not create database.';
		} finally {
			creating = false;
		}
	};

	const deleteDatabase = async (database: Database) => {
		try {
			await adapter.deleteDatabase(panel.server.id, database.id);
			databases = databases.filter((entry) => entry.id !== database.id);
			panel.showNotice(`Database "${database.name}" deleted.`);
		} catch (cause) {
			panel.showNotice(cause instanceof Error ? cause.message : 'Could not delete database.');
		}
	};
</script>

<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
	<div>
		<h2 class="text-sm font-semibold text-white">Databases</h2>
		<p class="text-xs text-white/40">MySQL databases provisioned for this server.</p>
	</div>
	{#if data.capabilities.databases}
		<Button
			variant="outline"
			size="sm"
			onclick={openCreate}
			class="border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
		>
			<IconPlus class="h-3.5 w-3.5" />
			New database
		</Button>
	{/if}
</div>

<Modal
	open={createOpen}
	title="Create database"
	description="Provision a MySQL database for this server."
	onclose={() => {
		if (!creating) createOpen = false;
	}}
>
	<form id="create-database" onsubmit={createDatabase} class="space-y-3">
		<label class="block">
			<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">
				Database name
			</span>
			<input
				bind:value={newDatabase}
				placeholder="database_name"
				class="mt-1 {monoInputClass}"
			/>
		</label>
		{#if createError}
			<p class="border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
				{createError}
			</p>
		{/if}
	</form>

	{#snippet footer()}
		<Button
			variant="outline"
			onclick={() => (createOpen = false)}
			disabled={creating}
			class="border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
		>
			Cancel
		</Button>
		<Button
			type="submit"
			form="create-database"
			disabled={creating || !newDatabase.trim()}
			class="bg-indigo-500 text-white hover:bg-indigo-400"
		>
			{creating ? 'Creating...' : 'Create'}
		</Button>
	{/snippet}
</Modal>

<section class="border border-white/10 bg-[#1a1a1a]">
	<Table.Root class="w-full text-left text-sm">
		<Table.Header>
			<Table.Row class="border-b border-white/10 text-[10px] tracking-widest text-white/40 uppercase">
				<Table.Head class="px-4 py-2 font-semibold">Database</Table.Head>
				<Table.Head class="px-4 py-2 font-semibold">Host</Table.Head>
				<Table.Head class="px-4 py-2 font-semibold">Username</Table.Head>
				<Table.Head class="px-4 py-2"></Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each databases as database (database.id)}
				<Table.Row class="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
					<Table.Cell class="px-4 py-2.5 font-mono text-xs text-white/80">{database.name}</Table.Cell>
					<Table.Cell class="px-4 py-2.5 font-mono text-xs text-white/40">
						{database.host}:{database.port}
					</Table.Cell>
					<Table.Cell class="px-4 py-2.5 font-mono text-xs text-white/40">{database.username}</Table.Cell>
					<Table.Cell class="px-4 py-2.5 text-right">
						{#each database.actions ?? [] as action (action)}
							{#if action === 'delete'}
								<button
									type="button"
									onclick={() => deleteDatabase(database)}
									aria-label="Delete database"
									class="ml-auto flex h-7 w-7 items-center justify-center text-white/40 transition hover:bg-red-500/10 hover:text-red-300"
								>
									<IconTrash class="h-3.5 w-3.5" />
								</button>
							{/if}
						{/each}
					</Table.Cell>
				</Table.Row>
			{/each}
			{#if !databases.length}
				<Table.Row>
					<Table.Cell colspan={4} class="px-4 py-8 text-center text-xs text-white/40">
						No databases yet.
					</Table.Cell>
				</Table.Row>
			{/if}
		</Table.Body>
	</Table.Root>
</section>
