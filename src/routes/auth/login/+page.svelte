<script lang="ts">
	import { superForm, fieldProxy } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { fly } from 'svelte/transition';
	import IconBrandDiscord from '@tabler/icons-svelte/icons/brand-discord';
	import IconMail from '@tabler/icons-svelte/icons/mail';
	import IconLock from '@tabler/icons-svelte/icons/lock';
	import logo from '#lib/assets/logo.svg';
	import { loginSchema } from '#lib/schemas.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const login = superForm(data.loginForm, {
		id: 'login',
		validators: zod4Client(loginSchema)
	});

	const discord = superForm(data.discordForm, { id: 'discord' });

	const email = fieldProxy(login, 'email');
	const password = fieldProxy(login, 'password');
	const { enhance: enhanceLogin, errors: loginErrors, message: loginMessage, submitting: loginSubmitting } = login;
	const { enhance: enhanceDiscord, message: discordMessage, submitting: discordSubmitting } = discord;

	const inputCls =
		'appearance-none rounded-none peer relative block w-full pl-11 pr-3 pt-5 pb-1.5 border border-white/10 bg-transparent text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition duration-150';
	const iconCls =
		'absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40 peer-focus:text-white/60 pointer-events-none transition-all duration-150';
	const labelCls =
		'absolute left-9 top-1/2 -translate-y-1/2 text-sm text-white/40 pointer-events-none transition-all duration-150 peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:px-1.5 peer-focus:bg-[#1a1a1a] peer-focus:text-[13px] peer-focus:text-white/70 peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:-translate-y-1/2 peer-[:not(:placeholder-shown)]:px-1.5 peer-[:not(:placeholder-shown)]:bg-[#1a1a1a] peer-[:not(:placeholder-shown)]:text-[13px] peer-[:not(:placeholder-shown)]:text-white/70';
	const fieldErrorCls = 'text-red-400 text-xs mt-1';
</script>

<svelte:head>
	<title>Sign in - {data.branding.name}</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center py-12 px-6 sm:px-10 lg:px-16">
	<div
		in:fly={{ y: -20, duration: 500 }}
		class="max-w-sm w-full space-y-6 bg-[#1a1a1a] border border-white/10 p-6 sm:p-8 shadow-2xl shadow-black/60"
	>
		<div>
			<img src={data.branding.logo || logo} alt={data.branding.name} class="mx-auto h-20 w-auto" />
			<h2 class="mt-3 text-center text-2xl font-extrabold text-white tracking-tight">Welcome Back</h2>
			<p class="mt-1 text-center text-sm text-white/60">Sign in to your account</p>
		</div>
		<form class="space-y-5" method="POST" action="?/login" use:enhanceLogin>
			<div class="space-y-4">
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
				{#if $loginErrors.email}
					<p class={fieldErrorCls} role="alert">{$loginErrors.email.join(' ')}</p>
				{/if}
				<div class="relative">
					<IconLock class={iconCls} />
					<input
						id="password"
						name="password"
						type="password"
						autocomplete="current-password"
						required
						placeholder=" "
						class={inputCls}
						bind:value={$password}
					/>
					<label for="password" class={labelCls}>Password</label>
				</div>
				{#if $loginErrors.password}
					<p class={fieldErrorCls} role="alert">{$loginErrors.password.join(' ')}</p>
				{/if}
			</div>

			{#if $loginMessage}
				<div class="text-red-400 text-sm mt-2 text-center" role="alert">{$loginMessage}</div>
			{:else if $loginErrors._errors}
				{#each $loginErrors._errors as error}
					<div class="text-red-400 text-sm mt-2 text-center" role="alert">{error}</div>
				{/each}
			{/if}

			<div>
				<button
					type="submit"
					disabled={$loginSubmitting || $discordSubmitting}
					class="group relative w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-semibold rounded-none text-white bg-indigo-600 hover:bg-indigo-500 hover:scale-[1.02] active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#1a1a1a] focus:ring-indigo-500 transition duration-150 ease-in-out disabled:pointer-events-none disabled:opacity-50"
				>
					{$loginSubmitting ? 'Signing in...' : 'Sign in'}
				</button>
			</div>
		</form>
		<div class="mt-4">
			<div class="relative">
				<div class="absolute inset-0 flex items-center">
					<div class="w-full border-t border-white/10"></div>
				</div>
				<div class="relative flex justify-center text-sm">
					<span class="px-2 bg-[#1a1a1a] text-white/50">Or continue with</span>
				</div>
			</div>
			<div class="mt-4">
				{#if $discordMessage}
					<div class="text-red-400 text-sm mb-2 text-center" role="alert">{$discordMessage}</div>
				{/if}
				<form method="POST" action="?/discord" use:enhanceDiscord>
					<button
						type="submit"
						disabled={$loginSubmitting || $discordSubmitting}
						class="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-none shadow-sm text-sm font-semibold text-white bg-[#5865f2] hover:bg-[#4752c4] hover:scale-[1.02] active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#1a1a1a] focus:ring-indigo-500 transition duration-150 ease-in-out disabled:pointer-events-none disabled:opacity-50"
					>
						<IconBrandDiscord class="w-5 h-5 mr-2" />
						{$discordSubmitting ? 'Redirecting...' : 'Sign in with Discord'}
					</button>
				</form>
			</div>
		</div>
		{#if data.registration}
			<div class="text-center mt-2">
				<a
					href="/auth/register"
					class="font-medium text-indigo-400 hover:text-indigo-300 text-sm transition duration-150 ease-in-out"
				>
					Don't have an account? Sign up
				</a>
			</div>
		{/if}
	</div>
</div>
