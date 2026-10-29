import { error } from '@sveltejs/kit';
import {
	AdapterError,
	assertAdapterContract,
	type Adapter,
	type CreateServer,
	type PanelActionRequest,
	type PanelScope
} from '#lib/adapter/sdk.ts';
import { logActivity } from '#lib/server/system/logs.ts';
import { getPanelConfig } from '#lib/server/config/settings.ts';
import { Calagopus } from './calagopus.ts';
import { MockAdapter } from './mock.ts';

let adapter: Adapter | undefined;
let guarded: Adapter | undefined;

export const resetAdapter = () => {
	adapter = undefined;
	guarded = undefined;
};

const rawAdapter = (): Adapter => {
	if (!adapter) {
		const { adapter: kind, url, token } = getPanelConfig();

		adapter = assertAdapterContract(
			kind === 'calagopus' && url && token ? new Calagopus(url, token) : new MockAdapter()
		);
	}

	return adapter;
};

const severityFor = (cause: AdapterError) =>
	cause.code === 'UNAUTHORIZED' || cause.code === 'NOT_FOUND' || cause.code === 'VALIDATION'
		? 'warning'
		: 'error';

const normalizeFailure = (method: string, cause: unknown): AdapterError => {
	const normalized =
		cause instanceof AdapterError
			? cause
			: new AdapterError(
					'The panel request failed. Please try again.',
					'UNKNOWN',
					502
				);

	logActivity({
		action: 'adapter.failure',
		severity: severityFor(normalized),
		message: `Panel adapter ${method} failed: ${cause instanceof Error ? cause.message : String(cause)}`,
		metadata: {
			method,
			code: normalized.code,
			statusCode: normalized.statusCode
		}
	});

	return normalized;
};

const guardedAdapters = new WeakMap<Adapter, Adapter>();

const guardAdapter = (base: Adapter): Adapter => {
	const cached = guardedAdapters.get(base);
	if (cached) return cached;

	const wrapped = new Proxy(base, {
		get(target, property, receiver) {
			const value = Reflect.get(target, property, receiver);

			if (typeof value !== 'function' || typeof property !== 'string') return value;

			return function guardedMethod(this: unknown, ...args: unknown[]) {
				try {
					const result = value.apply(target, args);

					if (result && typeof (result as Promise<unknown>).then === 'function') {
						return (result as Promise<unknown>).catch((cause) => {
							throw normalizeFailure(property, cause);
						});
					}

					return result;
				} catch (cause) {
					throw normalizeFailure(property, cause);
				}
			};
		}
	}) as Adapter;

	guardedAdapters.set(base, wrapped);
	return wrapped;
};

export const getAdapter = (): Adapter => {
	if (!guarded) guarded = guardAdapter(rawAdapter());

	return guarded;
};

const SERVER_METHODS = new Set([
	'getServer',
	'updateServer',
	'deleteServer',
	'suspendServer',
	'unsuspendServer',
	'startServer',
	'stopServer',
	'restartServer',
	'killServer',
	'reinstallServer',
	'sendCommand',
	'getConsole',
	'getResources',
	'getWebsocket',
	'listAllocations',
	'createAllocation',
	'deleteAllocation',
	'setPrimaryAllocation',
	'listBackups',
	'createBackup',
	'deleteBackup',
	'restoreBackup',
	'getBackupDownloadUrl',
	'getFileDownloadUrl',
	'listDatabases',
	'createDatabase',
	'deleteDatabase',
	'listSchedules',
	'createSchedule',
	'updateSchedule',
	'deleteSchedule',
	'getStartup',
	'updateStartup',
	'listSubusers',
	'createSubuser',
	'updateSubuser',
	'deleteSubuser',
	'listActivities',
	'getFileSystem',
	'listFiles',
	'readFile',
	'writeFile',
	'createFile',
	'createDirectory',
	'deleteFiles',
	'renameFile',
	'copyFile',
	'compressFiles',
	'decompressFile',
	'uploadFiles',
	'downloadToServer'
]);

const ownership = new Map<string, { owner: string | null; expires: number }>();

const ownedAdapter = (target: Calagopus, panelUserId: string): Adapter => {
	const ensureOwned = async (serverId: string) => {
		const cached = ownership.get(serverId);
		let owner: string | null;

		if (cached && cached.expires > Date.now()) {
			owner = cached.owner;
		} else {
			owner = await target.getServerOwner(serverId);
			ownership.set(serverId, { owner, expires: Date.now() + 15_000 });
		}

		if (owner !== panelUserId) {
			throw new AdapterError('Server not found', 'NOT_FOUND', 404);
		}
	};

	return new Proxy(target, {
		get(base, property, receiver) {
			const value = Reflect.get(base, property, receiver);

			if (property === 'getServers') {
				return async () => base.getServers(panelUserId);
			}

			if (property === 'createServer') {
				return async (input: CreateServer) => {
					const server = await base.createServer({ ...input, ownerId: panelUserId });
					ownership.set(server.id, { owner: panelUserId, expires: Date.now() + 15_000 });
					return server;
				};
			}

			if (property === 'deleteServer') {
				return async (serverId: string) => {
					await ensureOwned(serverId);
					await base.deleteServer(serverId);
					ownership.delete(serverId);
				};
			}

			if (property === 'getPanelBlueprint') {
				return async (scope: PanelScope, serverId?: string) => {
					if (scope === 'server' && serverId) await ensureOwned(serverId);
					return base.getPanelBlueprint(scope, serverId);
				};
			}

			if (property === 'getPanelPrompts') {
				return async (scope: PanelScope, serverId?: string, context?: { output?: string }) => {
					if (scope === 'server' && serverId) await ensureOwned(serverId);
					return base.getPanelPrompts(scope, serverId, context);
				};
			}

			if (property === 'runPanelAction') {
				return async (request: PanelActionRequest) => {
					if (request.scope === 'server' && request.serverId) {
						await ensureOwned(request.serverId);
					}

					return base.runPanelAction(request);
				};
			}

			if (typeof property === 'string' && SERVER_METHODS.has(property) && typeof value === 'function') {
				return async (serverId: string, ...args: unknown[]) => {
					await ensureOwned(serverId);
					return value.apply(base, [serverId, ...args]);
				};
			}

			return typeof value === 'function' ? value.bind(base) : value;
		}
	}) as Adapter;
};

export const getAdapterForUser = (panelUserId: string): Adapter => {
	const base = rawAdapter();

	return base instanceof Calagopus
		? guardAdapter(ownedAdapter(base, panelUserId))
		: guardAdapter(base);
};

export const getUserAdapter = (panelUserId?: string): Adapter => {
	const base = getAdapter();

	// Adapters with panel accounts must always scope server access to the
	// linked panel user. The `panel.linkAccounts` setting only controls
	// automatic linking during login; it must never make every user share the
	// admin token and therefore control each other's servers.
	if (!base.capabilities.accounts.link) return base;

	if (!panelUserId) {
		error(403, {
			message: 'Your account is not linked to a panel account.'
		});
	}

	return getAdapterForUser(panelUserId);
};
