import type { PanelPrompt } from '#lib/adapter/sdk.ts';

let prompts = $state<PanelPrompt[]>([]);

const dismissed = new Set<string>();

export const panelPrompts = {
	get all() {
		return prompts;
	},
	push(...items: PanelPrompt[]) {
		for (const item of items) {
			if (!item || dismissed.has(item.id) || prompts.some((prompt) => prompt.id === item.id)) {
				continue;
			}

			prompts = [...prompts, item];
		}
	},
	dismiss(id: string) {
		dismissed.add(id);
		prompts = prompts.filter((prompt) => prompt.id !== id);
	},
	clear() {
		prompts = [];
	}
};
