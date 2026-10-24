<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import type { PanelField } from '#lib/adapter/sdk.ts';

	let {
		actionId,
		fields,
		submitLabel = 'Save',
		busy = false,
		onsubmit
	}: {
		actionId: string;
		fields: PanelField[];
		submitLabel?: string;
		busy?: boolean;
		onsubmit: (values: Record<string, string | number | boolean>) => void;
	} = $props();

	const defaults = () =>
		Object.fromEntries(
			fields.map((field) => [
				field.name,
				field.type === 'checkbox'
					? Boolean(field.value)
					: (field.value ??
						(field.type === 'select'
							? (field.options?.[0]?.value ?? '')
							: field.type === 'number'
								? 0
								: ''))
			])
		) as Record<string, string | number | boolean>;

	let values = $state<Record<string, string | number | boolean>>(defaults());
	let lastKey = '';

	$effect(() => {
		const key = `${actionId}:${JSON.stringify(fields)}`;

		if (key !== lastKey) {
			lastKey = key;
			values = defaults();
		}
	});

	const submit = (event: SubmitEvent) => {
		event.preventDefault();
		onsubmit(values);
	};

	const inputClass =
		'h-10 w-full border border-white/10 bg-[#121212] px-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-indigo-500/50';
</script>

<form class="space-y-3" onsubmit={submit}>
	{#each fields as field (field.name)}
		<label class="block space-y-1.5">
			<span class="text-[11px] font-semibold tracking-wider text-white/50 uppercase">
				{field.label}
			</span>

			{#if field.type === 'textarea'}
				<textarea
					class="{inputClass} h-24 py-2"
					name={field.name}
					placeholder={field.placeholder}
					required={field.required}
					value={String(values[field.name] ?? '')}
					oninput={(event) => (values[field.name] = event.currentTarget.value)}
				></textarea>
			{:else if field.type === 'select'}
				<select
					class={inputClass}
					name={field.name}
					required={field.required}
					value={String(values[field.name] ?? '')}
					onchange={(event) => (values[field.name] = event.currentTarget.value)}
				>
					{#each field.options ?? [] as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			{:else if field.type === 'checkbox'}
				<span class="flex items-center gap-2 border border-white/10 bg-[#121212] px-3 py-2">
					<input
						type="checkbox"
						name={field.name}
						checked={Boolean(values[field.name])}
						onchange={(event) => (values[field.name] = event.currentTarget.checked)}
						class="size-3.5 accent-indigo-500"
					/>
					<span class="text-sm text-white/70">{field.placeholder ?? field.label}</span>
				</span>
			{:else}
				<input
					class={inputClass}
					type={field.type}
					name={field.name}
					placeholder={field.placeholder}
					required={field.required}
					value={String(values[field.name] ?? '')}
					oninput={(event) =>
						(values[field.name] =
							field.type === 'number'
								? Number(event.currentTarget.value)
								: event.currentTarget.value)}
				/>
			{/if}

			{#if field.help}
				<span class="block text-[11px] text-white/35">{field.help}</span>
			{/if}
		</label>
	{/each}

	<Button type="submit" disabled={busy} class="bg-indigo-500 text-white hover:bg-indigo-400">
		{busy ? 'Working...' : submitLabel}
	</Button>
</form>
