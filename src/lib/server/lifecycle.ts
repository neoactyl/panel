import { maybeRunRenewals } from '#lib/server/billing/billing.ts';
import { ensureOperationalSchema } from '#lib/server/db/bootstrap.ts';
import { loadSettings } from '#lib/server/config/settings.ts';
import { startDiscordBot, stopDiscordBot } from '#lib/server/discord/bot.ts';
import { logError, pruneExpiredLogs } from '#lib/server/system/logs.ts';
import { createBanner } from '#lib/taag.ts';

const inflight = new Set<Promise<unknown>>();
let initialized = false;
let renewalsRunning = false;
let renewalsTimer: ReturnType<typeof setInterval> | undefined;

/**
 * The web process hosts shard 0 by default. Set DISCORD_EMBED_BOT=false when
 * the bot runs in its own process (or processes) so the web app never opens a
 * second gateway session.
 */
const embeddedBotEnabled = () =>
	!['0', 'false', 'no', 'off'].includes(
		(process.env.DISCORD_EMBED_BOT ?? 'true').trim().toLowerCase()
	);

const fireAndForget = (fn: () => unknown, label = 'background task') => {
	const task: Promise<unknown> = (async () => fn())()
		.catch((err) => {
			console.error(`${label} failed:`, err);
			try {
				logError({
					reference: crypto.randomUUID(),
					status: 500,
					method: 'BACKGROUND',
					path: label,
					message: err instanceof Error ? err.message : String(err),
					stack: err instanceof Error ? err.stack : null,
					metadata: { kind: 'background' }
				});
			} catch {
				// Logging must never throw out of a background task.
			}
		})
		.finally(() => {
			inflight.delete(task);
		});

	inflight.add(task);
};

const runRenewalsOnce = async () => {
	if (renewalsRunning) return;
	renewalsRunning = true;

	try {
		await ensureOperationalSchema();
		await loadSettings();
		await maybeRunRenewals();
		await pruneExpiredLogs();
	} finally {
		renewalsRunning = false;
	}
};

const RENEWALS_INTERVAL_MS = 60_000;

/**
 * Start background work once. Production calls this from `server.ts` before
 * the HTTP server starts accepting traffic, so renewals never depend on the
 * first request; the dev server calls it from the lifecycle Vite plugin.
 */
export const initializeServer = () => {
	if (initialized) return;
	initialized = true;

	console.log(createBanner());

	fireAndForget(runRenewalsOnce, 'renewals');
	if (embeddedBotEnabled()) {
		void startDiscordBot().catch((cause) => {
			console.error('[discord] Unable to start the embedded invite bot.', cause);
		});
	}

	renewalsTimer = setInterval(
		() => fireAndForget(runRenewalsOnce, 'renewals'),
		RENEWALS_INTERVAL_MS
	);
	renewalsTimer.unref();

	(process as NodeJS.EventEmitter).once('sveltekit:shutdown', async () => {
		if (renewalsTimer) clearInterval(renewalsTimer);
		await stopDiscordBot().catch((cause) => {
			console.error('[discord] Unable to stop the embedded invite bot.', cause);
		});
		await Promise.race([
			Promise.allSettled([...inflight]),
			new Promise((resolve) => setTimeout(resolve, 10_000))
		]);
	});
};
