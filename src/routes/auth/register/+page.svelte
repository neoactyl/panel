<script lang="ts">
	import { superForm, fieldProxy } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { fly } from 'svelte/transition';
	import IconUser from '@tabler/icons-svelte/icons/user';
	import IconMail from '@tabler/icons-svelte/icons/mail';
	import IconLock from '@tabler/icons-svelte/icons/lock';
	import IconShieldLock from '@tabler/icons-svelte/icons/shield-lock';
	import logo from '#lib/assets/logo.svg';
	import { registerSchema } from '#lib/schemas.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const register = superForm(data.registerForm, {
		id: 'register',
		validators: zod4Client(registerSchema)
	});

	const name = fieldProxy(register, 'name');
	const email = fieldProxy(register, 'email');
	const password = fieldProxy(register, 'password');
	const confirmPassword = fieldProxy(register, 'confirmPassword');
	const { enhance, errors, message: registerMessage, submitting } = register;

	const inputCls =
		'appearance-none rounded-none peer relative block w-full pl-11 pr-3 pt-5 pb-1.5 border border-white/10 bg-transparent text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition duration-150';
	const iconCls =
		'absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40 peer-focus:text-white/60 pointer-events-none transition-all duration-150';
	const labelCls =
		'absolute left-9 top-1/2 -translate-y-1/2 text-sm text-white/40 pointer-events-none transition-all duration-150 peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:px-1.5 peer-focus:bg-[#1a1a1a] peer-focus:text-[13px] peer-focus:text-white/70 peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:-translate-y-1/2 peer-[:not(:placeholder-shown)]:px-1.5 peer-[:not(:placeholder-shown)]:bg-[#1a1a1a] peer-[:not(:placeholder-shown)]:text-[13px] peer-[:not(:placeholder-shown)]:text-white/70';
	const fieldErrorCls = 'text-red-400 text-xs mt-1';
</script>

<svelte:head>
	<title>Create account - {data.branding.name}</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center py-12 px-6 sm:px-10 lg:px-16">
	<div
		in:fly={{ y: -20, duration: 500 }}
		class="max-w-sm w-full space-y-6 bg-[#1a1a1a] border border-white/10 p-6 sm:p-8 shadow-2xl shadow-black/60"
	>
		<div>
			<img src={data.branding.logo || logo} alt={data.branding.name} class="mx-auto h-20 w-auto" />
			<h2 class="mt-3 text-center text-2xl font-extrabold text-white tracking-tight">Create Account</h2>
			<p class="mt-1 text-center text-sm text-white/60">Sign up to get started with {data.branding.name}</p>
		</div>
		<form class="space-y-5" method="POST" action="/auth/register" use:enhance>
			<input type="hidden" name="ref" value={data.ref ?? ''} />
			{#if data.referrer}
				<div
					class="border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-center text-xs text-indigo-200"
				>
					Invited by {data.referrer}
				</div>
			{/if}
			<div class="space-y-4">
				<div class="relative">
					<IconUser class={iconCls} />
					<input
						id="name"
						name="name"
						type="text"
						autocomplete="name"
						required
						placeholder=" "
						class={inputCls}
						bind:value={$name}
					/>
					<label for="name" class={labelCls}>Full name</label>
				</div>
				{#if $errors.name}
					<p class={fieldErrorCls} role="alert">{$errors.name.join(' ')}</p>
				{/if}
				<div class="relative">
					<IconMail class={iconCls} />
					<input
						id="email"
						name="email"
						type="email"
						autocomplete="email"
						required
						placeholder=" "
						class={inputCls}
						bind:value={$email}
					/>
					<label for="email" class={labelCls}>Email address</label>
				</div>
				{#if $errors.email}
					<p class={fieldErrorCls} role="alert">{$errors.email.join(' ')}</p>
				{/if}
				<div class="relative">
					<IconLock class={iconCls} />
					<input
						id="password"
						name="password"
						type="password"
						autocomplete="new-password"
						minlength={8}
						required
						placeholder=" "
						class={inputCls}
						bind:value={$password}
					/>
					<label for="password" class={labelCls}>Password</label>
				</div>
				{#if $errors.password}
					<p class={fieldErrorCls} role="alert">{$errors.password.join(' ')}</p>
				{/if}
				<div class="relative">
					<IconShieldLock class={iconCls} />
					<input
						id="confirm-password"
						name="confirmPassword"
						type="password"
						autocomplete="new-password"
						required
						placeholder=" "
						class={inputCls}
						bind:value={$confirmPassword}
					/>
					<label for="confirm-password" class={labelCls}>Confirm password</label>
				</div>
				{#if $errors.confirmPassword}
					<p class={fieldErrorCls} role="alert">{$errors.confirmPassword.join(' ')}</p>
				{/if}
			</div>

			{#if $registerMessage}
				<div class="text-red-400 text-sm mt-2 text-center" role="alert">{$registerMessage}</div>
			{:else if $errors._errors}
				{#each $errors._errors as error}
					<div class="text-red-400 text-sm mt-2 text-center list-disc list-inside" role="alert">
						{error}
					</div>
				{/each}
			{/if}

			<div>
				<button
					type="submit"
					disabled={$submitting}
					class="group relative w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-semibold rounded-none text-white bg-indigo-600 hover:bg-indigo-500 hover:scale-[1.02] active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#1a1a1a] focus:ring-indigo-500 transition duration-150 ease-in-out disabled:pointer-events-none disabled:opacity-50"
				>
					{$submitting ? 'Creating account...' : 'Create account'}
				</button>
			</div>
		</form>
		<div class="text-center mt-2">
			<a
				href="/auth/login"
				class="font-medium text-indigo-400 hover:text-indigo-300 text-sm transition duration-150 ease-in-out"
			>
				Already have an account? Sign in
			</a>
		</div>
	</div>
</div>
