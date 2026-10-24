<script lang="ts">
	import { page } from '$app/state';
	import IconUsers from '@tabler/icons-svelte/icons/users';
	import IconCopy from '@tabler/icons-svelte/icons/copy';
	import IconCheck from '@tabler/icons-svelte/icons/check';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let copied = $state(false);

	const link = $derived(`${page.url.origin}/auth/register?ref=${data.stats.code}`);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(link);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			copied = false;
		}
	};

	const rewardParts = $derived(
		[
			data.rewards.coins ? `${data.rewards.coins} credits` : '',
			data.rewards.cpu ? `${data.rewards.cpu}% CPU` : '',
			data.rewards.memory ? `${data.rewards.memory} MB memory` : '',
			data.rewards.disk ? `${data.rewards.disk} MB disk` : '',
			data.rewards.serverSlots ? `${data.rewards.serverSlots} server slot(s)` : ''
		].filter(Boolean)
	);
</script>

<svelte:head>
	<title>Invite - {data.branding.name}</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-xl font-semibold tracking-tight text-white">Invite friends</h1>
		<p class="mt-1 text-sm text-white/50">
			Share your link. When someone creates an account with it, you receive the referral reward.
		</p>
	</div>

	{#if !data.enabled}
		<div class="border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
			The referral program is currently disabled.
		</div>
	{/if}

	<div class="grid gap-4 sm:grid-cols-3">
		<div class="border border-white/10 bg-[#1a1a1a] p-5">
			<div class="text-[10px] tracking-widest text-white/40 uppercase">Your code</div>
			<div class="mt-2 font-mono text-2xl font-semibold tracking-[0.2em] text-white">
				{data.stats.code}
			</div>
		</div>
		<div class="border border-white/10 bg-[#1a1a1a] p-5">
			<div class="text-[10px] tracking-widest text-white/40 uppercase">Successful invites</div>
			<div class="mt-2 text-2xl font-semibold text-white">{data.stats.total}</div>
		</div>
		<div class="border border-white/10 bg-[#1a1a1a] p-5">
			<div class="text-[10px] tracking-widest text-white/40 uppercase">Credits earned</div>
			<div class="mt-2 text-2xl font-semibold text-white">{data.stats.rewardCoins}</div>
		</div>
	</div>

	<div class="border border-white/10 bg-[#1a1a1a] p-5">
		<div class="text-[10px] tracking-widest text-white/40 uppercase">Your invite link</div>
		<div class="mt-2 flex flex-col gap-2 sm:flex-row">
			<input
				readonly
				value={link}
				class="min-w-0 flex-1 border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs text-white/70 focus:outline-none"
			/>
			<button
				type="button"
				onclick={copy}
				class="flex items-center justify-center gap-2 border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-[10px] font-semibold tracking-widest text-indigo-200 uppercase transition hover:bg-indigo-500/20"
			>
				{#if copied}
					<IconCheck class="size-3.5" /> Copied
				{:else}
					<IconCopy class="size-3.5" /> Copy
				{/if}
			</button>
		</div>
		{#if rewardParts.length > 0}
			<p class="mt-3 text-xs text-white/40">
				Reward per successful invite: {rewardParts.join(', ')}.
			</p>
		{:else}
			<p class="mt-3 text-xs text-white/40">
				The administrator has not configured a referral reward yet.
			</p>
		{/if}
	</div>

	<section class="space-y-3">
		<div class="flex items-center gap-2">
			<IconUsers class="size-4 text-white/50" />
			<h2 class="text-[10px] font-semibold tracking-widest text-white/50 uppercase">
				Referred members
			</h2>
		</div>

		{#if data.stats.referrals.length === 0}
			<div class="border border-white/10 bg-[#1a1a1a] p-4 text-sm text-white/40">
				No one has joined with your link yet.
			</div>
		{:else}
			<div class="divide-y divide-white/5 border border-white/10 bg-[#1a1a1a]">
				{#each data.stats.referrals as referral (referral.id)}
					<div class="flex items-center justify-between gap-3 px-4 py-3">
						<div class="min-w-0">
							<div class="truncate text-sm text-white">{referral.name}</div>
							<div class="truncate text-xs text-white/40">{referral.email}</div>
						</div>
						<div class="shrink-0 text-[10px] tracking-widest text-white/30 uppercase">
							{new Date(referral.createdAt).toLocaleDateString()}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>
