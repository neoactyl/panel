import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Stateless tokens shared by the SvelteKit app and the in-process WebSocket
 * gateway. They are intentionally free of SvelteKit imports so the gateway can
 * be loaded from `vite.config.ts` as well as from a production Node entry.
 */

const TICKET_VERSION = 1;

export const AFK_WS_PATH = '/api/afk/ws';
export const AFK_INGEST_PATH = '/api/afk/internal/ingest';

export type AfkTicket = {
	v: typeof TICKET_VERSION;
	/** User id. */
	uid: string;
	/** Random session id, unique per issued ticket. */
	sid: string;
	/** Issued at (epoch milliseconds). */
	iat: number;
	/** Expires at (epoch milliseconds). */
	exp: number;
	/** Single-use nonce tracked by the gateway. */
	nonce: string;
	/** Optional hashed client address and user agent bindings. */
	iph?: string;
	uah?: string;
};

const key = (secret: string, purpose: string) =>
	createHmac('sha256', secret).update(`neoactyl:afk:${purpose}`).digest();

const encode = (value: string) => Buffer.from(value, 'utf8').toString('base64url');

const decode = (value: string) => Buffer.from(value, 'base64url').toString('utf8');

const safeEqual = (left: string, right: string) => {
	const a = Buffer.from(left, 'utf8');
	const b = Buffer.from(right, 'utf8');

	if (a.length !== b.length) return false;

	return timingSafeEqual(a, b);
};

export const hashClientAddress = (address: string) =>
	createHash('sha256').update(address.trim().toLowerCase()).digest('base64url');

export const hashUserAgent = (userAgent: string) =>
	createHash('sha256').update(userAgent.trim()).digest('base64url');

export const signAfkTicket = (secret: string, ticket: AfkTicket): string => {
	const payload = encode(JSON.stringify(ticket));
	const signature = createHmac('sha256', key(secret, 'ticket')).update(payload).digest('base64url');

	return `${payload}.${signature}`;
};

export const verifyAfkTicket = (secret: string, token: string): AfkTicket | null => {
	const [payload, signature, extra] = token.split('.');

	if (!payload || !signature || extra !== undefined || payload.length > 4096) return null;

	const expected = createHmac('sha256', key(secret, 'ticket')).update(payload).digest('base64url');

	if (!safeEqual(signature, expected)) return null;

	let parsed: unknown;

	try {
		parsed = JSON.parse(decode(payload));
	} catch {
		return null;
	}

	if (typeof parsed !== 'object' || parsed === null) return null;

	const candidate = parsed as Partial<AfkTicket>;

	if (
		candidate.v !== TICKET_VERSION ||
		typeof candidate.uid !== 'string' ||
		candidate.uid.length === 0 ||
		candidate.uid.length > 128 ||
		typeof candidate.sid !== 'string' ||
		candidate.sid.length === 0 ||
		candidate.sid.length > 128 ||
		typeof candidate.iat !== 'number' ||
		typeof candidate.exp !== 'number' ||
		typeof candidate.nonce !== 'string' ||
		candidate.nonce.length < 16 ||
		candidate.exp <= candidate.iat
	) {
		return null;
	}

	if (candidate.exp < Date.now()) return null;

	return candidate as AfkTicket;
};

export type InternalSignature = {
	timestamp: number;
	signature: string;
};

export const signInternalRequest = (
	secret: string,
	timestamp: number,
	body: string
): InternalSignature => ({
	timestamp,
	signature: createHmac('sha256', key(secret, 'internal'))
		.update(`${timestamp}.${body}`)
		.digest('base64url')
});

export const verifyInternalRequest = (
	secret: string,
	timestamp: string | null,
	signature: string | null,
	body: string
): boolean => {
	if (!timestamp || !signature) return false;

	const issued = Number(timestamp);

	if (!Number.isFinite(issued) || Math.abs(Date.now() - issued) > 60_000) return false;

	const expected = createHmac('sha256', key(secret, 'internal'))
		.update(`${timestamp}.${body}`)
		.digest('base64url');

	return safeEqual(signature, expected);
};
