<script lang="ts">
	import { page } from '$app/state';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import IconAlertTriangle from '@tabler/icons-svelte/icons/alert-triangle';

	const info = $derived(
		page.status === 404
			? { title: 'Not found', message: "This page doesn't exist or has been moved." }
			: page.status === 403
				? { title: 'Forbidden', message: "You don't have access to this resource." }
				: { title: 'Something went wrong', message: 'The request could not be completed.' }
	);

	const brand = $derived(
		(page.data.branding as { name: string } | undefined) ?? { name: 'Neoactyl' }
	);
</script>

<svelte:head>
	<title>{page.status} - {brand.name}</title>
</svelte:head>

<div
	in:fly={{ y: 12, duration: 300, easing: cubicOut }}
	class="mx-auto flex max-w-4xl flex-col items-center border border-white/10 bg-[#1a1a1a] px-6 py-16 text-center"
>
	<IconAlertTriangle class="h-8 w-8 text-white/30" />
	<p class="mt-4 font-mono text-3xl font-extrabold text-white">{page.status}</p>
	<h1 class="mt-2 text-base font-bold text-white">{info.title}</h1>
	<p class="mt-1 text-sm text-white/60">{info.message}</p>
	<a
		href="/dashboard"
		class="mt-6 border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
	>
		Back to dashboard
	</a>
</div>
