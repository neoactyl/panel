import type { Adapter } from '#lib/adapter/sdk.ts';
import type { PanelAdapterId } from '#lib/adapter/registry.ts';
import { Calagopus } from './calagopus.ts';
import { MockAdapter } from './mock.ts';
import { Pterodactyl } from './pterodactyl.ts';

export type PanelAdapterConfig = {
	url: string;
	token: string;
	clientToken?: string;
};

/**
 * Instantiate a panel adapter.
 *
 * The `switch` is exhaustive over `PanelAdapterId`, so adding an entry to
 * `PANEL_ADAPTERS` without adding a case here is a type error.
 */
export const createPanelAdapter = (
	id: PanelAdapterId,
	config: PanelAdapterConfig
): Adapter => {
	switch (id) {
		case 'mock':
			return new MockAdapter();
		case 'calagopus':
			return new Calagopus(config.url, config.token);
		case 'pterodactyl':
			return new Pterodactyl(config.url, config.token, config.clientToken);
		default: {
			const unknown: never = id;
			throw new Error(`Unsupported panel adapter: ${String(unknown)}`);
		}
	}
};
