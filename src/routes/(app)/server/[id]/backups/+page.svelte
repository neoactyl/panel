<script lang="ts">
	import { untrack } from 'svelte';
	import IconPlus from '@tabler/icons-svelte/icons/plus';
	import IconDownload from '@tabler/icons-svelte/icons/download';
	import IconTrash from '@tabler/icons-svelte/icons/trash';
	import IconArchive from '@tabler/icons-svelte/icons/archive';
	import IconRefresh from '@tabler/icons-svelte/icons/refresh';
	import { adapter } from '#lib/adapter/client.ts';
	import { getServerPanel } from '#lib/panel/state.svelte.ts';
	import type { Backup } from '#lib/adapter/sdk.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const panel = getServerPanel();

	let backups = $state<Backup[]>(untrack(() => [...data.backups]));

	const STATUS_STYLES: Record<Backup['status'], string> = {
		completed: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
		running: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300',
		failed: 'border-red-500/30 bg-red-500/10 text-red-300'
	};

	const createBackup = async () => {
		try {
			const backup = await adapter.createBackup(panel.server.id);
			backups = [backup, ...backups];
			panel.showNotice('Backup started.');
		} catch (cause) {
			panel.showNotice(cause instanceof Error ? cause.message : 'Could not start backup.');
		}
	};

	const deleteBackup = async (backup: Backup) => {
		try {
			await adapter.deleteBackup(panel.server.id, backup.id);
			backups = backups.filter((entry) => entry.id !== backup.id);
			panel.showNotice(`Backup "${backup.name}" deleted.`);
		} catch (cause) {
			panel.showNotice(cause instanceof Error ? cause.message : 'Could not delete backup.');
		}
	};

	const restoreBackup = async (backup: Backup) => {
		try {
			await adapter.restoreBackup(panel.server.id, backup.id);
			panel.showNotice(`Restoring "${backup.name}".`);
		} catch (cause) {
			panel.showNotice(cause instanceof Error ? cause.message : 'Could not restore backup.');
		}
	};

	const downloadBackup = (backup: Backup) => {
		const name = encodeURIComponent(backup.name);
		window.open(
			`/api/servers/${encodeURIComponent(panel.server.id)}/backups/${encodeURIComponent(backup.id)}/download?name=${name}`,
			'_blank',
			'noopener'
		);
	};

	const formatSize = (bytes: number) => {
		if (!bytes) return '—';
		if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
		return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
	};

	const formatDate = (value: string) =>
		new Date(value).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
</script>

<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
	<div>
		<h2 class="text-sm font-semibold text-white">Backups</h2>
		<p class="text-xs text-white/40">Snapshots of the container volume stored off-node.</p>
	</div>
	{#if data.capabilities.backups}
		<button
			type="button"
			onclick={createBackup}
			class="flex items-center gap-1.5 border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/10"
		>
			<IconPlus class="h-3.5 w-3.5" />
			Create backup
		</button>
	{/if}
</div>

<section class="border border-white/10 bg-[#1a1a1a]">
	<table class="w-full text-left text-sm">
		<thead>
			<tr class="border-b border-white/10 text-[10px] tracking-widest text-white/40 uppercase">
				<th class="px-4 py-2 font-semibold">Name</th>
				<th class="px-4 py-2 font-semibold">Size</th>
				<th class="px-4 py-2 font-semibold">Created</th>
				<th class="px-4 py-2 font-semibold">Status</th>
				<th class="px-4 py-2"></th>
			</tr>
		</thead>
		<tbody>
			{#each backups as backup (backup.id)}
				<tr class="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
					<td class="px-4 py-2.5">
						<div class="flex items-center gap-2">
							<IconArchive class="h-4 w-4 shrink-0 text-white/40" />
							<span class="truncate font-mono text-xs text-white/80">{backup.name}</span>
						</div>
					</td>
					<td class="px-4 py-2.5 font-mono text-xs text-white/40">
						{formatSize(backup.size)}
					</td>
					<td class="px-4 py-2.5 text-xs text-white/40">{formatDate(backup.createdAt)}</td>
					<td class="px-4 py-2.5">
						<span
							class="border px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase {STATUS_STYLES[
								backup.status
							]}"
						>
							{backup.status}
						</span>
					</td>
					<td class="px-4 py-2.5">
						<div class="flex items-center justify-end gap-1">
							{#each backup.actions ?? [] as action (action)}
								{#if action === 'download'}
									<button
										type="button"
										disabled={backup.status !== 'completed'}
										onclick={() => downloadBackup(backup)}
										aria-label="Download backup"
										class="flex h-7 w-7 items-center justify-center text-white/40 transition hover:bg-white/5 hover:text-white disabled:opacity-30"
									>
										<IconDownload class="h-3.5 w-3.5" />
									</button>
								{:else if action === 'restore'}
									<button
										type="button"
										disabled={backup.status !== 'completed'}
										onclick={() => restoreBackup(backup)}
										aria-label="Restore backup"
										class="flex h-7 w-7 items-center justify-center text-white/40 transition hover:bg-white/5 hover:text-white disabled:opacity-30"
									>
										<IconRefresh class="h-3.5 w-3.5" />
									</button>
								{:else if action === 'delete'}
									<button
										type="button"
										onclick={() => deleteBackup(backup)}
										aria-label="Delete backup"
										class="flex h-7 w-7 items-center justify-center text-white/40 transition hover:bg-red-500/10 hover:text-red-300"
									>
										<IconTrash class="h-3.5 w-3.5" />
									</button>
								{/if}
							{/each}
						</div>
					</td>
				</tr>
			{/each}
			{#if !backups.length}
				<tr>
					<td colspan="5" class="px-4 py-8 text-center text-xs text-white/40">
						No backups yet.
					</td>
				</tr>
			{/if}
		</tbody>
	</table>
</section>
