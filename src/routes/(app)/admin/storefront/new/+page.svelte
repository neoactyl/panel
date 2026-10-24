<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import StorefrontItemForm from '#lib/components/admin/StorefrontItemForm.svelte';
	import { storefrontItemSchema } from '#lib/schemas.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const itemSf = superForm(data.itemForm, {
		id: 'item',
		validators: zod4Client(storefrontItemSchema)
	});
</script>

<svelte:head>
	<title>New storefront item - {data.branding.name}</title>
</svelte:head>

<StorefrontItemForm
	nodes={data.nodes}
	groups={data.groups}
	software={data.software}
	sf={itemSf}
/>
