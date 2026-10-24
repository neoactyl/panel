<script lang="ts">
	import { goto } from '$app/navigation';
	import { adapter } from '#lib/adapter/client.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	import { panelPrompts } from './prompts.svelte.ts';
	import { handlePanelResult } from './runtime.ts';

	let busy = $state(false);
	let error = $state('');
	let activeId = '';

	const prompt = $derived(panelPrompts.all[0]);

	$effect(() => {
		const id = prompt?.id ?? '';

		if (id !== activeId) {
			activeId = id;
			busy = false;
			error = '';
		}
	});

	const toneClass: Record<string, string> = {
		info: 'border-indigo-500/40',
		warning: 'border-amber-500/40',
		danger: 'border-red-500/40'
	};

	const confirm = async () => {
		if (!prompt || busy) return;

		if (prompt.href) {
			if (prompt.external) {
				window.open(prompt.href, '_blank', 'noopener,noreferrer');
			} else {
				await goto(prompt.href);
			}

			panelPrompts.dismiss(prompt.id);
			return;
		}

		if (!prompt.actionId) {
			panelPrompts.dismiss(prompt.id);
			return;
		}

		busy = true;
		error = '';

		try {
			const result = await adapter.runPanelAction({
				scope: prompt.scope,
				serverId: prompt.serverId,
				promptId: prompt.id,
				actionId: prompt.actionId
			});

			panelPrompts.dismiss(prompt.id);
			await handlePanelResult(result);
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Action failed.';
		} finally {
			busy = false;
		}
	};

	const cancel = () => {
		if (!prompt || prompt.dismissible === false) return;
		panelPrompts.dismiss(prompt.id);
	};
</script>

{#if prompt}
	<div
		class="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
		role="dialog"
		aria-modal="true"
		aria-labelledby="panel-prompt-title"
	>
		<div
			class="w-full max-w-md border bg-[#1a1a1a] p-5 shadow-2xl {toneClass[prompt.tone ?? 'info']}"
		>
			<h2 id="panel-prompt-title" class="text-base font-bold text-white">{prompt.title}</h2>
			<p class="mt-2 text-sm leading-relaxed whitespace-pre-line text-white/60">
				{prompt.message}
				{#if prompt.link}
					<a
						href={prompt.link.href}
						target="_blank"
						rel="noreferrer"
						class="text-indigo-300 underline underline-offset-2 hover:text-indigo-200"
					>
						{prompt.link.label}
					</a>
				{/if}
			</p>

			{#if error}
				<p class="mt-3 border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
					{error}
				</p>
			{/if}

			<div class="mt-4 flex justify-end gap-2">
				{#if prompt.dismissible !== false}
					<Button
						type="button"
						variant="outline"
						disabled={busy}
						onclick={cancel}
						class="normal-case tracking-normal"
					>
						{prompt.cancelLabel ?? 'Cancel'}
					</Button>
				{/if}
				<Button
					type="button"
					disabled={busy}
					onclick={confirm}
					class="bg-indigo-500 text-white hover:bg-indigo-400"
				>
					{busy ? 'Working...' : (prompt.confirmLabel ?? 'Continue')}
				</Button>
			</div>
		</div>
	</div>
{/if}
