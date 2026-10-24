<script lang="ts">
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<div class="mx-auto max-w-5xl">
	<header class="mb-6">
		<p class="text-[10px] font-semibold tracking-[0.2em] text-indigo-300 uppercase">
			Administration
		</p>
		<h1 class="mt-1 text-xl font-extrabold tracking-tight text-white">Panel control</h1>
	</header>

	{@render children()}
</div>
