<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SoftwarePolicyForm from '#lib/components/admin/SoftwarePolicyForm.svelte';
	import { softwarePolicySchema } from '#lib/schemas.ts';
	import IconRefresh from '@tabler/icons-svelte/icons/refresh';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const policySf = superForm(data.policyForm, {
		id: 'policy',
		validators: zod4Client(softwarePolicySchema)
	});

	const { enhance: resetEnhance, submitting: resetting } = superForm(data.resetForm, {
		id: 'reset'
	});
</script>

<svelte:head>
	<title>{data.group.name} - Software - {data.branding.name}</title>
</svelte:head>

<SoftwarePolicyForm
	title={`Nest: ${data.group.name}`}
	description="These limits apply to every egg in this nest unless the egg overrides them."
	submitLabel="Save nest settings"
	sf={policySf}
/>

<form
	method="POST"
	action="?/reset"
	use:resetEnhance
	class="mt-4 flex justify-end"
	onsubmit={(event) => {
		if (!confirm('Reset this nest to the default settings?')) event.preventDefault();
	}}
>
	<button
		type="submit"
		disabled={$resetting}
		class="flex items-center gap-1 border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/50 transition hover:bg-white/10"
	>
		<IconRefresh class="h-3.5 w-3.5" />
		Reset nest settings
	</button>
</form>
