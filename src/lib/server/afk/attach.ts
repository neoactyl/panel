import type { Server as HttpServer } from 'node:http';
import { attachAfkGateway } from './gateway.ts';
import { AFK_INGEST_PATH } from './token.ts';

/**
 * Shared by the Vite plugin (dev/preview) and the production Node entry. Keep
 * this module free of Vite and SvelteKit imports so both can load it.
 */

export type AfkLogger = Pick<Console, 'info' | 'error'>;

export type AfkAttachOptions = {
	/** Secret shared with the SvelteKit ingest endpoint. */
	secret: string | undefined;
	/** Overrides the URL the gateway uses for internal ingest calls. */
	internalUrl?: string;
	/** Public origins that may open the socket. */
	allowedOrigins?: Array<string | undefined | null>;
	/** Port used before the socket is listening, e.g. an auto-assigned one. */
	fallbackPort?: number;
	logger?: AfkLogger;
};

const attached = new WeakSet<HttpServer>();
const pending = new WeakSet<HttpServer>();

const DEFAULT_PORT = 3000;

export const resolveServerAddress = (server: HttpServer, fallbackPort?: number) => {
	const address = server.address();

	if (typeof address === 'object' && address !== null) {
		const host =
			address.address === '::1'
				? '[::1]'
				: address.address === '::' || address.address === '0.0.0.0'
					? address.family === 'IPv6'
						? '[::1]'
						: '127.0.0.1'
					: address.family === 'IPv6'
						? `[${address.address}]`
						: address.address;

		return { port: address.port, host };
	}

	// A string address means the server listens on a Unix socket; there is no
	// port to derive from it, so fall back to the configured one.
	return { port: fallbackPort ?? DEFAULT_PORT, host: '127.0.0.1' };
};

const localOrigins = (port: number) => [
	`http://localhost:${port}`,
	`http://127.0.0.1:${port}`,
	`https://localhost:${port}`,
	`https://127.0.0.1:${port}`
];

/**
 * Attaches the gateway once. Returns `true` when the socket is now handled by
 * this call (or was already attached) and `false` when it could not be set up.
 */
export const attachAfk = (server: HttpServer, options: AfkAttachOptions): boolean => {
	if (attached.has(server)) return true;

	const logger = options.logger ?? console;

	if (!options.secret) {
		logger.error(
			'[afk] BETTER_AUTH_SECRET is missing; the AFK WebSocket gateway was not started.'
		);
		return false;
	}

	const { port, host } = resolveServerAddress(server, options.fallbackPort);
	const internalUrl = options.internalUrl ?? `http://${host}:${port}${AFK_INGEST_PATH}`;
	const allowedOrigins = [
		...(options.allowedOrigins ?? []),
		...localOrigins(port)
	].filter((origin): origin is string => Boolean(origin));

	try {
		attachAfkGateway(server, {
			secret: options.secret,
			internalUrl,
			allowedOrigins
		});
		attached.add(server);
		logger.info(`[afk] WebSocket gateway listening on the same server (${internalUrl})`);
		return true;
	} catch (cause) {
		logger.error(
			`[afk] Unable to start the WebSocket gateway: ${cause instanceof Error ? cause.message : String(cause)}`,
			{ error: cause }
		);
		return false;
	}
};

/**
 * Waits for `listen()` so the socket's actual port (including an auto-assigned
 * one) is known before the internal ingest URL is built.
 */
export const attachAfkWhenListening = (
	server: HttpServer,
	options: AfkAttachOptions
): boolean => {
	if (server.listening) return attachAfk(server, options);
	if (pending.has(server)) return false;

	pending.add(server);
	server.once('listening', () => {
		pending.delete(server);
		attachAfk(server, options);
	});

	return false;
};
