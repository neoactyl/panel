<script lang="ts">
	import { enhance } from '$app/forms';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import IconShoppingBag from '@tabler/icons-svelte/icons/shopping-bag';
	import IconServer from '@tabler/icons-svelte/icons/server';
	import IconLock from '@tabler/icons-svelte/icons/lock';
	import IconCoins from '@tabler/icons-svelte/icons/coins';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const gigabytes = (megabytes: number) => `${(megabytes / 1024).toFixed(1)} GB`;
	const date = (value: Date | string) => new Date(value).toLocaleDateString();
	const credits = (amount: number) => `${amount.toLocaleString()} ${data.renewal.currency}`;
</script>

<svelte:head>
	<title>Storefront - {data.branding.name}</title>
</svelte:head>

<div class="space-y-5">
	<div class="flex items-start justify-between gap-4">
		<div>
			<p class="text-[10px] font-semibold tracking-[0.2em] text-indigo-300 uppercase">
				Storefront
			</p>
			<h1 class="mt-1 text-xl font-extrabold tracking-tight text-white">Servers & upgrades</h1>
			<p class="mt-1 text-sm text-white/45">
				Buy a server or add resources to an existing one with credits.
			</p>
		</div>
		<div class="flex h-10 w-10 items-center justify-center border border-white/10 bg-white/5">
			<IconShoppingBag class="h-5 w-5 text-white/40" />
		</div>
	</div>

	{#if form?.error}
		<div class="border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
			{form.error}
		</div>
	{/if}
	{#if form && 'success' in form}
		<div class="border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
			{form.success}
			{#if form.serverId}
				<a href="/server/{form.serverId}" class="ml-2 font-semibold underline">
					Open server
				</a>
			{/if}
		</div>
	{/if}

	{#if !data.available}
		<div class="flex items-center gap-3 border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
			<IconLock class="h-4 w-4 shrink-0" />
			<span>
				Link your panel account before claiming servers.
				<a href="/settings" class="font-semibold underline">Go to settings</a>
			</span>
		</div>
	{/if}

	{#if data.renewal.enabled}
		<section class="border border-white/10 bg-[#1a1a1a] p-5">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div class="flex items-center gap-2">
					<IconCoins class="h-5 w-5 text-amber-300/70" />
					<div>
						<p class="text-[10px] tracking-widest text-white/35 uppercase">Your balance</p>
						<p class="text-lg font-bold text-white">{credits(data.credits)}</p>
					</div>
				</div>
				<p class="text-xs text-white/35">
					Credits are used for new servers, upgrades, and renewals.
				</p>
			</div>

			{#if data.billings.length === 0}
				<p class="mt-4 border border-white/5 bg-[#121212] px-3 py-3 text-sm text-white/40">
					No renewable servers yet. Servers you create or buy will appear here.
				</p>
			{:else}
				<div class="mt-4 overflow-x-auto">
					<table class="w-full min-w-[640px] text-left text-sm">
						<thead class="text-[10px] tracking-widest text-white/35 uppercase">
							<tr class="border-b border-white/10">
								<th class="py-2 pr-3 font-semibold">Server</th>
								<th class="py-2 pr-3 font-semibold">Next renewal</th>
								<th class="py-2 pr-3 font-semibold">Price</th>
								<th class="py-2 pr-3 font-semibold">Status</th>
								<th class="py-2 pr-3 font-semibold">Auto-renew</th>
								<th class="py-2 font-semibold"></th>
							</tr>
						</thead>
						<tbody>
							{#each data.billings as billing (billing.id)}
								<tr class="border-b border-white/5 last:border-0">
									<td class="py-3 pr-3">
										<a href="/server/{billing.serverId}" class="font-semibold text-white hover:underline">
											{billing.serverName}
										</a>
									</td>
									<td class="py-3 pr-3 text-white/60">{date(billing.nextRenewalAt)}</td>
									<td class="py-3 pr-3 text-white/60">{credits(billing.renewalPrice)}</td>
									<td class="py-3 pr-3">
										<span
											class="border px-1.5 py-0.5 text-[10px] font-semibold uppercase
												{billing.status === 'active'
												? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
												: billing.status === 'suspended'
													? 'border-red-500/20 bg-red-500/10 text-red-300'
													: 'border-white/10 bg-white/5 text-white/40'}"
										>
											{billing.status}
										</span>
										{#if billing.status === 'suspended' && billing.deleteAt}
											<p class="mt-1 text-[11px] text-red-300/70">
												Deletes {date(billing.deleteAt)}
											</p>
										{/if}
									</td>
									<td class="py-3 pr-3">
										<form method="POST" action="?/renewal" use:enhance class="flex items-center gap-2">
											<input type="hidden" name="serverId" value={billing.serverId} />
											<Checkbox name="enabled" checked={billing.autoRenew} />
											<button
												type="submit"
												class="text-[11px] font-semibold text-white/50 underline-offset-2 hover:text-white hover:underline"
											>
												Save
											</button>
										</form>
									</td>
									<td class="py-3 text-right">
										<form method="POST" action="?/renew" use:enhance>
											<input type="hidden" name="serverId" value={billing.serverId} />
											<button
												type="submit"
												disabled={billing.status === 'deleted' || billing.renewalPrice <= 0}
												class="border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-40"
											>
												Renew now
											</button>
										</form>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>
	{/if}

	{#if data.quota && data.used && data.remaining}
		<div class="border border-white/10 bg-[#1a1a1a] px-4 py-3 text-sm text-white/60">
			Your allocation: {data.used.cpu} / {data.quota.cpu}% CPU -
			{gigabytes(data.used.memory)} / {gigabytes(data.quota.memory)} memory -
			{gigabytes(data.used.disk)} / {gigabytes(data.quota.disk)} disk
			<p class="mt-1 text-xs text-white/35">
				Remaining: {data.remaining.cpu}% CPU - {gigabytes(data.remaining.memory)} memory -
				{gigabytes(data.remaining.disk)} disk
			</p>
		</div>
	{/if}

	{#if data.items.length === 0}
		<div class="border border-dashed border-white/10 bg-[#1a1a1a] px-4 py-12 text-center">
			<IconShoppingBag class="mx-auto h-6 w-6 text-white/20" />
			<p class="mt-2 text-sm text-white/40">No storefront items are available right now.</p>
		</div>
	{:else}
		<div class="grid gap-3 sm:grid-cols-2">
			{#each data.items as item (item.id)}
				<div class="flex flex-col border border-white/10 bg-[#1a1a1a] p-5">
					<div class="flex items-start justify-between gap-3">
						<div>
							<p class="text-[10px] font-semibold tracking-widest text-indigo-300/70 uppercase">
								{item.kind === 'resource' ? 'Resource upgrade' : 'Full server'}
							</p>
							<h2 class="mt-1 text-sm font-bold text-white">{item.name}</h2>
							<p class="mt-1 text-xs text-white/40">
								{item.description ||
									(item.kind === 'resource'
										? 'Stays with the server until the server expires.'
										: 'Provisioned instantly.')}
							</p>
						</div>
						<IconServer class="h-4 w-4 shrink-0 text-white/25" />
					</div>

					<div class="mt-4 grid grid-cols-3 gap-2 text-center">
						<div class="border border-white/5 bg-[#121212] px-2 py-2">
							<p class="text-[9px] tracking-widest text-white/30 uppercase">CPU</p>
							<p class="mt-0.5 text-xs font-semibold text-white">
								{item.kind === 'resource' ? '+' : ''}{item.cpu}%
							</p>
						</div>
						<div class="border border-white/5 bg-[#121212] px-2 py-2">
							<p class="text-[9px] tracking-widest text-white/30 uppercase">RAM</p>
							<p class="mt-0.5 text-xs font-semibold text-white">
								{item.kind === 'resource' ? '+' : ''}{gigabytes(item.memory)}
							</p>
						</div>
						<div class="border border-white/5 bg-[#121212] px-2 py-2">
							<p class="text-[9px] tracking-widest text-white/30 uppercase">Disk</p>
							<p class="mt-0.5 text-xs font-semibold text-white">
								{item.kind === 'resource' ? '+' : ''}{gigabytes(item.disk)}
							</p>
						</div>
					</div>

					{#if data.renewal.enabled}
						<div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/45">
							<span class="font-semibold text-white">
								{item.price > 0 ? credits(item.price) : 'Free'}
							</span>
							{#if item.renewalPrice > 0}
								<span>+{credits(item.renewalPrice)} per renewal</span>
							{/if}
							{#if item.kind === 'server'}
								<span>{item.durationDays} day cycle</span>
							{/if}
						</div>
					{/if}

					<div class="mt-4 flex-1"></div>

					{#if item.claimed}
						<p
							class="border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-center text-xs font-semibold text-emerald-300"
						>
							Already claimed
						</p>
					{:else}
						<form method="POST" action="?/claim" use:enhance class="space-y-2">
							<input type="hidden" name="itemId" value={item.id} />
							{#if item.kind === 'resource'}
								<label class="block">
									<span class="text-[10px] tracking-widest text-white/35 uppercase">Server</span>
									<select
										name="serverId"
										class="mt-1 w-full border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
									>
										{#each data.servers as server (server.id)}
											<option value={server.id}>{server.name}</option>
										{/each}
									</select>
								</label>
							{/if}
							<button
								type="submit"
								disabled={!data.available ||
									!data.canClaim ||
									(item.kind === 'resource' && data.servers.length === 0)}
								class="w-full border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-sm font-semibold text-indigo-200 transition hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-40"
							>
								{item.kind === 'resource' ? 'Buy upgrade' : 'Buy server'}
							</button>
						</form>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
