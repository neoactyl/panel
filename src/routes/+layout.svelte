<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { sound } from '#lib/client/sound.ts';
	import { onMount } from 'svelte';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	onMount(() => {
		sound.setEnabled(data.soundEnabled ?? true);
	});
</script>

<svelte:head>
	<link rel="icon" href={data.branding.logo || favicon} />
	<title>{data.branding.name}</title>
</svelte:head>

{@render children()}
