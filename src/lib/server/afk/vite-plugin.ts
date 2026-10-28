import type { Server as HttpServer } from 'node:http';
import { loadEnv, type Plugin, type PreviewServer, type ViteDevServer } from 'vite';
import { attachAfkGateway } from './gateway.ts';

const attached = new WeakSet<HttpServer>();
const pending = new WeakSet<HttpServer>();

const resolveAddress = (server: HttpServer, fallbackPort?: number) => {
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

	return { port: fallbackPort ?? 5173, host: '127.0.0.1' };
};

const attach = (
	server: HttpServer,
	mode: string,
	logger: ViteDevServer['config']['logger'],
	configuredPort?: number
) => {
	if (attached.has(server)) return;

	const env = loadEnv(mode, process.cwd(), '');
	const secret = process.env.BETTER_AUTH_SECRET ?? env.BETTER_AUTH_SECRET;

	if (!secret) {
		logger.error(
			'[afk] BETTER_AUTH_SECRET is missing; the AFK WebSocket gateway was not started.'
		);
		return;
	}

	const { port, host } = resolveAddress(server, configuredPort);
	const internalUrl =
		process.env.AFK_INTERNAL_URL ??
		env.AFK_INTERNAL_URL ??
		`http://${host}:${port}/api/afk/internal/ingest`;
	const allowedOrigins = [
		env.ORIGIN,
		`http://localhost:${port}`,
		`http://127.0.0.1:${port}`,
		`https://localhost:${port}`,
		`https://127.0.0.1:${port}`
	].filter((origin): origin is string => Boolean(origin));

	try {
		attachAfkGateway(server, {
			secret,
			internalUrl,
			allowedOrigins
		});
		attached.add(server);
		logger.info(`[afk] WebSocket gateway listening on the same server (${internalUrl})`);
	} catch (cause) {
		logger.error(
			`[afk] Unable to start the WebSocket gateway: ${cause instanceof Error ? cause.message : String(cause)}`,
			{ error: cause instanceof Error ? cause : undefined }
		);
	}
};

/**
 * Waits for `listen()` so the socket's actual port (including an auto-assigned
 * one) is known before the internal ingest URL is built.
 */
const attachWhenListening = (
	server: HttpServer,
	mode: string,
	logger: ViteDevServer['config']['logger'],
	configuredPort?: number
) => {
	if (server.listening) {
		attach(server, mode, logger, configuredPort);
		return;
	}

	if (pending.has(server)) return;

	pending.add(server);
	server.once('listening', () => {
		pending.delete(server);
		attach(server, mode, logger, configuredPort);
	});
};

/**
 * Runs the AFK transport inside Vite's HTTP server.
 */
export const afkWebSocketPlugin = (): Plugin => ({
	name: 'neoactyl-afk-websocket',
	configureServer(server: ViteDevServer) {
		const httpServer = server.httpServer;
		if (!httpServer) return;

		attachWhenListening(
			httpServer as unknown as HttpServer,
			server.config.mode,
			server.config.logger,
			server.config.server.port
		);
	},
	configurePreviewServer(server: PreviewServer) {
		const httpServer = server.httpServer;
		if (!httpServer) return;

		attachWhenListening(
			httpServer as unknown as HttpServer,
			server.config.mode,
			server.config.logger,
			server.config.preview.port
		);
	}
});
