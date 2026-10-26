<script lang="ts">
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import IconUsers from '@tabler/icons-svelte/icons/users';
	import IconCopy from '@tabler/icons-svelte/icons/copy';
	import IconCheck from '@tabler/icons-svelte/icons/check';
	import IconBrandDiscord from '@tabler/icons-svelte/icons/brand-discord';
	import IconExternalLink from '@tabler/icons-svelte/icons/external-link';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

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

	const claimed = $derived(form && 'claimed' in form ? (form.claimed ?? null) : null);
	const claimedInvites = $derived(form && 'invites' in form ? (form.invites ?? null) : null);
	const progress = $derived(
		data.discord.nextTier
			? Math.min(
					100,
					Math.round((data.discord.current / data.discord.nextTier.invites) * 100)
				)
			: 100
	);
</script>

<svelte:head>
	<title>Invites - {data.branding.name}</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-xl font-semibold tracking-tight text-white">Invite rewards</h1>
		<p class="mt-1 text-sm text-white/50">
			Invite people to our Discord server or share your website referral link to earn rewards.
		</p>
	</div>

	{#if form?.error}
		<div class="border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
			{form.error}
		</div>
	{/if}

	{#if claimed !== null}
		<div
			class="border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300"
		>
			<IconCheck class="mr-2 inline size-4" />
			{claimed > 0
				? `Discord invite reward claimed: ${claimed} credits.`
				: 'Your Discord invites were verified.'}
			{#if claimedInvites !== null}
				<span class="ml-1 text-emerald-200/60">({claimedInvites} invites)</span>
			{/if}
		</div>
	{/if}

	<section class="space-y-4 border border-white/10 bg-[#1a1a1a] p-5">
		<div class="flex items-center gap-2">
			<IconBrandDiscord class="size-5 text-indigo-400" />
			<div>
				<h2 class="text-sm font-semibold text-white">Discord invites</h2>
				<p class="text-xs text-white/40">
					Rewards are granted from tracked joins on our Discord server.
				</p>
			</div>
		</div>

		{#if !data.discord.enabled}
			<div class="border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
				Discord invite rewards are currently disabled.
			</div>
		{/if}

		{#if !data.discord.linked}
			<div class="space-y-4 text-center">
				<p class="text-sm text-white/50">
					Connect your Discord account to track the people you invite.
				</p>
				<form method="POST" action="?/linkDiscord" use:enhance>
					<button
						type="submit"
						class="inline-flex items-center gap-2 border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-[10px] font-semibold tracking-widest text-indigo-200 uppercase transition hover:bg-indigo-500/20"
					>
						<IconBrandDiscord class="size-4" /> Link Discord account
					</button>
				</form>
			</div>
		{:else}
			<div class="grid gap-4 sm:grid-cols-3">
				<div class="border border-white/10 bg-black/20 p-4">
					<div class="text-[10px] tracking-widest text-white/40 uppercase">Valid invites</div>
					<div class="mt-2 text-2xl font-semibold text-white">{data.discord.current}</div>
				</div>
				<div class="border border-white/10 bg-black/20 p-4">
					<div class="text-[10px] tracking-widest text-white/40 uppercase">Lifetime invites</div>
					<div class="mt-2 text-2xl font-semibold text-white">{data.discord.lifetime}</div>
				</div>
				<div class="border border-white/10 bg-black/20 p-4">
					<div class="text-[10px] tracking-widest text-white/40 uppercase">Claimable</div>
					<div class="mt-2 text-2xl font-semibold text-white">
						{data.discord.claimable} <span class="text-sm text-white/40">credits</span>
					</div>
				</div>
			</div>

			<div>
				<div class="flex items-center justify-between text-xs text-white/40">
					<span>
						{#if data.discord.nextTier}
							{data.discord.nextTier.invites - data.discord.current} more invite(s) to the next tier
						{:else}
							You have reached the highest invite tier.
						{/if}
					</span>
					<span>{data.discord.current} / {data.discord.nextTier?.invites ?? data.discord.current}</span>
				</div>
				<div class="mt-2 h-2 overflow-hidden bg-black/40">
					<div class="h-full bg-indigo-500 transition-all" style={`width: ${progress}%`}></div>
				</div>
			</div>

			<div class="flex flex-wrap gap-2">
				{#each data.discord.tiers as tier (tier.invites)}
					<span
						class="border px-2 py-1 text-[10px] font-semibold tracking-widest uppercase {data.discord.current >= tier.invites
							? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
							: 'border-white/10 text-white/40'}"
					>
						{tier.invites} invites = {tier.coins} credits
					</span>
				{/each}
			</div>

			<div class="flex flex-col gap-2 sm:flex-row">
				{#if data.inviteUrl}
					<a
						href={data.inviteUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="flex items-center justify-center gap-2 border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-[10px] font-semibold tracking-widest text-indigo-200 uppercase transition hover:bg-indigo-500/20"
					>
						<IconExternalLink class="size-4" /> Open Discord
					</a>
				{/if}
				<form method="POST" action="?/claimDiscord" use:enhance class="flex-1">
					<button
						type="submit"
						disabled={!data.discord.enabled || !data.discord.tier || data.discord.current < 1}
						class="flex w-full items-center justify-center gap-2 border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-[10px] font-semibold tracking-widest text-emerald-200 uppercase transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
					>
						<IconCheck class="size-4" /> Claim invite rewards
					</button>
				</form>
				<form method="POST" action="?/linkDiscord" use:enhance>
					<button
						type="submit"
						class="flex w-full items-center justify-center gap-2 border border-white/10 px-4 py-2 text-[10px] font-semibold tracking-widest text-white/60 uppercase transition hover:border-white/20 hover:text-white"
					>
						<IconBrandDiscord class="size-4" /> Re-link Discord
					</button>
				</form>
			</div>

			<p class="text-xs text-white/40">
				Invites count after the invited account is at least {data.discord.minAccountAgeDays} day(s)
				old. {data.discord.requireStillMember
					? 'The invited account must still be in the server when you claim.'
					: 'Invites remain counted after the member leaves.'}
			</p>
		{/if}
	</section>

	<section class="space-y-4">
		<div>
			<h2 class="text-sm font-semibold text-white">Website referrals</h2>
			<p class="text-xs text-white/40">
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
