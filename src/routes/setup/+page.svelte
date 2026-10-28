<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { fly } from 'svelte/transition';
	import IconShieldLock from '@tabler/icons-svelte/icons/shield-lock';
	import IconServer from '@tabler/icons-svelte/icons/server';
	import IconPhoto from '@tabler/icons-svelte/icons/photo';
	import IconWorld from '@tabler/icons-svelte/icons/world';
	import logo from '#lib/assets/logo.svg';
	import { setupCreateSchema, setupSettingsSchema } from '#lib/schemas.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const create = superForm(data.createForm, {
		id: 'create',
		validators: zod4Client(setupCreateSchema)
	});
	const claim = superForm(data.claimForm, {
		id: 'claim',
		validators: zod4Client(setupSettingsSchema)
	});

	const {
		form: createData,
		enhance: enhanceCreate,
		errors: createErrors,
		message: createMessage,
		submitting: createSubmitting
	} = create;
	const {
		form: claimData,
		enhance: enhanceClaim,
		errors: claimErrors,
		message: claimMessage,
		submitting: claimSubmitting
	} = claim;

	// Seed defaults into the stores so validation sees what the inputs show
	for (const f of [createData, claimData]) {
		f.update(($f) => ({
			...$f,
			appName: $f.appName || data.branding.name,
			description: $f.description || data.branding.description,
			logo: $f.logo || data.branding.logo || '',
			adapter: $f.adapter || (data.panel.adapter === 'calagopus' ? 'calagopus' : 'mock'),
			panelUrl: $f.panelUrl || data.panel.url || ''
		}));
	}

	const input =
		'w-full border border-white/10 bg-[#121212] px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:border-indigo-500/60 focus:outline-none';
	const label = 'mb-1.5 block text-[11px] font-semibold tracking-wider text-white/50 uppercase';
	const errorText = 'mt-1 text-xs text-red-300';
</script>

<svelte:head>
	<title>Set up {data.branding.name}</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center px-6 py-12">
	<div
		in:fly={{ y: -16, duration: 450 }}
		class="w-full max-w-2xl border border-white/10 bg-[#1a1a1a] p-6 shadow-2xl shadow-black/60 sm:p-8"
	>
		<div class="flex items-center gap-4 border-b border-white/10 pb-6">
			<div class="flex h-14 w-14 shrink-0 items-center justify-center border border-white/10 bg-white/5">
				<img src={data.branding.logo || logo} alt="" class="h-8 w-auto" />
			</div>
			<div>
				<p class="text-[10px] font-semibold tracking-[0.2em] text-indigo-300 uppercase">First run</p>
				<h1 class="mt-1 text-xl font-extrabold tracking-tight text-white">Set up your dashboard</h1>
				<p class="mt-1 text-sm text-white/50">
					Create the first administrator and configure the panel connection.
				</p>
			</div>
		</div>

		{#if data.existingUser && data.canClaim}
			<div class="mt-5 border border-indigo-500/20 bg-indigo-500/5 p-4">
				<p class="text-sm text-white/70">
					Signed in as the first account,
					<span class="font-semibold text-white">{data.existingUser.email}</span>. You can claim the
					administrator role.
				</p>
				{#if $claimMessage}
					<div class="mt-3 border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
						{$claimMessage}
					</div>
				{/if}
				<form method="POST" action="?/claim" use:enhanceClaim class="mt-5 space-y-5">
					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<label class={label} for="claim-appName">App name</label>
							<input id="claim-appName" name="appName" class={input} bind:value={$claimData.appName} />
							{#if $claimErrors.appName}<p class={errorText}>{$claimErrors.appName.join(' ')}</p>{/if}
						</div>
						<div>
							<label class={label} for="claim-description">Description</label>
							<input
								id="claim-description"
								name="description"
								class={input}
								bind:value={$claimData.description}
							/>
							{#if $claimErrors.description}
								<p class={errorText}>{$claimErrors.description.join(' ')}</p>
							{/if}
						</div>
					</div>
					<div>
						<label class={label} for="claim-logo">Logo URL</label>
						<input
							id="claim-logo"
							name="logo"
							class={input}
							bind:value={$claimData.logo}
							placeholder="https://example.com/logo.png"
						/>
						{#if $claimErrors.logo}<p class={errorText}>{$claimErrors.logo.join(' ')}</p>{/if}
					</div>
					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<label class={label} for="claim-adapter">Panel adapter</label>
							<select id="claim-adapter" name="adapter" class={input} bind:value={$claimData.adapter}>
								<option value="mock">Mock</option>
								<option value="calagopus">Calagopus</option>
							</select>
						</div>
						<div>
							<label class={label} for="claim-panelUrl">Panel URL</label>
							<input
								id="claim-panelUrl"
								name="panelUrl"
								class={input}
								bind:value={$claimData.panelUrl}
								placeholder="https://panel.example.com"
							/>
							{#if $claimErrors.panelUrl}<p class={errorText}>{$claimErrors.panelUrl.join(' ')}</p>{/if}
						</div>
					</div>
					<div>
						<label class={label} for="claim-panelToken">Panel API token</label>
						<input
							id="claim-panelToken"
							name="panelToken"
							type="password"
							class={input}
							bind:value={$claimData.panelToken}
							placeholder={data.panel.tokenSet
								? 'Leave blank to keep the current token'
								: 'Required for Calagopus'}
						/>
						{#if $claimErrors.panelToken}
							<p class={errorText}>{$claimErrors.panelToken.join(' ')}</p>
						{/if}
					</div>

					<button
						type="submit"
						disabled={$claimSubmitting}
						class="flex w-full items-center justify-center gap-2 bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-50"
					>
						<IconShieldLock class="h-4 w-4" />
						{$claimSubmitting ? 'Claiming...' : 'Claim administrator'}
					</button>
				</form>
			</div>
		{:else if data.existingUser}
			<div class="mt-5 border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
				This account is not the first account on this instance, so it cannot claim the
				administrator role. Sign in with the first account to finish setup.
			</div>
		{:else if data.hasUsers}
			<div class="mt-5 border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
				Accounts already exist on this instance. Only the first account can claim the administrator
				role.
				<a href="/auth/login" class="mt-3 inline-block font-semibold text-white underline">
					Sign in with the first account
				</a>
			</div>
		{/if}

		{#if !data.existingUser && !data.hasUsers}
			{#if $createMessage}
				<div class="mt-5 border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
					{$createMessage}
				</div>
			{/if}
			<form method="POST" action="?/create" use:enhanceCreate class="mt-5 space-y-5">
				<div class="grid gap-4 sm:grid-cols-2">
					<div>
						<label class={label} for="name">Admin name</label>
						<input id="name" name="name" class={input} autocomplete="name" bind:value={$createData.name} />
						{#if $createErrors.name}<p class={errorText}>{$createErrors.name.join(' ')}</p>{/if}
					</div>
					<div>
						<label class={label} for="email">Admin email</label>
						<input
							id="email"
							name="email"
							type="email"
							class={input}
							autocomplete="email"
							bind:value={$createData.email}
						/>
						{#if $createErrors.email}<p class={errorText}>{$createErrors.email.join(' ')}</p>{/if}
					</div>
					<div>
						<label class={label} for="password">Password</label>
						<input
							id="password"
							name="password"
							type="password"
							class={input}
							autocomplete="new-password"
							bind:value={$createData.password}
						/>
						{#if $createErrors.password}<p class={errorText}>{$createErrors.password.join(' ')}</p>{/if}
					</div>
					<div>
						<label class={label} for="confirmPassword">Confirm password</label>
						<input
							id="confirmPassword"
							name="confirmPassword"
							type="password"
							class={input}
							autocomplete="new-password"
							bind:value={$createData.confirmPassword}
						/>
						{#if $createErrors.confirmPassword}
							<p class={errorText}>{$createErrors.confirmPassword.join(' ')}</p>
						{/if}
					</div>
				</div>

				<div class="border-t border-white/10 pt-5">
					<p class="mb-4 flex items-center gap-2 text-[10px] font-semibold tracking-widest text-white/40 uppercase">
						<IconWorld class="h-3.5 w-3.5" /> Branding
					</p>
					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<label class={label} for="appName">App name</label>
							<input id="appName" name="appName" class={input} bind:value={$createData.appName} />
							{#if $createErrors.appName}<p class={errorText}>{$createErrors.appName.join(' ')}</p>{/if}
						</div>
						<div>
							<label class={label} for="description">Description</label>
							<input
								id="description"
								name="description"
								class={input}
								bind:value={$createData.description}
							/>
							{#if $createErrors.description}
								<p class={errorText}>{$createErrors.description.join(' ')}</p>
							{/if}
						</div>
					</div>
					<div class="mt-4">
						<label class={label} for="logo">Logo URL</label>
						<div class="relative">
							<IconPhoto class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-white/30" />
							<input
								id="logo"
								name="logo"
								class="{input} pl-9"
								bind:value={$createData.logo}
								placeholder="https://example.com/logo.png"
							/>
						</div>
						{#if $createErrors.logo}<p class={errorText}>{$createErrors.logo.join(' ')}</p>{/if}
					</div>
				</div>

				<div class="border-t border-white/10 pt-5">
					<p class="mb-4 flex items-center gap-2 text-[10px] font-semibold tracking-widest text-white/40 uppercase">
						<IconServer class="h-3.5 w-3.5" /> Panel connection
					</p>
					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<label class={label} for="adapter">Adapter</label>
							<select id="adapter" name="adapter" class={input} bind:value={$createData.adapter}>
								<option value="mock">Mock</option>
								<option value="calagopus">Calagopus</option>
							</select>
						</div>
						<div>
							<label class={label} for="panelUrl">Panel URL</label>
							<input
								id="panelUrl"
								name="panelUrl"
								class={input}
								bind:value={$createData.panelUrl}
								placeholder="https://panel.example.com"
							/>
							{#if $createErrors.panelUrl}<p class={errorText}>{$createErrors.panelUrl.join(' ')}</p>{/if}
						</div>
					</div>
					<div class="mt-4">
						<label class={label} for="panelToken">Panel API token</label>
						<input
							id="panelToken"
							name="panelToken"
							type="password"
							class={input}
							bind:value={$createData.panelToken}
							placeholder="Required for Calagopus"
						/>
						{#if $createErrors.panelToken}
							<p class={errorText}>{$createErrors.panelToken.join(' ')}</p>
						{/if}
					</div>
				</div>

				<button
					type="submit"
					disabled={$createSubmitting}
					class="flex w-full items-center justify-center gap-2 bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-50"
				>
					<IconShieldLock class="h-4 w-4" />
					{$createSubmitting ? 'Creating...' : 'Create administrator'}
				</button>
			</form>
		{/if}
	</div>
</div>
