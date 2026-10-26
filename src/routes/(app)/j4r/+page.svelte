<script lang="ts">
	import { enhance } from '$app/forms';
	import IconBrandDiscord from '@tabler/icons-svelte/icons/brand-discord';
	import IconCheck from '@tabler/icons-svelte/icons/check';
	import IconRefresh from '@tabler/icons-svelte/icons/refresh';
	import IconExternalLink from '@tabler/icons-svelte/icons/external-link';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const claimed = $derived(form && 'claimed' in form ? (form.claimed ?? null) : null);
	const claimedGuildId = $derived(
		form && 'claimedGuildId' in form ? (form.claimedGuildId ?? null) : null
	);
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
			{#if claimedGuildId}
				<span class="ml-1 text-emerald-200/60">({claimedGuildId})</span>
			{/if}
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
						class="border px-2 py-1 text-[10px] font-semibold tracking-widest uppercase {data.state.verified
							? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
							: 'border-red-500/30 bg-red-500/10 text-red-300'}"
					>
						{data.state.verified ? 'Verified' : 'Not verified'}
					</span>
				</div>

				{#if data.state.error}
					<div class="border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
						Discord verification failed: {data.state.error}
					</div>
				{/if}

				{#if data.state.scopeMissing}
					<div class="border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
						Your Discord link is missing the server list permission. Re-link your account to verify
						membership.
						<form method="POST" action="?/link" use:enhance class="mt-3">
							<button
								type="submit"
								class="inline-flex items-center gap-2 border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-[10px] font-semibold tracking-widest text-amber-100 uppercase transition hover:bg-amber-400/20"
							>
								<IconBrandDiscord class="size-4" /> Re-link Discord account
							</button>
						</form>
					</div>
				{/if}

				{#if data.state.requiredGuildIds.length === 0}
					<div class="border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
						No Discord servers are configured for join-for-resources yet.
					</div>
				{/if}

				{#each data.state.guilds as guild (guild.guildId)}
					<div class="border border-white/10 bg-black/20 p-4">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<div>
								<div class="text-[10px] tracking-widest text-white/40 uppercase">Server</div>
								<div class="mt-1 font-mono text-sm text-white/80">{guild.guildId}</div>
							</div>
							<span
								class="border px-2 py-1 text-[10px] font-semibold tracking-widest uppercase {guild.verified
									? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
									: guild.member
										? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
										: 'border-red-500/30 bg-red-500/10 text-red-300'}"
							>
								{guild.claimedAt
									? 'Claimed'
									: guild.verified
										? 'Ready'
										: guild.member
											? 'Missing role'
											: 'Not joined'}
							</span>
						</div>

						<div class="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
							<div>
								<div class="text-[10px] tracking-widest text-white/40 uppercase">Membership</div>
								<div class="mt-1 text-white/70">{guild.member ? 'Present' : 'Not in server'}</div>
							</div>
							<div>
								<div class="text-[10px] tracking-widest text-white/40 uppercase">Roles</div>
								<div class="mt-1 text-white/70">{guild.roles.length}</div>
							</div>
							<div>
								<div class="text-[10px] tracking-widest text-white/40 uppercase">Required role</div>
								<div class="mt-1 text-white/70">
									{data.state.requiredRoleId && guild.guildId === data.state.guildId
										? guild.hasRequiredRole
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

						{#if guild.claimedAt}
							<p class="mt-4 text-xs text-white/40">
								Claimed {new Date(guild.claimedAt).toLocaleString()}.
							</p>
						{:else}
							<div class="mt-4 flex flex-col gap-2 sm:flex-row">
								{#if !guild.member && data.inviteUrl}
									<a
										href={data.inviteUrl}
										target="_blank"
										rel="noopener noreferrer"
										class="flex flex-1 items-center justify-center gap-2 border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-[10px] font-semibold tracking-widest text-indigo-200 uppercase transition hover:bg-indigo-500/20"
									>
										<IconExternalLink class="size-4" /> Join server
									</a>
								{/if}
								<form method="POST" action="?/claim" use:enhance class="flex-1">
									<input type="hidden" name="guildId" value={guild.guildId} />
									<button
										type="submit"
										disabled={!data.state.j4rEnabled || !guild.verified || data.state.scopeMissing}
										class="flex w-full items-center justify-center gap-2 border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-[10px] font-semibold tracking-widest text-emerald-200 uppercase transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
									>
										<IconCheck class="size-4" /> Claim reward
									</button>
								</form>
							</div>
							{#if !guild.verified}
								<p class="mt-3 text-xs text-white/40">
									{#if !guild.member}
										Join this Discord server first, then re-check your membership.
									{:else if !guild.hasRequiredRole}
										You are in the server but missing the required role.
									{:else}
										Membership could not be verified yet.
									{/if}
								</p>
							{/if}
						{/if}
					</div>
				{/each}

				<form method="POST" action="?/verify" use:enhance>
					<button
						type="submit"
						class="flex w-full items-center justify-center gap-2 border border-white/10 px-4 py-2 text-[10px] font-semibold tracking-widest text-white/60 uppercase transition hover:border-white/20 hover:text-white"
					>
						<IconRefresh class="size-4" /> Re-check membership
					</button>
				</form>
			</div>
		{/if}

		{#if !data.state.guildConfigured}
			<p class="mt-4 text-xs text-amber-300/80">
				The Discord guild is not configured yet. Ask an administrator to finish setup.
			</p>
		{/if}
	</div>
</div>
