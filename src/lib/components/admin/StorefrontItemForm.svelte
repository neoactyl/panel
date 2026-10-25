<script lang="ts">
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import IconArrowLeft from '@tabler/icons-svelte/icons/arrow-left';
	import IconPlus from '@tabler/icons-svelte/icons/plus';
	import type { SuperForm } from 'sveltekit-superforms';
	import type { StorefrontItemFields } from '#lib/schemas.ts';
	import { Button } from '#lib/components/ui/button/index.js';

	let {
    nodes,
    groups,
    software,
    sf,
    isEditing = false
	}: {
    nodes: { id: string; name: string }[];
    groups: { id: number; name: string }[];
    software: { id: number; name: string; groupId: number }[];
    sf: SuperForm<StorefrontItemFields>;
    isEditing?: boolean;
	} = $props();

	const { form: fields, enhance, message, submitting } = sf;

	const availableSoftware = $derived(
		$fields.softwareGroup
			? software.filter((egg) => egg.groupId === Number($fields.softwareGroup))
			: software
	);

	const inputClass =
		'mt-1 w-full border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50';
</script>

<div class="space-y-5">
	<a
		href="/admin/storefront"
		class="inline-flex items-center gap-2 text-xs font-semibold text-white/50 transition hover:text-white"
	>
		<IconArrowLeft class="h-3.5 w-3.5" />
		Back to storefront
	</a>

	{#if $message && typeof $message !== 'string'}
		<div
			class="border px-3 py-2 text-sm {$message.status === 'error'
				? 'border-red-500/30 bg-red-500/10 text-red-200'
				: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}"
		>
			{$message.text}
		</div>
	{/if}

	<form method="POST" action="?/save" use:enhance class="border border-white/10 bg-[#1a1a1a] p-5">
		<div class="flex items-center gap-2">
			<IconPlus class="h-4 w-4 text-white/30" />
			<h2 class="text-sm font-bold text-white">
				{isEditing ? `Edit ${$fields.name}` : 'New storefront item'}
			</h2>
		</div>

		<div class="mt-4 grid gap-4 sm:grid-cols-2">
			<label class="block">
				<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">Name</span>
				<input name="name" bind:value={$fields.name} required maxlength="80" class={inputClass} />
			</label>
			<label class="block">
				<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">Icon</span>
				<input name="icon" bind:value={$fields.icon} maxlength="50" class={inputClass} />
			</label>
		</div>

		<label class="mt-4 block">
			<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">Description</span>
			<textarea name="description" bind:value={$fields.description} rows="2" maxlength="500" class="mt-1 w-full resize-y border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"></textarea>
		</label>

		<div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<label class="block">
				<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">Kind</span>
				<select bind:value={$fields.kind} name="kind" class={inputClass}>
					<option value="server">Full server</option>
					<option value="resource">Resource upgrade</option>
				</select>
			</label>
			<label class="block">
				<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">Price</span>
				<input name="price" type="number" min="0" bind:value={$fields.price} class={inputClass} />
			</label>
			{#if $fields.kind === 'server'}
				<label class="block">
					<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">
						Renewal price
					</span>
					<input
						name="renewalPrice"
						type="number"
						min="0"
						bind:value={$fields.renewalPrice}
						class={inputClass}
					/>
				</label>
			{/if}
			{#if $fields.kind === 'server'}
				<label class="block">
					<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">Renewal interval (days)</span>
					<input
						name="durationDays"
						type="number"
						min="1"
						bind:value={$fields.durationDays}
						class={inputClass}
					/>
				</label>
			{/if}
		</div>

		<div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<label class="block">
				<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">
					{$fields.kind === 'resource' ? 'CPU added' : 'CPU %'}
				</span>
				<input
					name="cpu"
					type="number"
					min={$fields.kind === 'resource' ? 0 : 1}
					required
					bind:value={$fields.cpu}
					class={inputClass}
				/>
			</label>
			<label class="block">
				<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">
					{$fields.kind === 'resource' ? 'Memory added MB' : 'Memory MB'}
				</span>
				<input
					name="memory"
					type="number"
					min={$fields.kind === 'resource' ? 0 : 1}
					required
					bind:value={$fields.memory}
					class={inputClass}
				/>
			</label>
			<label class="block">
				<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">
					{$fields.kind === 'resource' ? 'Disk added MB' : 'Disk MB'}
				</span>
				<input
					name="disk"
					type="number"
					min={$fields.kind === 'resource' ? 0 : 1}
					required
					bind:value={$fields.disk}
					class={inputClass}
				/>
			</label>
			<label class="block">
				<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">Sort order</span>
				<input name="sortOrder" type="number" min="0" bind:value={$fields.sortOrder} class={inputClass} />
			</label>
		</div>

		{#if $fields.kind === 'server'}
			<div class="mt-4 grid gap-4 sm:grid-cols-3">
				<label class="block">
					<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">Node</span>
					<select name="node" bind:value={$fields.node} class={inputClass}>
						<option value="">First available</option>
						{#each nodes as node (node.id)}
							<option value={node.id}>{node.name}</option>
						{/each}
					</select>
				</label>
				<label class="block">
					<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">Nest</span>
					<select name="softwareGroup" bind:value={$fields.softwareGroup} class={inputClass}>
						<option value="">First available</option>
						{#each groups as group (group.id)}
							<option value={String(group.id)}>{group.name}</option>
						{/each}
					</select>
				</label>
				<label class="block">
					<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">Egg</span>
					<select name="software" bind:value={$fields.software} class={inputClass}>
						<option value="">First available</option>
						{#each availableSoftware as egg (egg.id)}
							<option value={String(egg.id)}>{egg.name}</option>
						{/each}
					</select>
				</label>
			</div>
		{/if}

		<div class="mt-4 grid gap-4 sm:grid-cols-2">
			<label class="block">
				<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">After claim</span>
				<select name="successMode" bind:value={$fields.successMode} class={inputClass}>
					<option value="console">Open the server console</option>
					<option value="redirect">Redirect to a URL</option>
					<option value="message">Show a success message</option>
				</select>
			</label>
			<label class="block">
				<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">Redirect URL</span>
				<input
					name="successUrl"
					bind:value={$fields.successUrl}
					placeholder={'/server/{serverId}'}
					maxlength="500"
					class={inputClass}
				/>
			</label>
		</div>

		<label class="mt-4 block">
			<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">Success message</span>
			<textarea name="successMessage" bind:value={$fields.successMessage} rows="2" maxlength="500" class="mt-1 w-full resize-y border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"></textarea>
		</label>

		<div class="mt-4 flex flex-wrap gap-5">
			<label class="flex items-center gap-2 text-xs text-white/60">
				<Checkbox name="enabled" bind:checked={$fields.enabled} />
				Enabled
			</label>
			<label class="flex items-center gap-2 text-xs text-white/60">
				<Checkbox name="oncePerUser" bind:checked={$fields.oncePerUser} />
				Once per user
			</label>
			<label class="flex items-center gap-2 text-xs text-white/60">
				<Checkbox name="stackable" bind:checked={$fields.stackable} />
				Stackable
			</label>
			{#if $fields.kind === 'server'}
				<label class="flex items-center gap-2 text-xs text-white/60">
					<Checkbox name="renewable" bind:checked={$fields.renewable} />
					Renewable
				</label>
				<label class="flex items-center gap-2 text-xs text-white/60">
					<Checkbox name="removable" bind:checked={$fields.removable} />
					Removable
				</label>
			{/if}
		</div>

		<div class="mt-5 flex flex-wrap gap-2">
			<Button
				type="submit"
				disabled={$submitting}
			>
				{isEditing ? 'Save item' : 'Create item'}
			</Button>
			<a
				href="/admin/storefront"
				class="border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/60 transition hover:bg-white/10"
			>
				Cancel
			</a>
		</div>
	</form>
</div>
