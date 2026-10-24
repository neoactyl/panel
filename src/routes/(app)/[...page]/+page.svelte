<script lang="ts">
	import BlueprintPage from '#lib/panel/BlueprintPage.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<BlueprintPage page={data.blueprintPage} scope={data.scope} />
