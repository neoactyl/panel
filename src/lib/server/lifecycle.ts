import { building } from '$app/env';
import { maybeRunRenewals } from '#lib/server/billing/billing.ts';
import { ensureOperationalSchema } from '#lib/server/db/bootstrap.ts';
import { loadSettings } from '#lib/server/config/settings.ts';
import { startDiscordBot, stopDiscordBot } from '#lib/server/discord/bot.ts';
import { logError } from '#lib/server/system/logs.ts';
import { createBanner } from '#lib/taag.ts';

const inflight = new Set<Promise<unknown>>();
let initialized = false;
let renewalsRunning = false;
let renewalsTimer: ReturnType<typeof setInterval> | undefined;

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
	} finally {
		renewalsRunning = false;
	}
};

const RENEWALS_INTERVAL_MS = 60_000;

/** Start background work once, on the first request rather than at import time. */
export const initializeServer = () => {
	if (building || initialized) return;
	initialized = true;

	console.log(createBanner());

	fireAndForget(runRenewalsOnce, 'renewals');
	void startDiscordBot().catch((cause) => {
		console.error('[discord] Unable to start the embedded invite bot.', cause);
	});

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
