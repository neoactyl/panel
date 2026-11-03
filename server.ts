import process from 'node:process';
import { attachAfkWhenListening } from './src/lib/server/afk/attach.ts';

// adapter-node rejects request bodies above 512 KB by default. File manager
// uploads stream through `/api/servers/[id]/files/upload`, so raise the limit
// unless the operator has configured one explicitly.
process.env.BODY_SIZE_LIMIT ??= '512M';

/**
 * Production entry point.
 *
 * Start the long-lived background work (renewal worker, embedded Discord bot
 * and startup banner) here rather than on the first web request. Renewals must
 * run even when the panel is idle, so they cannot depend on someone visiting a
 * page first.
 *
 * `@sveltejs/adapter-node` creates and starts its HTTP server when the build
 * entry is imported. Import it here so the AFK gateway can be attached to that
 * exact server (the same process, port and TLS termination as the app).
 *
 * Run with `bun run start` (Bun loads `.env` automatically). With plain Node,
 * pass `--env-file=.env`.
 */
const { initializeServer } = await import('./src/lib/server/lifecycle.ts');
initializeServer();

const { server } = await import('./build/index.js');

const configuredPort = Number.parseInt(process.env.PORT ?? '', 10);

attachAfkWhenListening(server, {
	secret: process.env.BETTER_AUTH_SECRET,
	internalUrl: process.env.AFK_INTERNAL_URL,
	allowedOrigins: [process.env.ORIGIN, process.env.BETTER_AUTH_URL],
	fallbackPort: Number.isFinite(configuredPort) ? configuredPort : 3000,
	logger: console
});
