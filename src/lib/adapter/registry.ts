/**
 * Shared panel adapter metadata.
 *
 * Keep this file free of server-only imports so both server loads and client
 * components can use it to render the adapter list.
 *
 * To add a new adapter:
 *   1. Add an entry to `PANEL_ADAPTERS` below.
 *   2. Add the matching case to `createPanelAdapter` in
 *      `src/lib/server/panel/adapters.ts`.
 */
export type PanelAdapterDefinition = {
	id: string;
	label: string;
	description: string;
	requiresUrl: boolean;
	requiresToken: boolean;
	/** Whether the adapter needs a second token for server-scoped (client) API calls. */
	requiresClientToken: boolean;
};

export const PANEL_ADAPTERS = [
	{
		id: 'mock',
		label: 'Mock',
		description: 'Built-in demo panel with sample servers. No credentials required.',
		requiresUrl: false,
		requiresToken: false,
		requiresClientToken: false
	},
	{
		id: 'calagopus',
		label: 'Calagopus',
		description: 'Communicate with a Calagopus panel over its HTTP API.',
		requiresUrl: true,
		requiresToken: true,
		requiresClientToken: false
	},
	{
		id: 'pterodactyl',
		label: 'Pterodactyl',
		description:
			'Communicate with a Pterodactyl panel using an Application API key and, optionally, a Client API key.',
		requiresUrl: true,
		requiresToken: true,
		requiresClientToken: true
	}
] as const satisfies readonly PanelAdapterDefinition[];

export type PanelAdapterId = (typeof PANEL_ADAPTERS)[number]['id'];

export const DEFAULT_PANEL_ADAPTER: PanelAdapterId = 'mock';

export const PANEL_ADAPTER_IDS = PANEL_ADAPTERS.map(
	(adapter) => adapter.id
) as [PanelAdapterId, ...PanelAdapterId[]];

export const findPanelAdapter = (
	id: string
): (typeof PANEL_ADAPTERS)[number] | undefined =>
	PANEL_ADAPTERS.find((adapter) => adapter.id === id);

export const isPanelAdapterId = (id: string): id is PanelAdapterId =>
	PANEL_ADAPTERS.some((adapter) => adapter.id === id);
