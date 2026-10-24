<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import IconArrowLeft from '@tabler/icons-svelte/icons/arrow-left';
	import type { SuperForm } from 'sveltekit-superforms';
	import type { SoftwarePolicyFields } from '#lib/schemas.ts';

	let {
		title,
		description,
		cancelHref = '/admin/software',
		submitLabel = 'Save settings',
		sf,
		children
	}: {
		title: string;
		description: string;
		cancelHref?: string;
		submitLabel?: string;
		sf: SuperForm<SoftwarePolicyFields>;
		children?: Snippet;
	} = $props();

	const { form: fields, enhance, errors, message, submitting } = sf;

	const limitInput =
		'mt-1 w-full border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50';
	const overrideInput =
		'mt-1 w-full border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50';
</script>

<div class="space-y-5">
	<a
		href={cancelHref}
		class="inline-flex items-center gap-2 text-xs font-semibold text-white/50 transition hover:text-white"
	>
		<IconArrowLeft class="h-3.5 w-3.5" />
		Back to software
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
		<div>
			<h2 class="text-sm font-bold text-white">{title}</h2>
			<p class="mt-1 text-xs text-white/40">{description}</p>
		</div>

		<div class="mt-4 flex flex-wrap gap-5">
			<label class="flex items-center gap-2 text-xs text-white/60">
				<Checkbox bind:checked={$fields.visible} />
				Visible to users
			</label>
		</div>

		<div class="mt-5">
			<p class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">
				Resource limits
			</p>
			<p class="mt-1 text-xs text-white/30">Leave a field blank for no bound.</p>

			<div class="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				<label class="block">
					<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">Minimum CPU %</span>
					<input name="minCpu" type="number" min="0" bind:value={$fields.minCpu} class={limitInput} />
					{#if $errors.minCpu}
						<span class="mt-1 block text-xs text-red-300">{$errors.minCpu.join(' ')}</span>
					{/if}
				</label>
				<label class="block">
					<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">Maximum CPU %</span>
					<input name="maxCpu" type="number" min="0" bind:value={$fields.maxCpu} class={limitInput} />
					{#if $errors.maxCpu}
						<span class="mt-1 block text-xs text-red-300">{$errors.maxCpu.join(' ')}</span>
					{/if}
				</label>
				<label class="block">
					<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">Minimum RAM MB</span>
					<input name="minMemory" type="number" min="0" bind:value={$fields.minMemory} class={limitInput} />
					{#if $errors.minMemory}
						<span class="mt-1 block text-xs text-red-300">{$errors.minMemory.join(' ')}</span>
					{/if}
				</label>
				<label class="block">
					<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">Maximum RAM MB</span>
					<input name="maxMemory" type="number" min="0" bind:value={$fields.maxMemory} class={limitInput} />
					{#if $errors.maxMemory}
						<span class="mt-1 block text-xs text-red-300">{$errors.maxMemory.join(' ')}</span>
					{/if}
				</label>
				<label class="block">
					<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">Minimum disk MB</span>
					<input name="minDisk" type="number" min="0" bind:value={$fields.minDisk} class={limitInput} />
					{#if $errors.minDisk}
						<span class="mt-1 block text-xs text-red-300">{$errors.minDisk.join(' ')}</span>
					{/if}
				</label>
				<label class="block">
					<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">Maximum disk MB</span>
					<input name="maxDisk" type="number" min="0" bind:value={$fields.maxDisk} class={limitInput} />
					{#if $errors.maxDisk}
						<span class="mt-1 block text-xs text-red-300">{$errors.maxDisk.join(' ')}</span>
					{/if}
				</label>
			</div>
		</div>

		<div class="mt-5 border-t border-white/10 pt-5">
			<p class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">
				Deployment overrides
			</p>
			<p class="mt-1 text-xs text-white/30">
				Optional. Overrides the egg's Docker image, startup command and environment when the panel
				creates a server.
			</p>

			<div class="mt-3 grid gap-4 sm:grid-cols-2">
				<label class="block">
					<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">Docker image</span>
					<input
						name="dockerImage"
						bind:value={$fields.dockerImage}
						placeholder="e.g. ghcr.io/pterodactyl/yolks:java_21"
						class={overrideInput}
					/>
				</label>
				<label class="block">
					<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">Startup command</span>
					<input
						name="startupCommand"
						bind:value={$fields.startupCommand}
						placeholder={'java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}'}
						class={overrideInput}
					/>
				</label>
			</div>

			<label class="mt-4 block">
				<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">
					Default environment
				</span>
				<textarea
					name="environment"
					rows="5"
					bind:value={$fields.environment}
					placeholder="SERVER_JARFILE=server.jar&#10;MC_VERSION=latest"
					class="mt-1 w-full border border-white/10 bg-[#121212] px-3 py-2 font-mono text-xs text-white outline-none focus:border-indigo-500/50"
				></textarea>
				<span class="mt-1 block text-[10px] text-white/30">
					One KEY=value per line. Inline comments (#) and blank lines are ignored.
				</span>
			</label>
		</div>

		{#if children}
			<div class="mt-5 border-t border-white/10 pt-5">
				{@render children()}
			</div>
		{/if}

		<div class="mt-5 flex flex-wrap gap-2">
			<button
				type="submit"
				disabled={$submitting}
				class="border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-sm font-semibold text-indigo-200 transition hover:bg-indigo-500/20"
			>
				{submitLabel}
			</button>
			<a
				href={cancelHref}
				class="border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/60 transition hover:bg-white/10"
			>
				Cancel
			</a>
		</div>
	</form>
</div>
