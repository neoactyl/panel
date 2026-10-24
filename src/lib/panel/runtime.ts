import { goto, invalidateAll } from '$app/navigation';
import type { PanelActionResult } from '#lib/adapter/sdk.ts';
import { feedback } from './feedback.svelte.ts';
import { panelPrompts } from './prompts.svelte.ts';

export const handlePanelResult = async (result?: PanelActionResult | null) => {
	if (!result) return;

	if (result.prompts?.length) panelPrompts.push(...result.prompts);
	if (result.prompt) panelPrompts.push(result.prompt);
	if (result.message) feedback.show(result.message);

	if (result.redirect) {
		if (result.external) {
			window.open(result.redirect, '_blank', 'noopener,noreferrer');
		} else {
			await goto(result.redirect);
		}
	} else if (result.refresh) {
		await invalidateAll();
	}
};
