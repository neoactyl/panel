<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import IconShieldLock from '@tabler/icons-svelte/icons/shield-lock';
	import logo from '#lib/assets/logo.svg';

	let { data }: App.PageData = $props();

	const sf = superForm(data.form, {
		id: 'setup'
	});

	const { form, message, submitting, enhance } = sf;

	const input =
		'w-full border border-white/10 bg-[#121212] px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:border-indigo-500/60 focus:outline-none';
	const label = 'mb-1.5 block text-[11px] font-semibold tracking-wider text-white/50 uppercase';
	const errorText = 'mt-1 text-xs text-red-300';
</script>

<svelte:head>
	<title>Set up {data.branding?.name}</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center px-6 py-12">
	<div class="w-full max-w-2xl border border-white/10 bg-[#1a1a1a] p-6 shadow-2xl shadow-black/60 sm:p-8">
		<div class="flex items-center gap-4 border-b border-white/10 pb-6">
			<div class="flex h-14 w-14 shrink-0 items-center justify-center border border-white/10 bg-white/5">
				<img src={data.branding?.logo || logo} alt="" class="h-8 w-auto" />
			</div>
			<div>
				<p class="text-[10px] font-semibold tracking-[0.2em] text-indigo-300 uppercase">First run</p>
				<h1 class="mt-1 text-xl font-extrabold tracking-tight text-white">Set up your dashboard</h1>
				<p class="mt-1 text-sm text-white/50">Create the first administrator account.</p>
			</div>
		</div>

		{#if $message}
			<div class="mt-5 border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
				{$message}
			</div>
		{/if}

		<form method="POST" action="?/setup" use:enhance class="mt-5 space-y-5">
			<div class="grid gap-4 sm:grid-cols-2">
				<div>
					<label class={label} for="name">Name</label>
					<input id="name" name="name" class={input} value={$form.name ?? ''} autocomplete="name" required />
				</div>
				<div>
					<label class={label} for="email">Email</label>
					<input id="email" name="email" type="email" class={input} value={$form.email ?? ''} autocomplete="email" required />
				</div>
				<div>
					<label class={label} for="password">Password</label>
					<input id="password" name="password" type="password" class={input} value={$form.password ?? ''} autocomplete="new-password" required />
				</div>
				<div>
					<label class={label} for="confirmPassword">Confirm password</label>
					<input id="confirmPassword" name="confirmPassword" type="password" class={input} value={$form.confirmPassword ?? ''} autocomplete="new-password" required />
				</div>
			</div>

			<div class="border-t border-white/10 pt-5">
				<p class="mb-4 flex items-center gap-2 text-[10px] font-semibold tracking-widest text-white/40 uppercase">
					<IconShieldLock class="h-3.5 w-3.5" /> Settings
				</p>
				<div class="grid gap-4 sm:grid-cols-2">
					<div>
						<label class={label} for="appName">App name</label>
						<input id="appName" name="appName" class={input} value={$form.appName ?? ''} />
					</div>
					<div>
						<label class={label} for="description">Description</label>
						<input id="description" name="description" class={input} value={$form.description ?? ''} />
					</div>
				</div>
				<div class="mt-4">
					<label class={label} for="logo">Logo URL</label>
					<div class="relative">
						<IconShieldLock class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-white/30" />
						<input id="logo" name="logo" class="{input} pl-9" value={$form.logo ?? ''} placeholder="https://example.com/logo.png" />
					</div>
				</div>
			</div>

			<button type="submit" disabled={$submitting} class="flex w-full items-center justify-center gap-2 bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-50">
				<IconShieldLock class="h-4 w-4" />
				{$submitting ? 'Creating...' : 'Create administrator'}
			</button>
		</form>
	</div>
</div>
