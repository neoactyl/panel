import { createHash } from 'node:crypto';
import { lt, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { ensureOperationalSchema } from '#lib/server/db/bootstrap.ts';
import { activityLog, errorLog } from '#lib/server/db/ops.ts';

export const LOG_RETENTION_DAYS = 30;
const LOG_RETENTION_MS = LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

let lastPrunedAt = 0;
let pruning: Promise<void> | undefined;

export const logRetentionCutoff = (now = Date.now()) => new Date(now - LOG_RETENTION_MS);

export type ActivityInput = {
	userId?: string | null;
	action: string;
	message: string;
	severity?: 'info' | 'warning' | 'error';
	metadata?: unknown;
	ip?: string | null;
	path?: string | null;
};

export type ErrorInput = {
	reference: string;
	userId?: string | null;
	status: number;
	method?: string | null;
	path?: string | null;
	route?: string | null;
	message: string;
	stack?: string | null;
	metadata?: unknown;
};

type AggregatedError = ErrorInput & {
	fingerprint: string;
	count: number;
	lastSeen: Date;
};

const FLUSH_DELAY_MS = 250;
const MAX_QUEUE = 500;

let activityQueue: ActivityInput[] = [];
const errorQueue = new Map<string, AggregatedError>();
let timer: ReturnType<typeof setTimeout> | undefined;
let flushing = false;

const safeMetadata = (metadata: unknown) => {
	if (metadata === undefined) return null;

	try {
		return JSON.stringify(metadata);
	} catch {
		return JSON.stringify({ note: 'Metadata could not be serialized.' });
	}
};

const fallbackActivity = (entry: ActivityInput) => {
	console.error(
		`[activity:${entry.severity ?? 'info'}] ${entry.action}: ${entry.message}`,
		entry.metadata ?? ''
	);
};

const fallbackError = (entry: AggregatedError) => {
	console.error(
		`[error:${entry.reference}] ${entry.message} (x${entry.count})`,
		entry.stack ?? '',
		entry.metadata ?? ''
	);
};

const fingerprintError = (entry: ErrorInput) => {
	const frame = entry.stack
		?.split('\n')
		.map((line) => line.trim())
		.find((line) => line.startsWith('at '));

	return createHash('sha256')
		.update([entry.status, entry.route ?? entry.path ?? '', entry.message, frame ?? ''].join('\n'))
		.digest('hex');
};

const schedule = () => {
	if (timer) return;
	timer = setTimeout(() => {
		timer = undefined;
		void flushLogs();
	}, FLUSH_DELAY_MS);
};

const enqueue = <T>(queue: T[], entry: T) => {
	queue.push(entry);
	if (queue.length >= MAX_QUEUE) {
		if (timer) clearTimeout(timer);
		timer = undefined;
		void flushLogs();
	} else {
		schedule();
	}
};

export const logActivity = (entry: ActivityInput) => {
	enqueue(activityQueue, entry);
};

export const logError = (entry: ErrorInput) => {
	const fingerprint = fingerprintError(entry);
	const existing = errorQueue.get(fingerprint);
	const now = new Date();

	if (existing) {
		existing.count += 1;
		existing.lastSeen = now;
		existing.reference = entry.reference;
		existing.userId = entry.userId ?? existing.userId;
		existing.method = entry.method ?? existing.method;
		existing.path = entry.path ?? existing.path;
		existing.metadata = entry.metadata ?? existing.metadata;
	} else {
		errorQueue.set(fingerprint, {
			...entry,
			fingerprint,
			count: 1,
			lastSeen: now
		});
	}

	schedule();
};

export const flushLogs = async () => {
	if (flushing) return;

	flushing = true;
	const activities = activityQueue.splice(0, activityQueue.length);
	const errors = [...errorQueue.values()];
	errorQueue.clear();

	try {
		await ensureOperationalSchema();

		if (activities.length > 0) {
			await db
				.insert(activityLog)
				.values(
					activities.map((entry) => ({
						userId: entry.userId ?? null,
						action: entry.action,
						severity: entry.severity ?? 'info',
						message: entry.message,
						metadata: safeMetadata(entry.metadata),
						ip: entry.ip ?? null,
						path: entry.path ?? null
					}))
				)
				.run();
		}

		if (errors.length > 0) {
			await db
				.insert(errorLog)
				.values(
					errors.map((entry) => ({
						fingerprint: entry.fingerprint,
						reference: entry.reference,
						userId: entry.userId ?? null,
						status: entry.status,
						method: entry.method ?? null,
						path: entry.path ?? null,
						message: entry.message,
						stack: entry.stack ?? null,
						metadata: safeMetadata(entry.metadata),
						count: entry.count,
						lastSeen: entry.lastSeen
					}))
				)
				.onConflictDoUpdate({
					target: errorLog.fingerprint,
					set: {
						reference: sql.raw('excluded.reference'),
						userId: sql.raw('excluded.user_id'),
						method: sql.raw('excluded.method'),
						path: sql.raw('excluded.path'),
						count: sql`${errorLog.count} + ${sql.raw('excluded.count')}`,
						lastSeen: sql.raw('excluded.last_seen')
					}
				})
				.run();
		}
	} catch (cause) {
		console.error('Database logging failed; streaming entries to the console instead.', cause);
		activities.forEach(fallbackActivity);
		errors.forEach(fallbackError);
	} finally {
		flushing = false;

		if (activityQueue.length > 0 || errorQueue.size > 0) schedule();
	}
};

/**
 * Delete activity and error records older than the retention window. This is
 * throttled so it can be called from request loads and the background worker
 * without adding a delete on every log flush.
 */
export const pruneExpiredLogs = async (options: { force?: boolean } = {}) => {
	if (!options.force && Date.now() - lastPrunedAt < PRUNE_INTERVAL_MS) return;
	if (pruning) return pruning;

	const cutoff = logRetentionCutoff();

	pruning = (async () => {
		await ensureOperationalSchema();
		await db.delete(activityLog).where(lt(activityLog.createdAt, cutoff)).run();
		await db.delete(errorLog).where(lt(errorLog.lastSeen, cutoff)).run();
		lastPrunedAt = Date.now();
	})();

	try {
		await pruning;
	} finally {
		pruning = undefined;
	}
};

/** Remove every activity and error record, including any queued entries. */
export const clearLogs = async () => {
	activityQueue = [];
	errorQueue.clear();
	await ensureOperationalSchema();
	await db.delete(activityLog).run();
	await db.delete(errorLog).run();
};