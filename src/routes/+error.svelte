<script lang="ts">
	import { page } from '$app/state';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import logo from '#lib/assets/logo.svg';
	import GridBackground from '#lib/components/app/GridBackground.svelte';
	import IconArrowLeft from '@tabler/icons-svelte/icons/arrow-left';
	import IconHome from '@tabler/icons-svelte/icons/home';

	const FALLBACK = {
		title: 'Something went wrong',
		message: 'An unexpected error occurred while processing your request.'
	};

	const MESSAGES: Record<number, { title: string; message: string }> = {
		400: { title: 'Bad request', message: 'The request could not be understood by the server.' },
		401: { title: 'Unauthorized', message: 'You need to sign in before accessing this page.' },
		403: { title: 'Forbidden', message: "You don't have permission to view this resource." },
		404: {
			title: 'Page not found',
			message: "The page you're looking for doesn't exist or may have been moved."
		},
		405: { title: 'Method not allowed', message: 'That action is not supported on this page.' },
		429: { title: 'Too many requests', message: 'Slow down — try again in a moment.' },
		500: { title: 'Internal server error', message: 'The server hit a problem handling your request.' },
		503: { title: 'Service unavailable', message: 'The service is temporarily unavailable. Try again shortly.' }
	};

	const brand = $derived(
		(page.data.branding as { name: string; logo: string } | undefined) ?? {
			name: 'Neoactyl',
			logo: ''
		}
	);
	const info = $derived(MESSAGES[page.status] ?? FALLBACK);
	const detail = $derived(page.error?.message);
	const reference = $derived(page.error?.reference);
</script>

<svelte:head>
	<title>{page.status} - {brand.name}</title>
</svelte:head>

<GridBackground />

<div class="relative flex min-h-svh items-center justify-center px-6">
	<div
		in:fly={{ y: 16, duration: 350, easing: cubicOut }}
		class="w-full max-w-md border border-white/10 bg-[#1a1a1a] p-8"
	>
		<img src={brand.logo || logo} alt={brand.name} class="mb-6 h-12 w-auto" />

		<p class="font-mono text-5xl font-extrabold tracking-tight text-white">{page.status}</p>
		<h1 class="mt-3 text-lg font-bold text-white">{info.title}</h1>
		<p class="mt-2 text-sm text-white/60">{info.message}</p>

		{#if detail}
			<p class="mt-4 border border-white/10 bg-[#121212] px-3 py-2 font-mono text-xs text-white/40">
				{detail}
			</p>
		{/if}

		{#if reference}
			<p class="mt-2 font-mono text-[11px] text-white/30">Reference: {reference}</p>
		{/if}

		<div class="mt-8 flex flex-col gap-2 sm:flex-row">
			<a
				href="/dashboard"
				class="flex flex-1 items-center justify-center gap-2 border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition duration-150 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500"
			>
				<IconArrowLeft class="h-4 w-4" />
				Dashboard
			</a>
			<a
				href="/"
				class="flex flex-1 items-center justify-center gap-2 border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-sm font-semibold text-indigo-200 transition duration-150 hover:bg-indigo-500/20 focus:outline-none focus:ring-2 focus:ring-indigo-500"
			>
				<IconHome class="h-4 w-4" />
				Home
			</a>
		</div>
	</div>
</div>
