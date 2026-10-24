<script lang="ts">
	import { superForm, fieldProxy } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { grantSchema, userQuotaSchema } from '#lib/schemas.ts';
	import IconArrowLeft from '@tabler/icons-svelte/icons/arrow-left';
	import IconChartBar from '@tabler/icons-svelte/icons/chart-bar';
	import IconCoins from '@tabler/icons-svelte/icons/coins';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const quotaSf = superForm(data.quotaForm, {
		id: 'quota',
		validators: zod4Client(userQuotaSchema)
	});
	const { enhance: enhanceQuota, message: quotaMessage, errors: quotaErrors } = quotaSf;
	const quotaCpu = fieldProxy(quotaSf, 'cpu');
	const quotaMemory = fieldProxy(quotaSf, 'memory');
	const quotaDisk = fieldProxy(quotaSf, 'disk');
	const quotaMaxServers = fieldProxy(quotaSf, 'maxServers');

	const grant = superForm(data.grantForm, {
		id: 'grant',
		validators: zod4Client(grantSchema)
	});
	const { enhance: enhanceGrant, message: grantMessage, errors: grantErrors, submitting: granting } = grant;
	const grantAmount = fieldProxy(grant, 'amount');
	const grantDescription = fieldProxy(grant, 'description');

	const gigabytes = (megabytes: number) => `${(megabytes / 1024).toFixed(1)} GB`;
	const date = (input: Date | string | null) => (input ? new Date(input).toLocaleString() : '-');
</script>

<svelte:head>
	<title>Resources - {data.target.name} - {data.branding.name}</title>
</svelte:head>

<div class="space-y-5">
	<a
		href="/admin/users"
		class="inline-flex items-center gap-2 text-xs font-semibold text-white/50 transition hover:text-white"
	>
		<IconArrowLeft class="h-3.5 w-3.5" />
		Back to users
	</a>

	{#if $quotaMessage && typeof $quotaMessage !== 'string'}
		<div
			class="border px-3 py-2 text-sm {$quotaMessage.status === 'error'
				? 'border-red-500/30 bg-red-500/10 text-red-200'
				: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}"
		>
			{$quotaMessage.text}
		</div>
	{/if}
	{#if $grantMessage && typeof $grantMessage !== 'string'}
		<div
			class="border px-3 py-2 text-sm {$grantMessage.status === 'error'
				? 'border-red-500/30 bg-red-500/10 text-red-200'
				: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}"
		>
			{$grantMessage.text}
		</div>
	{/if}

	<section class="border border-white/10 bg-[#1a1a1a] p-5">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div>
				<h2 class="text-sm font-bold text-white">{data.target.name ?? data.target.email}</h2>
				<p class="mt-1 text-xs text-white/40">{data.target.email}</p>
				{#if data.panelUserId}
					<p class="mt-1 font-mono text-[10px] text-white/30">
						Panel account: {data.panelUserId}
					</p>
				{:else}
					<p class="mt-1 text-[11px] text-white/30">No linked panel account.</p>
				{/if}
			</div>
			<span
				class="border px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase
					{data.effective.overridden
					? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300'
					: 'border-white/10 bg-white/5 text-white/50'}"
			>
				{data.effective.overridden ? 'Custom limits' : 'Global defaults'}
			</span>
		</div>

		<div class="mt-5 grid gap-3 sm:grid-cols-4">
			<div class="border border-white/10 bg-[#121212] px-3 py-2">
				<p class="text-[10px] tracking-widest text-white/35 uppercase">CPU</p>
				<p class="mt-1 text-sm font-semibold text-white">{data.effective.cpu}%</p>
			</div>
			<div class="border border-white/10 bg-[#121212] px-3 py-2">
				<p class="text-[10px] tracking-widest text-white/35 uppercase">Memory</p>
				<p class="mt-1 text-sm font-semibold text-white">
					{gigabytes(data.effective.memory)}
				</p>
			</div>
			<div class="border border-white/10 bg-[#121212] px-3 py-2">
				<p class="text-[10px] tracking-widest text-white/35 uppercase">Disk</p>
				<p class="mt-1 text-sm font-semibold text-white">
					{gigabytes(data.effective.disk)}
				</p>
			</div>
			<div class="border border-white/10 bg-[#121212] px-3 py-2">
				<p class="text-[10px] tracking-widest text-white/35 uppercase">Servers</p>
				<p class="mt-1 text-sm font-semibold text-white">
					{data.effective.maxServers > 0 ? data.effective.maxServers : 'Unlimited'}
				</p>
			</div>
		</div>
	</section>

	{#if data.credits.enabled}
		<section class="border border-white/10 bg-[#1a1a1a] p-5">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div class="flex items-center gap-2">
					<IconCoins class="h-4 w-4 text-amber-300/80" />
					<h2 class="text-sm font-bold text-white">Credits</h2>
				</div>
				<p class="text-sm font-semibold text-white">
					{data.credits.balance.toLocaleString()}
					{data.credits.currency}
				</p>
			</div>

			<form method="POST" action="?/grant" use:enhanceGrant class="mt-4 grid gap-3 sm:grid-cols-[160px_1fr_auto]">
				<label class="block">
					<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">Amount</span>
					<input
						name="amount"
						type="number"
						min="1"
						required
						bind:value={$grantAmount}
						class="mt-1 w-full border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
					/>
					{#if $grantErrors.amount}
						<span class="mt-1 block text-xs text-red-300">{$grantErrors.amount.join(' ')}</span>
					{/if}
				</label>
				<label class="block">
					<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">Note</span>
					<input
						name="description"
						maxlength="200"
						placeholder="Optional"
						bind:value={$grantDescription}
						class="mt-1 w-full border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
					/>
				</label>
				<button
					type="submit"
					disabled={$granting}
					class="mt-5 self-start border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-500/20"
				>
					Grant credits
				</button>
			</form>

			{#if data.credits.transactions.length > 0}
				<div class="mt-4 overflow-x-auto">
					<table class="w-full min-w-[420px] text-left text-xs">
						<thead class="text-[10px] tracking-widest text-white/35 uppercase">
							<tr class="border-b border-white/10">
								<th class="py-2 pr-3 font-semibold">Amount</th>
								<th class="py-2 pr-3 font-semibold">Kind</th>
								<th class="py-2 pr-3 font-semibold">Description</th>
								<th class="py-2 font-semibold">When</th>
							</tr>
						</thead>
						<tbody>
							{#each data.credits.transactions as entry (entry.id)}
								<tr class="border-b border-white/5 last:border-0">
									<td class="py-2 pr-3 font-semibold {entry.amount >= 0 ? 'text-emerald-300' : 'text-red-300'}">
										{entry.amount >= 0 ? '+' : ''}{entry.amount}
									</td>
									<td class="py-2 pr-3 text-white/50">{entry.kind}</td>
									<td class="py-2 pr-3 text-white/50">{entry.description || '-'}</td>
									<td class="py-2 text-white/35">{date(entry.createdAt)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>
	{/if}

	<form method="POST" action="?/save" use:enhanceQuota class="border border-white/10 bg-[#1a1a1a] p-5">
		<div class="flex items-center gap-2">
			<IconChartBar class="h-4 w-4 text-white/30" />
			<h2 class="text-sm font-bold text-white">Resource overrides</h2>
		</div>
		<p class="mt-1 text-xs text-white/40">
			Leave a field blank to inherit the global default. Set servers to 0 for unlimited.
		</p>

		<div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<label class="block">
				<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">CPU %</span>
				<input
					name="cpu"
					type="number"
					min="1"
					step="1"
					bind:value={$quotaCpu}
					placeholder={String(data.defaults.cpu)}
					class="mt-1 w-full border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
				/>
				{#if $quotaErrors.cpu}
					<span class="mt-1 block text-xs text-red-300">{$quotaErrors.cpu.join(' ')}</span>
				{/if}
			</label>
			<label class="block">
				<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">Memory MB</span>
				<input
					name="memory"
					type="number"
					min="1"
					step="1"
					bind:value={$quotaMemory}
					placeholder={String(data.defaults.memory)}
					class="mt-1 w-full border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
				/>
				{#if $quotaErrors.memory}
					<span class="mt-1 block text-xs text-red-300">{$quotaErrors.memory.join(' ')}</span>
				{/if}
			</label>
			<label class="block">
				<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">Disk MB</span>
				<input
					name="disk"
					type="number"
					min="1"
					step="1"
					bind:value={$quotaDisk}
					placeholder={String(data.defaults.disk)}
					class="mt-1 w-full border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
				/>
				{#if $quotaErrors.disk}
					<span class="mt-1 block text-xs text-red-300">{$quotaErrors.disk.join(' ')}</span>
				{/if}
			</label>
			<label class="block">
				<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">Max servers</span>
				<input
					name="maxServers"
					type="number"
					min="0"
					step="1"
					bind:value={$quotaMaxServers}
					placeholder={String(data.defaults.maxServers)}
					class="mt-1 w-full border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
				/>
				{#if $quotaErrors.maxServers}
					<span class="mt-1 block text-xs text-red-300">{$quotaErrors.maxServers.join(' ')}</span>
				{/if}
			</label>
		</div>

		<div class="mt-5 flex flex-wrap gap-2">
			<button
				type="submit"
				class="border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-sm font-semibold text-indigo-200 transition hover:bg-indigo-500/20"
			>
				Save limits
			</button>
			<button
				type="submit"
				formaction="?/reset"
				class="border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/60 transition hover:bg-white/10"
			>
				Reset to defaults
			</button>
		</div>
	</form>
</div>
