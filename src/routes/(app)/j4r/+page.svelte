<script lang="ts">
	import { enhance } from '$app/forms';
	import IconBrandDiscord from '@tabler/icons-svelte/icons/brand-discord';
	import IconCheck from '@tabler/icons-svelte/icons/check';
	import IconRefresh from '@tabler/icons-svelte/icons/refresh';
	import IconExternalLink from '@tabler/icons-svelte/icons/external-link';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const claimed = $derived(form && 'claimed' in form ? (form.claimed ?? null) : null);
</script>

<svelte:head>
	<title>Join for Resources - {data.branding.name}</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<div class="text-center">
		<IconBrandDiscord class="mx-auto size-10 text-indigo-400" />
		<h1 class="mt-3 text-xl font-semibold tracking-tight text-white">Join for Resources</h1>
		<p class="mt-1 text-sm text-white/50">
			Join our Discord community, verify your membership and claim your reward.
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
			{claimed > 0 ? `Reward claimed: ${claimed} credits.` : 'Your Discord membership is verified.'}
		</div>
	{/if}

	<div class="border border-white/10 bg-[#1a1a1a] p-5">
		{#if !data.state.linked}
			<div class="space-y-4 text-center">
				<p class="text-sm text-white/50">
					Connect your Discord account to verify that you are a member of our server.
				</p>
				<form method="POST" action="?/link" use:enhance>
					<button
						type="submit"
						class="inline-flex items-center gap-2 border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-[10px] font-semibold tracking-widest text-indigo-200 uppercase transition hover:bg-indigo-500/20"
					>
						<IconBrandDiscord class="size-4" /> Link Discord account
					</button>
				</form>
			</div>
		{:else}
			<div class="space-y-4">
				<div class="flex items-center justify-between border-b border-white/5 pb-3">
					<div>
						<div class="text-[10px] tracking-widest text-white/40 uppercase">Discord account</div>
						<div class="mt-1 text-sm text-white">
							{data.state.username || data.state.discordId}
						</div>
					</div>
					<span
						class="border px-2 py-1 text-[10px] font-semibold tracking-widest uppercase {data.state.member
							? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
							: 'border-red-500/30 bg-red-500/10 text-red-300'}"
					>
						{data.state.member ? 'In server' : 'Not in server'}
					</span>
				</div>

				<div class="grid grid-cols-2 gap-4 text-sm">
					<div>
						<div class="text-[10px] tracking-widest text-white/40 uppercase">Guild</div>
						<div class="mt-1 text-white/70">{data.state.guildId || 'Not configured'}</div>
					</div>
					<div>
						<div class="text-[10px] tracking-widest text-white/40 uppercase">Roles</div>
						<div class="mt-1 text-white/70">{data.state.roles.length}</div>
					</div>
					<div>
						<div class="text-[10px] tracking-widest text-white/40 uppercase">Required role</div>
						<div class="mt-1 text-white/70">
							{data.state.requiredRoleId
								? data.state.hasRequiredRole
									? 'Present'
									: 'Missing'
								: 'None'}
						</div>
					</div>
					<div>
						<div class="text-[10px] tracking-widest text-white/40 uppercase">Reward</div>
						<div class="mt-1 text-white/70">{data.reward} credits</div>
					</div>
				</div>

				{#if !data.state.member && data.inviteUrl}
					<a
						href={data.inviteUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="flex items-center justify-center gap-2 border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-[10px] font-semibold tracking-widest text-indigo-200 uppercase transition hover:bg-indigo-500/20"
					>
						<IconExternalLink class="size-4" /> Join the Discord server
					</a>
				{/if}

				<div class="flex flex-col gap-2 sm:flex-row">
					<form method="POST" action="?/verify" use:enhance class="flex-1">
						<button
							type="submit"
							class="flex w-full items-center justify-center gap-2 border border-white/10 px-4 py-2 text-[10px] font-semibold tracking-widest text-white/60 uppercase transition hover:border-white/20 hover:text-white"
						>
							<IconRefresh class="size-4" /> Re-check membership
						</button>
					</form>

					{#if data.state.j4rClaimedAt}
						<div
							class="flex flex-1 items-center justify-center border border-white/10 px-4 py-2 text-[10px] font-semibold tracking-widest text-white/30 uppercase"
						>
							Already claimed
						</div>
					{:else}
						<form method="POST" action="?/claim" use:enhance class="flex-1">
							<button
								type="submit"
								disabled={!data.state.j4rEnabled || !data.state.verified}
								class="flex w-full items-center justify-center gap-2 border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-[10px] font-semibold tracking-widest text-emerald-200 uppercase transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
							>
								<IconCheck class="size-4" /> Claim reward
							</button>
						</form>
					{/if}
				</div>

				{#if !data.state.verified}
					<p class="text-xs text-white/40">
						{#if !data.state.member}
							Join the Discord server first, then re-check your membership.
						{:else if !data.state.hasRequiredRole}
							You are in the server but missing the required role.
						{:else}
							Membership could not be verified yet.
						{/if}
					</p>
				{/if}
			</div>
		{/if}

		{#if !data.state.guildConfigured}
			<p class="mt-4 text-xs text-amber-300/80">
				The Discord guild is not configured yet. Ask an administrator to finish setup.
			</p>
		{/if}
	</div>
</div>
