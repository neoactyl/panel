<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import IconSettings from '@tabler/icons-svelte/icons/settings';
	import IconCoins from '@tabler/icons-svelte/icons/coins';
	import IconAlertTriangle from '@tabler/icons-svelte/icons/alert-triangle';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import { adapter } from '#lib/adapter/client.ts';
	import { getServerPanel } from '#lib/panel/state.svelte.ts';
	import { formatTimeRemaining, getRenewalWindow } from '#lib/renewal-window.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const panel = getServerPanel();
	const server = $derived(data.server);
	const date = (value: Date | string) => new Date(value).toLocaleDateString();
	let now = $state(Date.now());
	const renewalWindow = $derived(data.billing ? getRenewalWindow(data.billing, now) : null);

	onMount(() => {
		const timer = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(timer);
	});

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
	<p class="text-xs text-white/40">Rename the server, adjust its resources, or manage its lifecycle.</p>
</div>

{#if form?.message || form?.success}
	<div
		class="mb-4 border px-3 py-2 text-sm {form?.message
			? 'border-red-500/30 bg-red-500/10 text-red-200'
			: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}"
	>
		{form?.message ?? form?.success}
	</div>
{/if}

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

<section class="mt-4 border border-white/10 bg-[#1a1a1a] p-6">
	<div class="mb-4 flex items-center gap-2 text-white/50">
		<IconSettings class="h-4 w-4" />
		<span class="text-xs font-semibold tracking-widest uppercase">Resources</span>
	</div>
	<p class="text-sm text-white/50">
		Change how much CPU, memory, and disk this server may use. The total must stay within your
		remaining allocation.
	</p>

	{#if data.remaining}
		<p class="mt-2 border border-white/10 bg-[#121212] px-3 py-2 text-xs text-white/50">
			Remaining to allocate: {data.remaining.cpu}% CPU · {data.remaining.memory} MB memory ·
			{data.remaining.disk} MB disk
		</p>
	{/if}

	<form
		method="POST"
		action="?/resources"
		use:enhance={() =>
			async ({ result, update }) => {
				await update();
				if (result.type === 'success') await invalidateAll();
			}}
		class="mt-4 grid gap-4 sm:grid-cols-3"
	>
		<label class="flex flex-col gap-1.5">
			<span class="text-xs font-semibold tracking-widest text-white/40 uppercase">CPU %</span>
			<input
				name="cpu"
				type="number"
				min="1"
				max={data.remaining?.cpu}
				step="1"
				required
				value={server.cpu.limit}
				class="border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/60"
			/>
		</label>
		<label class="flex flex-col gap-1.5">
			<span class="text-xs font-semibold tracking-widest text-white/40 uppercase">Memory MB</span>
			<input
				name="ram"
				type="number"
				min="1"
				max={data.remaining?.memory}
				step="1"
				required
				value={server.memory.limit}
				class="border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/60"
			/>
		</label>
		<label class="flex flex-col gap-1.5">
			<span class="text-xs font-semibold tracking-widest text-white/40 uppercase">Disk MB</span>
			<input
				name="disk"
				type="number"
				min="1"
				max={data.remaining?.disk}
				step="1"
				required
				value={server.disk.limit}
				class="border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/60"
			/>
		</label>
		<div class="sm:col-span-3">
			<button
				type="submit"
				class="border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-sm font-semibold text-indigo-200 transition hover:bg-indigo-500/20"
			>
				Save resources
			</button>
		</div>
	</form>
</section>

{#if data.renewal.enabled && data.billing && data.billing.status !== 'deleted'}
	<section class="mt-4 border border-white/10 bg-[#1a1a1a] p-6">
		<div class="mb-4 flex items-center gap-2 text-white/50">
			<IconCoins class="h-4 w-4" />
			<span class="text-xs font-semibold tracking-widest uppercase">Billing</span>
		</div>

		<dl class="grid gap-3 text-sm sm:grid-cols-3">
			<div>
				<dt class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">
					Next renewal
				</dt>
				<dd class="mt-1 text-white/70">{date(data.billing.nextRenewalAt)}</dd>
			</div>
			<div>
				<dt class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">
					Renewal price
				</dt>
				<dd class="mt-1 text-white/70">
					{data.billing.renewalPrice.toLocaleString()} {data.renewal.currency}
				</dd>
			</div>
			<div>
				<dt class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">Status</dt>
				<dd class="mt-1 text-white/70 uppercase">{data.billing.status}</dd>
			</div>
		</dl>

		<form method="POST" action="?/autoRenew" use:enhance class="mt-5 flex items-center gap-3">
			<Checkbox name="enabled" checked={data.billing.autoRenew} />
			<span class="text-sm text-white/60">Renew this server automatically</span>
			<button
				type="submit"
				class="border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/10"
			>
				Save
			</button>
		</form>

		{#if data.billing.status !== 'deleted' && data.billing.renewalPrice > 0 && renewalWindow}
			<form method="POST" action="?/renew" use:enhance class="mt-3">
				<button
					type="submit"
					disabled={!renewalWindow.canRenew}
					title={renewalWindow.canRenew
						? `Renew for ${data.billing.renewalPrice.toLocaleString()} ${data.renewal.currency}`
						: 'Renewals open during the last 2% of the billing period.'}
					class="border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-sm font-semibold text-indigo-200 transition hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-40"
				>
					{#if renewalWindow.canRenew}
						Renew now · {data.billing.renewalPrice.toLocaleString()}
						{data.renewal.currency}
					{:else}
						Renew in {formatTimeRemaining(renewalWindow.remainingMs)}
					{/if}
				</button>
			</form>
		{/if}
	</section>
{/if}

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
