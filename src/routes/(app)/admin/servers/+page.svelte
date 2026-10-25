<script lang="ts">
	import IconServer from '@tabler/icons-svelte/icons/server';
	import IconAlertTriangle from '@tabler/icons-svelte/icons/alert-triangle';
	import IconPencil from '@tabler/icons-svelte/icons/pencil';
	import { enhance } from '$app/forms';
	import type { ServerState } from '#lib/adapter/sdk.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let editing = $state<string | null>(null);

	const styles: Record<ServerState, string> = {
		running: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
		starting: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300',
		stopping: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
		installing: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
		suspended: 'border-red-500/30 bg-red-500/10 text-red-300',
		offline: 'border-white/10 bg-white/5 text-white/50',
		unknown: 'border-white/10 bg-white/5 text-white/50'
	};
</script>

<svelte:head>
	<title>Servers - {data.branding.name}</title>
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
		Showing all servers reported by the <span class="font-mono text-white/60">{data.adapter}</span> adapter.
	</p>

	{#if data.servers.length === 0}
		<div class="flex flex-col items-center gap-3 border border-white/10 bg-[#1a1a1a] py-16 text-center">
			<IconServer class="h-8 w-8 text-white/20" />
			<p class="text-sm text-white/50">No servers were returned.</p>
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			{#each data.servers as server (server.id)}
				<div class="border border-white/10 bg-[#1a1a1a] p-4">
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div class="flex min-w-0 items-start gap-3">
							<div class="flex h-9 w-9 shrink-0 items-center justify-center border border-white/10 bg-white/5">
								<IconServer class="h-4 w-4 text-white/50" />
							</div>
							<div class="min-w-0">
								<div class="flex flex-wrap items-center gap-2">
									<p class="truncate text-sm font-bold text-white">{server.name}</p>
									<span class="border px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase {styles[server.state]}">
										{server.state}
									</span>
								</div>
								<p class="mt-1 font-mono text-[10px] text-white/35">{server.id}</p>
							</div>
						</div>
						<div class="flex items-center gap-2">
							<span class="text-xs text-white/40">{server.node}</span>
							<button
								type="button"
								onclick={() => (editing = editing === server.id ? null : server.id)}
								class="flex items-center gap-1.5 border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
							>
								<IconPencil class="h-3.5 w-3.5" />
								Resources
							</button>
						</div>
					</div>

					<div class="mt-4 grid gap-3 sm:grid-cols-3">
						<div class="border border-white/5 bg-[#121212] px-3 py-2">
							<p class="text-[10px] tracking-wider text-white/35 uppercase">CPU</p>
							<p class="mt-0.5 font-mono text-xs text-white/70">{server.cpu.used}/{server.cpu.limit}%</p>
						</div>
						<div class="border border-white/5 bg-[#121212] px-3 py-2">
							<p class="text-[10px] tracking-wider text-white/35 uppercase">Memory</p>
							<p class="mt-0.5 font-mono text-xs text-white/70">
								{Math.round(server.memory.used)}/{Math.round(server.memory.limit)} MB
							</p>
						</div>
						<div class="border border-white/5 bg-[#121212] px-3 py-2">
							<p class="text-[10px] tracking-wider text-white/35 uppercase">Disk</p>
							<p class="mt-0.5 font-mono text-xs text-white/70">
								{Math.round(server.disk.used)}/{Math.round(server.disk.limit)} MB
							</p>
						</div>
					</div>

					{#if editing === server.id}
						<form
							method="POST"
							action="?/updateResources"
							use:enhance={() =>
								async ({ result, update }) => {
									await update();
									if (result.type === 'success') editing = null;
								}}
							class="mt-4 grid gap-3 border border-white/10 bg-[#121212] p-4 sm:grid-cols-3"
						>
							<input type="hidden" name="serverId" value={server.id} />
							<label class="block">
								<span class="text-[10px] tracking-wider text-white/35 uppercase">CPU %</span>
								<input
									name="cpu"
									type="number"
									min="1"
									step="1"
									required
									value={server.cpu.limit}
									class="mt-1 w-full border border-white/10 bg-[#0f0f0f] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
								/>
							</label>
							<label class="block">
								<span class="text-[10px] tracking-wider text-white/35 uppercase">Memory MB</span>
								<input
									name="ram"
									type="number"
									min="1"
									step="1"
									required
									value={server.memory.limit}
									class="mt-1 w-full border border-white/10 bg-[#0f0f0f] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
								/>
							</label>
							<label class="block">
								<span class="text-[10px] tracking-wider text-white/35 uppercase">Disk MB</span>
								<input
									name="disk"
									type="number"
									min="1"
									step="1"
									required
									value={server.disk.limit}
									class="mt-1 w-full border border-white/10 bg-[#0f0f0f] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
								/>
							</label>
							<label class="block">
								<span class="text-[10px] tracking-wider text-white/35 uppercase">
									Database limit
								</span>
								<input
									name="databases"
									type="number"
									min="0"
									step="1"
									required
									value={server.databaseLimit ?? 0}
									class="mt-1 w-full border border-white/10 bg-[#0f0f0f] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
								/>
							</label>
							<label class="block">
								<span class="text-[10px] tracking-wider text-white/35 uppercase">
									Allocation limit
								</span>
								<input
									name="allocations"
									type="number"
									min="0"
									step="1"
									required
									value={server.allocationLimit ?? 0}
									class="mt-1 w-full border border-white/10 bg-[#0f0f0f] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
								/>
							</label>
							<div class="flex items-end gap-2">
								<button
									type="submit"
									class="border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-500/20"
								>
									Save
								</button>
								<button
									type="button"
									onclick={() => (editing = null)}
									class="px-2 py-2 text-xs font-semibold text-white/45 transition hover:text-white"
								>
									Cancel
								</button>
							</div>
						</form>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
