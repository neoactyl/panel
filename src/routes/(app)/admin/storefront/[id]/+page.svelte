<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import StorefrontItemForm from '#lib/components/admin/StorefrontItemForm.svelte';
	import { storefrontItemSchema } from '#lib/schemas.ts';
	import IconTrash from '@tabler/icons-svelte/icons/trash';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const itemSf = superForm(data.itemForm, {
		id: 'item',
		validators: zod4Client(storefrontItemSchema)
	});

	const { enhance: deleteEnhance, submitting: deleting } = superForm(data.deleteForm, {
		id: 'delete'
	});
</script>

<svelte:head>
	<title>Edit {data.item.name} - {data.branding.name}</title>
</svelte:head>

<StorefrontItemForm
	nodes={data.nodes}
	groups={data.groups}
	software={data.software}
	sf={itemSf}
	isEditing
/>

<form
	method="POST"
	action="?/delete"
	use:deleteEnhance
	class="mt-4 flex justify-end"
	onsubmit={(event) => {
		if (!confirm(`Delete ${data.item.name}? This cannot be undone.`)) event.preventDefault();
	}}
>
	<button
		type="submit"
		disabled={$deleting}
		class="flex items-center gap-1 border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-500/10"
	>
		<IconTrash class="h-3.5 w-3.5" />
		Delete item
	</button>
</form>
