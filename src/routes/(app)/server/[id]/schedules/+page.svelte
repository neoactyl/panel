<script lang="ts">
	import { untrack } from 'svelte';
	import IconPlus from '@tabler/icons-svelte/icons/plus';
	import IconTrash from '@tabler/icons-svelte/icons/trash';
	import IconClock from '@tabler/icons-svelte/icons/clock';
	import { adapter } from '#lib/adapter/client.ts';
	import { getServerPanel } from '#lib/panel/state.svelte.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	import Modal from '#lib/components/app/Modal.svelte';
	import type { Schedule } from '#lib/adapter/sdk.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const panel = getServerPanel();

	let schedules = $state<Schedule[]>(untrack(() => [...data.schedules]));
	let newName = $state('');
	let newCron = $state('0 * * * *');
	let newAction = $state('save-all');
	let createOpen = $state(false);
	let creating = $state(false);
	let createError = $state('');

	const openCreate = () => {
		newName = '';
		newCron = '0 * * * *';
		newAction = 'save-all';
		createError = '';
		createOpen = true;
	};

	const createSchedule = async (event: SubmitEvent) => {
		event.preventDefault();
		if (!newName.trim()) return;

		creating = true;
		createError = '';

		try {
			const schedule = await adapter.createSchedule(panel.server.id, {
				name: newName.trim(),
				cron: newCron.trim() || '0 * * * *',
				action: newAction.trim() || 'save-all',
				enabled: true
			});
			schedules = [...schedules, schedule];
			createOpen = false;
			panel.showNotice('Schedule created.');
		} catch (cause) {
			createError = cause instanceof Error ? cause.message : 'Could not create schedule.';
		} finally {
			creating = false;
		}
	};

	const toggle = async (schedule: Schedule) => {
		try {
			const updated = await adapter.updateSchedule(panel.server.id, schedule.id, {
				enabled: !schedule.enabled
			});
			schedules = schedules.map((entry) => (entry.id === updated.id ? updated : entry));
			panel.showNotice(`${updated.name} ${updated.enabled ? 'enabled' : 'disabled'}.`);
		} catch (cause) {
			panel.showNotice(cause instanceof Error ? cause.message : 'Could not update schedule.');
		}
	};

	const deleteSchedule = async (schedule: Schedule) => {
		try {
			await adapter.deleteSchedule(panel.server.id, schedule.id);
			schedules = schedules.filter((entry) => entry.id !== schedule.id);
			panel.showNotice(`Schedule "${schedule.name}" deleted.`);
		} catch (cause) {
			panel.showNotice(cause instanceof Error ? cause.message : 'Could not delete schedule.');
		}
	};

	const formatDate = (value: string | null) => {
		if (!value) return 'Never';
		return new Date(value).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	};
</script>

<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
	<div>
		<h2 class="text-sm font-semibold text-white">Schedules</h2>
		<p class="text-xs text-white/40">Run commands or backups automatically on a cron cadence.</p>
	</div>
	{#if data.capabilities.schedules}
		<Button
			variant="outline"
			size="sm"
			onclick={openCreate}
			class="border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
		>
			<IconPlus class="h-3.5 w-3.5" />
			New schedule
		</Button>
	{/if}
</div>

<section class="border border-white/10 bg-[#1a1a1a]">
	<table class="w-full text-left text-sm">
		<thead>
			<tr class="border-b border-white/10 text-[10px] tracking-widest text-white/40 uppercase">
				<th class="px-4 py-2 font-semibold">Schedule</th>
				<th class="px-4 py-2 font-semibold">Cron</th>
				<th class="px-4 py-2 font-semibold">Action</th>
				<th class="px-4 py-2 font-semibold">Last run</th>
				<th class="px-4 py-2 font-semibold">Next run</th>
				<th class="px-4 py-2"></th>
			</tr>
		</thead>
		<tbody>
			{#each schedules as schedule (schedule.id)}
				<tr class="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
					<td class="px-4 py-2.5">
						<div class="flex items-center gap-2">
							<IconClock class="h-4 w-4 shrink-0 text-white/40" />
							<span class="text-xs text-white/80">{schedule.name}</span>
						</div>
					</td>
					<td class="px-4 py-2.5 font-mono text-xs text-white/40">{schedule.cron}</td>
					<td class="px-4 py-2.5 font-mono text-xs text-white/40">{schedule.action}</td>
					<td class="px-4 py-2.5 text-xs text-white/40">{formatDate(schedule.lastRun)}</td>
					<td class="px-4 py-2.5 text-xs text-white/40">{formatDate(schedule.nextRun)}</td>
					<td class="px-4 py-2.5">
						<div class="flex items-center justify-end gap-2">
							{#each schedule.actions ?? [] as action (action)}
								{#if action === 'toggle'}
									<button
										type="button"
										onclick={() => toggle(schedule)}
										aria-label={schedule.enabled ? 'Disable schedule' : 'Enable schedule'}
										class="relative h-5 w-9 border transition
											{schedule.enabled
											? 'border-indigo-500/40 bg-indigo-500/20'
											: 'border-white/10 bg-white/5'}"
									>
										<span
											class="absolute top-0.5 h-3.5 w-3.5 transition-all
												{schedule.enabled ? 'left-[18px] bg-indigo-400' : 'left-0.5 bg-white/40'}"
										></span>
									</button>
								{:else if action === 'delete'}
									<button
										type="button"
										onclick={() => deleteSchedule(schedule)}
										aria-label="Delete schedule"
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
		</tbody>
	</table>
</section>

<Modal
	open={createOpen}
	title="Create schedule"
	description="Run a command or backup automatically on a cron cadence."
	onclose={() => {
		if (!creating) createOpen = false;
	}}
>
	<form id="create-schedule" onsubmit={createSchedule} class="space-y-3">
		<label class="block">
			<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">Name</span>
			<input
				bind:value={newName}
				placeholder="Nightly restart"
				class="mt-1 w-full border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-indigo-500/60 focus:outline-none"
			/>
		</label>
		<label class="block">
			<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">Cron</span>
			<input
				bind:value={newCron}
				placeholder="0 4 * * *"
				class="mt-1 w-full border border-white/10 bg-[#121212] px-3 py-2 font-mono text-xs text-white placeholder:text-white/25 focus:border-indigo-500/60 focus:outline-none"
			/>
		</label>
		<label class="block">
			<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">Action</span>
			<input
				bind:value={newAction}
				placeholder="restart"
				class="mt-1 w-full border border-white/10 bg-[#121212] px-3 py-2 font-mono text-xs text-white placeholder:text-white/25 focus:border-indigo-500/60 focus:outline-none"
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
			form="create-schedule"
			disabled={creating || !newName.trim()}
			class="bg-indigo-500 text-white hover:bg-indigo-400"
		>
			{creating ? 'Creating...' : 'Create'}
		</Button>
	{/snippet}
</Modal>
