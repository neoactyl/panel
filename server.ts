import process from 'node:process';
import { attachAfkWhenListening } from './src/lib/server/afk/attach.ts';

/**
 * Production entry point.
 *
 * `@sveltejs/adapter-node` creates and starts its HTTP server when the build
 * entry is imported. Import it here so the AFK gateway can be attached to that
 * exact server (the same process, port and TLS termination as the app).
 *
 * Run with `bun run start` (Bun loads `.env` automatically). With plain Node,
 * pass `--env-file=.env`.
 */
const { server } = await import('./build/index.js');

const configuredPort = Number.parseInt(process.env.PORT ?? '', 10);

attachAfkWhenListening(server, {
	secret: process.env.BETTER_AUTH_SECRET,
	internalUrl: process.env.AFK_INTERNAL_URL,
	allowedOrigins: [process.env.ORIGIN, process.env.BETTER_AUTH_URL],
	fallbackPort: Number.isFinite(configuredPort) ? configuredPort : 3000,
	logger: console
});
