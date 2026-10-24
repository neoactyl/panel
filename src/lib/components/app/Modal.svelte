<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import IconX from '@tabler/icons-svelte/icons/x';

	let {
		open,
		title,
		description = '',
		onclose,
		children,
		footer,
		size = 'md'
	}: {
		open: boolean;
		title: string;
		description?: string;
		onclose: () => void;
		children: Snippet;
		footer?: Snippet;
		size?: 'md' | 'lg';
	} = $props();

	let dialog = $state<HTMLDivElement | null>(null);

	$effect(() => {
		if (!open) return;

		queueMicrotask(() => dialog?.focus());
	});

	const handleKeydown = (event: KeyboardEvent) => {
		if (open && event.key === 'Escape') onclose();
	};
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button
			type="button"
			aria-label="Close dialog"
			class="absolute inset-0 bg-black/70 backdrop-blur-sm"
			onclick={onclose}
			transition:fade={{ duration: 150 }}
		></button>

		<div
			bind:this={dialog}
			role="dialog"
			aria-modal="true"
			aria-label={title}
			tabindex="-1"
			class="relative w-full border border-white/10 bg-[#1a1a1a] shadow-2xl outline-none
				{size === 'lg' ? 'max-w-2xl' : 'max-w-md'}"
			transition:fly={{ y: 12, duration: 180 }}
		>
			<div class="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
				<div>
					<h2 class="text-sm font-bold text-white">{title}</h2>
					{#if description}
						<p class="mt-1 text-xs text-white/40">{description}</p>
					{/if}
				</div>
				<button
					type="button"
					onclick={onclose}
					aria-label="Close dialog"
					class="flex h-7 w-7 shrink-0 items-center justify-center text-white/40 transition hover:bg-white/5 hover:text-white"
				>
					<IconX class="h-4 w-4" />
				</button>
			</div>

			<div class="px-5 py-4">
				{@render children()}
			</div>

			{#if footer}
				<div class="flex items-center justify-end gap-2 border-t border-white/10 px-5 py-3">
					{@render footer()}
				</div>
			{/if}
		</div>
	</div>
{/if}
