import { json } from '@sveltejs/kit';
import { serverEnv } from '#lib/server/config/env.ts';
import { ingestAfkProgress, type AfkIngestKind } from '#lib/server/afk/service.ts';
import { verifyInternalRequest } from '#lib/server/afk/token.ts';
import type { RequestHandler } from './$types';

const MAX_BODY_BYTES = 16 * 1024;

const KINDS = new Set<AfkIngestKind>([
	'start',
	'beat',
	'challenge-pass',
	'challenge-fail',
	'flag',
	'end'
]);

const noStore = {
	'cache-control': 'no-store, max-age=0',
	'content-type': 'application/json'
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

export const POST: RequestHandler = async ({ request }) => {
	const declaredLength = Number(request.headers.get('content-length') ?? 0);
	if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
		return json({ error: 'Request body is too large.' }, { status: 413, headers: noStore });
	}

	const raw = await request.text();
	if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
		return json({ error: 'Request body is too large.' }, { status: 413, headers: noStore });
	}

	const valid = verifyInternalRequest(
		serverEnv.BETTER_AUTH_SECRET,
		request.headers.get('x-afk-timestamp'),
		request.headers.get('x-afk-signature'),
		raw
	);

	if (!valid) {
		return json({ error: 'Invalid gateway signature.' }, { status: 401, headers: noStore });
	}

	let body: unknown;

	try {
		body = JSON.parse(raw);
	} catch {
		return json({ error: 'Invalid JSON.' }, { status: 400, headers: noStore });
	}

	if (!isRecord(body)) {
		return json({ error: 'Invalid payload.' }, { status: 400, headers: noStore });
	}

	const userId = body.userId;
	const sessionId = body.sessionId;
	const kind = body.kind;
	const seq = body.seq;

	if (
		typeof userId !== 'string' ||
		userId.length === 0 ||
		userId.length > 128 ||
		typeof sessionId !== 'string' ||
		sessionId.length === 0 ||
		sessionId.length > 128 ||
		typeof kind !== 'string' ||
		!KINDS.has(kind as AfkIngestKind) ||
		typeof seq !== 'number' ||
		!Number.isInteger(seq) ||
		seq < 0 ||
		seq > 1_000_000_000
	) {
		return json({ error: 'Invalid payload.' }, { status: 400, headers: noStore });
	}

	const seconds =
		typeof body.seconds === 'number' && Number.isFinite(body.seconds)
			? Math.max(0, Math.floor(body.seconds))
			: 0;

	const result = await ingestAfkProgress({
		userId,
		sessionId,
		kind: kind as AfkIngestKind,
		seq,
		seconds,
		ip: typeof body.ip === 'string' ? body.ip.slice(0, 128) : undefined,
		userAgent: typeof body.userAgent === 'string' ? body.userAgent.slice(0, 512) : undefined,
		meta: isRecord(body.meta) ? body.meta : undefined
	});

	return json(result, { headers: noStore });
};
