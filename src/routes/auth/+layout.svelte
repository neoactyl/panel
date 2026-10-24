<script lang="ts">
	import { page } from '$app/state';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import GridBackground from '#lib/components/app/GridBackground.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	let prevPath = '';

	function slideParams(current: string) {
		const x = current > prevPath ? 32 : -32;
		prevPath = current;
		return { x, duration: 300, easing: cubicOut, opacity: 0 };
	}
</script>

<GridBackground />

<div class="relative min-h-screen overflow-hidden">
	{#key page.url.pathname}
		<div class="relative" in:fly={{ ...slideParams(page.url.pathname) }}>
			{@render children()}
		</div>
	{/key}
</div>
