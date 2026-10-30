import type { Server as HttpServer } from 'node:http';
import { loadEnv, type Plugin, type PreviewServer, type ViteDevServer } from 'vite';
import { attachAfkWhenListening } from './attach.ts';

type ViteServer = ViteDevServer | PreviewServer;

const attach = (server: ViteServer, configuredPort?: number) => {
	const httpServer = server.httpServer as unknown as HttpServer | null;
	if (!httpServer) return;

	const env = loadEnv(server.config.mode, server.config.envDir, '');

	attachAfkWhenListening(httpServer, {
		secret: process.env.BETTER_AUTH_SECRET ?? env.BETTER_AUTH_SECRET,
		internalUrl: process.env.AFK_INTERNAL_URL ?? env.AFK_INTERNAL_URL,
		allowedOrigins: [env.ORIGIN, env.BETTER_AUTH_URL],
		fallbackPort: configuredPort,
		logger: server.config.logger
	});
};

/**
 * Runs the AFK transport inside Vite's HTTP server for `vite dev` and
 * `vite preview`. Production deployments must attach the same gateway to the
 * adapter's HTTP server; see `server.ts`.
 */
export const afkWebSocketPlugin = (): Plugin => ({
	name: 'neoactyl-afk-websocket',
	configureServer(server: ViteDevServer) {
		attach(server, server.config.server.port);
	},
	configurePreviewServer(server: PreviewServer) {
		attach(server, server.config.preview.port);
	}
});
