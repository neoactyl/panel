<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
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
	<title>{data.egg.name} - Software - {data.branding.name}</title>
</svelte:head>

<SoftwarePolicyForm
	title={`Egg: ${data.egg.name}`}
	description={`${data.group.name} / ${data.egg.name}. Egg limits override nest limits; blank fields inherit from the nest.`}
	submitLabel="Save egg settings"
	sf={policySf}
>
	<div>
		<p class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">
			User-editable variables
		</p>
		<p class="mt-1 text-xs text-white/30">
			Choose which egg variables users may change during server creation.
		</p>

		{#if data.variablesError}
			<p class="mt-3 border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
				{data.variablesError}
			</p>
		{:else if data.variables.length === 0}
			<p class="mt-3 border border-dashed border-white/10 px-3 py-6 text-center text-xs text-white/35">
				This egg has no variables.
			</p>
		{:else}
			<div class="mt-3 divide-y divide-white/5 border border-white/10">
				{#each data.variables as variable (variable.key)}
					<label
						class="flex items-start gap-3 px-3 py-3 {variable.editable
							? 'cursor-pointer hover:bg-white/[0.02]'
							: 'opacity-60'}"
					>
						<div class="mt-0.5">
							<Checkbox
								name="variables"
								value={variable.key}
								checked={data.policy.editableVariables.includes(variable.key)}
								disabled={!variable.editable}
							/>
						</div>
						<span class="min-w-0 flex-1">
							<span class="flex flex-wrap items-center gap-2">
								<span class="text-sm font-semibold text-white">{variable.name}</span>
								<code class="border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/50">
									{variable.key}
								</code>
								{#if !variable.editable}
									<span
										class="border border-amber-500/20 bg-amber-500/5 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300/80 uppercase"
									>
										Panel-managed
									</span>
								{/if}
							</span>
							<span class="mt-1 block text-xs text-white/40">
								{variable.description || 'No description'}
							</span>
							<span class="mt-1 block font-mono text-[10px] text-white/30">
								Default: {variable.defaultValue || '(empty)'}
							</span>
						</span>
					</label>
				{/each}
			</div>
		{/if}
	</div>
</SoftwarePolicyForm>

<form
	method="POST"
	action="?/reset"
	use:resetEnhance
	class="mt-4 flex justify-end"
	onsubmit={(event) => {
		if (!confirm('Reset this egg to the nest defaults?')) event.preventDefault();
	}}
>
	<button
		type="submit"
		disabled={$resetting}
		class="flex items-center gap-1 border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/50 transition hover:bg-white/10"
	>
		<IconRefresh class="h-3.5 w-3.5" />
		Reset egg settings
	</button>
</form>
