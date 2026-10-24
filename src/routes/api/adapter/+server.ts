import { error, json } from '@sveltejs/kit';
import { AdapterError } from '#lib/adapter/sdk.ts';
import { getUserAdapter } from '#lib/server/panel/adapter.ts';
import { serverEnv } from '#lib/server/config/env.ts';
import type { RequestHandler } from './$types';

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const RATE_LIMIT = 180;
const RATE_WINDOW = 60_000;

const ALLOWED = new Set([
	'getServers',
	'getServer',
	'getNodes',
	'updateServer',
	'deleteServer',
	'suspendServer',
	'unsuspendServer',
	'listSoftwares',
	'listSoftwareGroups',
	'getSoftwareVariables',
	'startServer',
	'stopServer',
	'restartServer',
	'killServer',
	'reinstallServer',
	'sendCommand',
	'getConsole',
	'getResources',
	'runPanelAction',
	'listAllocations',
	'createAllocation',
	'deleteAllocation',
	'setPrimaryAllocation',
	'listBackups',
	'createBackup',
	'deleteBackup',
	'restoreBackup',
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

const buckets = new Map<string, { count: number; reset: number }>();

const allow = (userId: string) => {
	const now = Date.now();
	const bucket = buckets.get(userId);

	if (!bucket || bucket.reset <= now) {
		buckets.set(userId, { count: 1, reset: now + RATE_WINDOW });
		return true;
	}

	if (bucket.count >= RATE_LIMIT) return false;

	bucket.count += 1;
	return true;
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.session || !locals.user) {
		error(401, 'Unauthorized');
	}

	const origin = request.headers.get('origin');
	const allowedOrigins = new Set([new URL(request.url).origin, serverEnv.ORIGIN].filter(Boolean));

	if (origin && !allowedOrigins.has(origin)) {
		error(403, 'Cross-origin request blocked');
	}

	if (request.headers.get('sec-fetch-site') === 'cross-site') {
		error(403, 'Cross-site request blocked');
	}

	const contentLength = Number(request.headers.get('content-length') ?? 0);
	if (contentLength > MAX_BODY_BYTES) {
		error(413, 'Request body is too large');
	}

	if (!allow(locals.user.id)) {
		error(429, 'Too many panel requests. Try again shortly.');
	}

	const body = (await request.json().catch(() => null)) as
		| { method?: string; args?: unknown[] }
		| null;

	const method = body?.method;

	if (!method || !ALLOWED.has(method)) {
		error(400, 'Unknown adapter method');
	}

	if (body?.args !== undefined && !Array.isArray(body.args)) {
		error(400, 'Invalid adapter arguments');
	}

	const adapter = getUserAdapter(locals.panelUserId);
	const target = adapter as unknown as Record<string, (...args: unknown[]) => unknown>;

	try {
		const result = await target[method](...(body?.args ?? []));
		return json(result ?? null);
	} catch (cause) {
		if (cause instanceof AdapterError) {
			const status =
				cause.code === 'NOT_FOUND'
					? 404
					: cause.code === 'UNAUTHORIZED'
						? 403
						: cause.code === 'RATE_LIMITED'
							? 429
							: 400;

			return json({ message: cause.message, code: cause.code }, { status });
		}

		console.error('Adapter request failed', cause);
		return json({ message: 'Panel request failed', code: 'UNKNOWN' }, { status: 500 });
	}
};
