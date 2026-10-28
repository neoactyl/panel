<script lang="ts">
  import logo from '#lib/assets/logo.svg';
	import { superForm, fieldProxy } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import IconUser from '@tabler/icons-svelte/icons/user';
	import IconShieldLock from '@tabler/icons-svelte/icons/shield-lock';
	import IconDevices from '@tabler/icons-svelte/icons/devices';
	import IconShieldCheck from '@tabler/icons-svelte/icons/shield-check';
	import IconClock from '@tabler/icons-svelte/icons/clock';
	import IconLogout from '@tabler/icons-svelte/icons/logout';
	import IconDeviceDesktop from '@tabler/icons-svelte/icons/device-desktop';
	import IconDeviceMobile from '@tabler/icons-svelte/icons/device-mobile';
	import IconLink from '@tabler/icons-svelte/icons/link';
	import IconInfoSquare from '@tabler/icons-svelte/icons/info-square';
	import IconBrandGithub from '@tabler/icons-svelte/icons/brand-github';
	import IconBrandDiscord from '@tabler/icons-svelte/icons/brand-discord';
	import IconExternalLink from '@tabler/icons-svelte/icons/external-link';
	import { panelSchema, passwordSchema, profileSchema } from '#lib/schemas.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const profile = superForm(data.profileForm, {
		id: 'profile',
		validators: zod4Client(profileSchema)
	});
	const panelForm = superForm(data.panelForm, {
		id: 'panel',
		validators: zod4Client(panelSchema)
	});
	const security = superForm(data.passwordForm, {
		id: 'password',
		validators: zod4Client(passwordSchema)
	});
	const revoke = superForm(data.revokeForm, { id: 'revoke' });
	const signoutForm = superForm(data.signoutForm, { id: 'signout' });

	const displayName = fieldProxy(profile, 'name');
	const panelEmail = fieldProxy(panelForm, 'email');
	const panelPassword = fieldProxy(panelForm, 'password');

	const {
		enhance: enhanceProfile,
		message: profileMessage,
		submitting: savingProfile,
		errors: profileErrors
	} = profile;
	const {
		enhance: enhancePanel,
		message: panelMessage,
		submitting: linkingPanel,
		errors: panelErrors
	} = panelForm;
	const {
		enhance: enhancePassword,
		message: passwordMessage,
		submitting: savingPassword,
		errors: passwordErrors
	} = security;
	const { enhance: enhanceRevoke, message: revokeMessage, submitting: revoking } = revoke;
	const { enhance: enhanceSignout, submitting: signingOut } = signoutForm;

	const user = $derived(data.user);
	const initials = $derived(
		(user.name || user.email)
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? '')
			.join('')
	);
	const memberSince = $derived(
		new Date(user.createdAt).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		})
	);

	const formatDate = (value: Date | string) =>
		new Date(value).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});

	const describeAgent = (agent: string | null) => {
		if (!agent) return { label: 'Unknown device', mobile: false };

		const browser =
			/Edg\//.test(agent) ? 'Edge'
			: /Firefox\//.test(agent) ? 'Firefox'
			: /Chrome\//.test(agent) ? 'Chrome'
			: /Safari\//.test(agent) ? 'Safari'
			: 'Browser';

		const os =
			/Windows/.test(agent) ? 'Windows'
			: /Android/.test(agent) ? 'Android'
			: /iPhone|iPad|iPod/.test(agent) ? 'iOS'
			: /Mac OS X/.test(agent) ? 'macOS'
			: /Linux/.test(agent) ? 'Linux'
			: 'Unknown OS';

		return { label: `${browser} on ${os}`, mobile: /Android|iPhone|iPad|iPod/.test(agent) };
	};
</script>

<svelte:head>
	<title>Settings - {data.branding.name}</title>
</svelte:head>

<div in:fly={{ y: 16, duration: 350, easing: cubicOut }} class="mx-auto max-w-4xl">
	<header class="mb-6">
		<h1 class="text-xl font-extrabold tracking-tight text-white">Settings</h1>
		<p class="mt-1 text-sm text-white/60">Manage your account, security and sessions</p>
	</header>

	<Tabs.Root value="account">
		<Tabs.List
			variant="line"
			class="mb-6 w-full justify-start gap-6 border-b border-white/10 p-0"
		>
			<Tabs.Trigger
				value="account"
				class="gap-2 px-0 pb-3 text-xs tracking-wider text-white/40 after:bg-indigo-400 hover:text-white/70 data-active:bg-transparent data-active:text-white"
			>
				<IconUser class="size-3.5" />
				Account
			</Tabs.Trigger>
			<Tabs.Trigger
				value="security"
				class="gap-2 px-0 pb-3 text-xs tracking-wider text-white/40 after:bg-indigo-400 hover:text-white/70 data-active:bg-transparent data-active:text-white"
			>
				<IconShieldLock class="size-3.5" />
				Security
			</Tabs.Trigger>
			<Tabs.Trigger
				value="sessions"
				class="gap-2 px-0 pb-3 text-xs tracking-wider text-white/40 after:bg-indigo-400 hover:text-white/70 data-active:bg-transparent data-active:text-white"
			>
				<IconDevices class="size-3.5" />
				Sessions
			</Tabs.Trigger>
			<Tabs.Trigger
				value="about"
				class="gap-2 px-0 pb-3 text-xs tracking-wider text-white/40 after:bg-indigo-400 hover:text-white/70 data-active:bg-transparent data-active:text-white"
			>
				<IconInfoSquare class="size-3.5" />
				About
			</Tabs.Trigger>
		</Tabs.List>

		<Tabs.Content value="account" class="flex flex-col gap-4">
			<section class="border border-white/10 bg-[#1a1a1a] p-6">
				<div class="mb-5 flex items-center gap-2 text-white/50">
					<IconUser class="h-4 w-4" />
					<span class="text-xs font-semibold tracking-widest uppercase">Profile</span>
				</div>

				<div class="flex flex-wrap items-start gap-5">
					<div
						class="flex h-14 w-14 items-center justify-center border border-white/10 bg-white/5 text-lg font-extrabold text-white"
					>
						{initials}
					</div>

					<form
						method="POST"
						action="?/updateName"
						use:enhanceProfile
						class="flex-1 min-w-64"
					>
						<label class="flex flex-col gap-1.5">
							<span class="text-xs font-semibold tracking-widest text-white/40 uppercase">
								Display name
							</span>
							<input
								name="name"
								maxlength="64"
								placeholder="Your name"
								class="border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white placeholder:text-white/30 transition focus:border-indigo-500/60 focus:outline-none focus:ring-1 focus:ring-indigo-500"
								bind:value={$displayName}
							/>
							{#if $profileErrors.name}
								<span class="text-xs font-medium text-red-300">{$profileErrors.name.join(' ')}</span>
							{/if}
						</label>

						<div class="mt-4 flex items-center gap-3">
							<button
								type="submit"
								disabled={$savingProfile}
								class="border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition duration-150 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
							>
								{$savingProfile ? 'Saving...' : 'Save changes'}
							</button>

							{#if $profileMessage && typeof $profileMessage !== 'string'}
								<span
									class="text-xs font-medium
										{$profileMessage.status === 'success' ? 'text-emerald-300' : 'text-red-300'}"
								>
									{$profileMessage.text}
								</span>
							{/if}
						</div>
					</form>
				</div>
			</section>

			<section class="border border-white/10 bg-[#1a1a1a] p-6">
				<div class="mb-5 flex items-center gap-2 text-white/50">
					<IconShieldCheck class="h-4 w-4" />
					<span class="text-xs font-semibold tracking-widest uppercase">Account</span>
				</div>

				<dl class="grid gap-4 sm:grid-cols-2">
					<div>
						<dt class="text-xs text-white/40">Email</dt>
						<dd class="mt-0.5 text-sm font-medium text-white">{user.email}</dd>
					</div>
					<div>
						<dt class="text-xs text-white/40">Verification</dt>
						<dd class="mt-1">
							<span
								class="border px-2 py-0.5 text-xs font-semibold
									{user.emailVerified
									? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
									: 'border-amber-500/30 bg-amber-500/10 text-amber-300'}"
							>
								{user.emailVerified ? 'Verified' : 'Unverified'}
							</span>
						</dd>
					</div>
					<div class="sm:col-span-2">
						<dt class="text-xs text-white/40">User ID</dt>
						<dd class="mt-0.5 truncate font-mono text-sm text-white/70">{user.id}</dd>
					</div>
				</dl>

				<div class="mt-5 flex items-center gap-2 border-t border-white/10 pt-4 text-xs text-white/40">
					<IconClock class="h-4 w-4" />
					Member since {memberSince}
				</div>
			</section>

			{#if data.panelLinkAvailable}
			<section class="border border-white/10 bg-[#1a1a1a] p-6">
				<div class="mb-5 flex items-center gap-2 text-white/50">
					<IconLink class="h-4 w-4" />
					<span class="text-xs font-semibold tracking-widest uppercase">Panel account</span>
				</div>

				{#if data.panelLinked}
					<div class="flex flex-wrap items-center justify-between gap-3">
						<div>
							<p class="text-sm font-medium text-white">{data.panelEmail}</p>
							<p class="mt-0.5 text-xs text-white/40">Linked and verified with the panel.</p>
						</div>
						<span class="border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-300">
							Linked
						</span>
					</div>
				{:else}
					<p class="mb-4 text-xs text-white/40">
						Link your panel account to access your servers. Use your existing panel password.
					</p>
					<form
						method="POST"
						action="?/linkPanel"
						use:enhancePanel
						class="grid max-w-lg gap-4 sm:grid-cols-2"
					>
						<label class="flex flex-col gap-1.5">
							<span class="text-xs font-semibold tracking-widest text-white/40 uppercase">
								Panel email
							</span>
							<input
								type="email"
								name="email"
								autocomplete="username"
								required
								class="border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white placeholder:text-white/30 transition focus:border-indigo-500/60 focus:outline-none focus:ring-1 focus:ring-indigo-500"
								bind:value={$panelEmail}
							/>
							{#if $panelErrors.email}
								<span class="text-xs font-medium text-red-300">{$panelErrors.email.join(' ')}</span>
							{/if}
						</label>
						<label class="flex flex-col gap-1.5">
							<span class="text-xs font-semibold tracking-widest text-white/40 uppercase">
								Panel password
							</span>
							<input
								type="password"
								name="password"
								autocomplete="current-password"
								required
								class="border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white placeholder:text-white/30 transition focus:border-indigo-500/60 focus:outline-none focus:ring-1 focus:ring-indigo-500"
								bind:value={$panelPassword}
							/>
							{#if $panelErrors.password}
								<span class="text-xs font-medium text-red-300">{$panelErrors.password.join(' ')}</span>
							{/if}
						</label>
						<div class="flex items-center gap-3 sm:col-span-2">
							<button
								type="submit"
								disabled={$linkingPanel}
								class="border border-indigo-500/40 bg-indigo-500/15 px-4 py-2 text-sm font-semibold text-indigo-200 transition hover:bg-indigo-500/25 disabled:opacity-50"
							>
								{$linkingPanel ? 'Verifying...' : 'Link panel account'}
							</button>
							{#if $panelMessage && typeof $panelMessage !== 'string'}
								<span
									class="text-xs font-medium
										{$panelMessage.status === 'success' ? 'text-emerald-300' : 'text-red-300'}"
								>
									{$panelMessage.text}
								</span>
							{/if}
						</div>
					</form>
				{/if}
			</section>
			{/if}
		</Tabs.Content>

		<Tabs.Content value="security" class="flex flex-col gap-4">
			<section class="border border-white/10 bg-[#1a1a1a] p-6">
				<div class="mb-5 flex items-center gap-2 text-white/50">
					<IconShieldLock class="h-4 w-4" />
					<span class="text-xs font-semibold tracking-widest uppercase">Change password</span>
				</div>

				<form
					method="POST"
					action="?/changePassword"
					use:enhancePassword
					class="flex max-w-md flex-col gap-4"
				>
					<label class="flex flex-col gap-1.5">
						<span class="text-xs font-semibold tracking-widest text-white/40 uppercase">
							Current password
						</span>
						<input
							type="password"
							name="currentPassword"
							autocomplete="current-password"
							required
							class="border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white placeholder:text-white/30 transition focus:border-indigo-500/60 focus:outline-none focus:ring-1 focus:ring-indigo-500"
						/>
						{#if $passwordErrors.currentPassword}
							<span class="text-xs font-medium text-red-300">
								{$passwordErrors.currentPassword.join(' ')}
							</span>
						{/if}
					</label>

					<label class="flex flex-col gap-1.5">
						<span class="text-xs font-semibold tracking-widest text-white/40 uppercase">
							New password
						</span>
						<input
							type="password"
							name="newPassword"
							autocomplete="new-password"
							required
							minlength="8"
							class="border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white placeholder:text-white/30 transition focus:border-indigo-500/60 focus:outline-none focus:ring-1 focus:ring-indigo-500"
						/>
						{#if $passwordErrors.newPassword}
							<span class="text-xs font-medium text-red-300">
								{$passwordErrors.newPassword.join(' ')}
							</span>
						{/if}
					</label>

					<label class="flex flex-col gap-1.5">
						<span class="text-xs font-semibold tracking-widest text-white/40 uppercase">
							Confirm new password
						</span>
						<input
							type="password"
							name="confirmPassword"
							autocomplete="new-password"
							required
							minlength="8"
							class="border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white placeholder:text-white/30 transition focus:border-indigo-500/60 focus:outline-none focus:ring-1 focus:ring-indigo-500"
						/>
						{#if $passwordErrors.confirmPassword}
							<span class="text-xs font-medium text-red-300">
								{$passwordErrors.confirmPassword.join(' ')}
							</span>
						{/if}
					</label>

					<div class="flex items-center gap-3">
						<button
							type="submit"
							disabled={$savingPassword}
							class="border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition duration-150 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
						>
							{$savingPassword ? 'Updating...' : 'Update password'}
						</button>

						{#if $passwordMessage && typeof $passwordMessage !== 'string'}
							<span
								class="text-xs font-medium
									{$passwordMessage.status === 'success' ? 'text-emerald-300' : 'text-red-300'}"
							>
								{$passwordMessage.text}
							</span>
						{/if}
					</div>
				</form>

				<p class="mt-4 border-t border-white/10 pt-4 text-xs text-white/40">
					Changing your password signs out all other devices.
				</p>
			</section>
		</Tabs.Content>

		<Tabs.Content value="sessions" class="flex flex-col gap-4">
			<section class="border border-white/10 bg-[#1a1a1a] p-6">
				<div class="mb-5 flex items-center justify-between gap-4">
					<div class="flex items-center gap-2 text-white/50">
						<IconDevices class="h-4 w-4" />
						<span class="text-xs font-semibold tracking-widest uppercase">
							Active sessions ({data.sessions.length})
						</span>
					</div>

					{#if data.sessions.length > 1}
						<form method="POST" action="?/revokeOtherSessions" use:enhanceRevoke>
							<button
								type="submit"
								disabled={$revoking}
								class="border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/10 disabled:opacity-50"
							>
								{$revoking ? 'Revoking...' : 'Sign out other devices'}
							</button>
						</form>
					{/if}
				</div>

				{#if $revokeMessage && typeof $revokeMessage !== 'string'}
					<p
						class="mb-4 text-xs font-medium
							{$revokeMessage.status === 'success' ? 'text-emerald-300' : 'text-red-300'}"
					>
						{$revokeMessage.text}
					</p>
				{/if}

				<div class="flex flex-col divide-y divide-white/5">
					{#each data.sessions as session (session.id)}
						{@const device = describeAgent(session.userAgent)}
						<div class="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
							<div class="flex h-9 w-9 items-center justify-center border border-white/10 bg-white/5">
								{#if device.mobile}
									<IconDeviceMobile class="h-4 w-4 text-white/60" />
								{:else}
									<IconDeviceDesktop class="h-4 w-4 text-white/60" />
								{/if}
							</div>

							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<p class="truncate text-sm font-semibold text-white">{device.label}</p>
									{#if session.current}
										<span
											class="border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-indigo-300 uppercase"
										>
											This device
										</span>
									{/if}
								</div>
								<p class="mt-0.5 text-xs text-white/40">
									{session.ipAddress ?? 'Unknown IP'} · Started {formatDate(session.createdAt)} ·
									Expires {formatDate(session.expiresAt)}
								</p>
							</div>
						</div>
					{/each}
				</div>
			</section>

			<section class="border border-white/10 bg-[#1a1a1a] p-6">
				<div class="mb-5 flex items-center gap-2 text-white/50">
					<IconLogout class="h-4 w-4" />
					<span class="text-xs font-semibold tracking-widest uppercase">Session</span>
				</div>

				<div class="flex flex-wrap items-center justify-between gap-4">
					<p class="text-sm text-white/60">Sign out of your account on this device.</p>
					<form method="POST" action="?/signout" use:enhanceSignout>
						<button
							type="submit"
							disabled={$signingOut}
							class="flex items-center gap-2 border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 transition duration-150 hover:bg-red-500/20 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
						>
							<IconLogout class="h-4 w-4" />
							{$signingOut ? 'Signing out...' : 'Sign out'}
						</button>
					</form>
				</div>
			</section>
		</Tabs.Content>



		<Tabs.Content value="about">
			<section class="mx-auto w-full max-w-md border border-white/10 bg-[#1a1a1a] p-6">
				<div class="flex flex-col items-center text-center">
					<img
						src={logo}
						alt="Neoactyl logo"
						class="mb-5 size-20 object-contain"
					/>

					<h2 class="text-xl font-extrabold tracking-tight text-white">
						Neoactyl
					</h2>

					<p class="mt-2 max-w-sm text-sm leading-relaxed text-white/50">
						A modern and intuitive game server management panel client.
					</p>

					<p class="mt-3 text-xs text-white/40">
						This panel uses
						<span class="font-semibold text-indigo-300">Neoactyl v0.0.1</span>.
					</p>

					<div class="mt-6 flex items-center gap-3">
						<a
							href="https://github.com/neoactyl"
							target="_blank"
							rel="noopener noreferrer"
							aria-label="Neoactyl on GitHub"
							title="GitHub"
							class="flex size-10 items-center justify-center border border-white/10 bg-white/5 text-white/60 transition hover:border-white/20 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
						>
							<IconBrandGithub class="size-5" />
						</a>

						<a
							href="https://discord.gg/XYzGe3ytSn"
							target="_blank"
							rel="noopener noreferrer"
							aria-label="Neoactyl Discord community"
							title="Discord"
							class="flex size-10 items-center justify-center border border-white/10 bg-white/5 text-white/60 transition hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
						>
							<IconBrandDiscord class="size-5" />
						</a>
					</div>
				</div>

				<div class="mt-8 border-t border-white/10 pt-5 text-center">
					<p class="text-xs leading-relaxed text-white/40">
						This panel uses <a href="https://neoactyl.app" target="_blank">Neoactyl</a>, licensed under
						<a
							href="https://creativecommons.org/licenses/by/4.0/"
							target="_blank"
							rel="noopener noreferrer"
							class="text-white/60 underline underline-offset-2 transition hover:text-white"
						>
							CC BY 4.0
						</a>.
					</p>
					<p class="mt-1 text-xs text-white/30">
						Attribution is required. Do not remove this notice.
					</p>
				</div>
			</section>
		</Tabs.Content>
	</Tabs.Root>
</div>
