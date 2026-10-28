import { eq } from 'drizzle-orm';
import { addCredits, getCreditBalance } from '#lib/server/billing/credits.ts';
import { db } from '#lib/server/db/index.ts';
import { afkSession } from '#lib/server/db/ops.ts';
import { serverEnv } from '#lib/server/config/env.ts';
import { logActivity } from '#lib/server/system/logs.ts';
import { afkDayKey, pendingSecondsCap, readAfkConfig, type AfkConfig } from './config.ts';
import { computeAfkPayout } from './payout.ts';
import { AFK_WS_PATH, hashClientAddress, hashUserAgent, signAfkTicket } from './token.ts';

export type AfkErrorCode = 'DISABLED' | 'COOLDOWN' | 'CAP_REACHED' | 'RATE_LIMITED' | 'INVALID';

export class AfkError extends Error {
	code: AfkErrorCode;
	retryAfterSeconds?: number;

	constructor(message: string, code: AfkErrorCode = 'INVALID', retryAfterSeconds?: number) {
		super(message);
		this.name = 'AfkError';
		this.code = code;
		this.retryAfterSeconds = retryAfterSeconds;
	}
}

export type AfkState = {
	enabled: boolean;
	coinsPerMinute: number;
	dailyCapMinutes: number;
	minimumPayoutMinutes: number;
	heartbeatSeconds: number;
	maxHeartbeatGapSeconds: number;
	idleTimeoutSeconds: number;
	requireVisible: boolean;
	requireFocus: boolean;
	requireInteraction: boolean;
	challengeEnabled: boolean;
	challengeWindowSeconds: number;
	dayResetHourUtc: number;
	earnedToday: number;
	remainingMinutes: number;
	pendingSeconds: number;
	nextCreditInSeconds: number;
	totalEarned: number;
	balance: number;
	strikes: number;
	cooldownUntil: string | null;
	serverTime: number;
};

export type AfkSessionGrant = {
	ticket: string;
	expiresAt: string;
	sessionId: string;
	wsPath: string;
	config: AfkConfig['public'];
	state: AfkState;
};

export type AfkIngestKind =
	| 'start'
	| 'beat'
	| 'challenge-pass'
	| 'challenge-fail'
	| 'flag'
	| 'end';

export type AfkIngestInput = {
	userId: string;
	sessionId: string;
	seq: number;
	kind: AfkIngestKind;
	seconds?: number;
	ip?: string;
	userAgent?: string;
	meta?: Record<string, unknown>;
};

export type AfkIngestResult = {
	state: AfkState;
	config: AfkConfig;
	awarded: number;
	payoutMinutes: number;
	capped: boolean;
};

const secret = () => serverEnv.BETTER_AUTH_SECRET;

const chains = new Map<string, Promise<void>>();

const withUserLock = async <T>(userId: string, task: () => Promise<T>): Promise<T> => {
	const previous = chains.get(userId) ?? Promise.resolve();
	let release!: () => void;
	const next = new Promise<void>((resolve) => {
		release = resolve;
	});
	const current = previous.then(() => next);

	chains.set(userId, current);
	await previous.catch(() => undefined);

	try {
		return await task();
	} finally {
		release();
		if (chains.get(userId) === current) chains.delete(userId);
	}
};

const loadAfkRow = async (userId: string) =>
	db.select().from(afkSession).where(eq(afkSession.userId, userId)).get();

const cooldownIso = (value: Date | null | undefined, now = Date.now()) => {
	if (!value) return null;
	const at = value.getTime();
	return at > now ? value.toISOString() : null;
};

const buildState = async (
	userId: string,
	config: AfkConfig,
	row: Awaited<ReturnType<typeof loadAfkRow>>,
	now = Date.now()
): Promise<AfkState> => {
	const today = afkDayKey(now, config.dayResetHourUtc);
	const sameDay = row?.day === today;
	const earnedToday = sameDay ? (row?.earnedToday ?? 0) : 0;
	const pendingSeconds = sameDay ? (row?.pendingSeconds ?? 0) : 0;
	const dailyCap = config.dailyCapMinutes;
	const remainingMinutes =
		dailyCap <= 0 ? Number.POSITIVE_INFINITY : Math.max(0, dailyCap - earnedToday);
	const availableMinutes = Math.floor(pendingSeconds / 60);
	const minimum = Math.max(1, config.minimumPayoutMinutes);
	const nextCreditInSeconds =
		dailyCap > 0 && remainingMinutes <= 0
			? 0
			: availableMinutes >= minimum && remainingMinutes > 0
				? 0
				: Math.max(0, minimum * 60 - pendingSeconds);

	return {
		enabled: config.enabled,
		coinsPerMinute: config.coinsPerMinute,
		dailyCapMinutes: dailyCap,
		minimumPayoutMinutes: config.minimumPayoutMinutes,
		heartbeatSeconds: config.heartbeatSeconds,
		maxHeartbeatGapSeconds: config.maxHeartbeatGapSeconds,
		idleTimeoutSeconds: config.idleTimeoutSeconds,
		requireVisible: config.requireVisible,
		requireFocus: config.requireFocus,
		requireInteraction: config.requireInteraction,
		challengeEnabled: config.challengeEnabled,
		challengeWindowSeconds: config.challengeWindowSeconds,
		dayResetHourUtc: config.dayResetHourUtc,
		earnedToday,
		remainingMinutes: Number.isFinite(remainingMinutes) ? remainingMinutes : 0,
		pendingSeconds,
		nextCreditInSeconds,
		totalEarned: row?.totalEarned ?? 0,
		balance: await getCreditBalance(userId),
		strikes: row?.strikes ?? 0,
		cooldownUntil: cooldownIso(row?.cooldownUntil, now),
		serverTime: now
	};
};

export const getAfkState = async (userId: string): Promise<AfkState> => {
	const config = readAfkConfig();
	const row = await loadAfkRow(userId);

	return buildState(userId, config, row);
};

export const startAfkSession = async (
	userId: string,
	client: { ip?: string; userAgent?: string }
): Promise<AfkSessionGrant> => {
	const config = readAfkConfig();

	if (!config.enabled) {
		throw new AfkError('AFK earning is currently disabled.', 'DISABLED');
	}

	const now = Date.now();
	const row = await loadAfkRow(userId);
	const state = await buildState(userId, config, row, now);

	if (state.cooldownUntil) {
		const retry = Math.max(
			1,
			Math.ceil((new Date(state.cooldownUntil).getTime() - now) / 1000)
		);
		throw new AfkError(
			`Too many presence checks were missed. Try again in ${Math.ceil(retry / 60)} minute(s).`,
			'COOLDOWN',
			retry
		);
	}

	if (config.dailyCapMinutes > 0 && state.earnedToday >= config.dailyCapMinutes) {
		throw new AfkError('You have reached the daily AFK earning limit.', 'CAP_REACHED');
	}

	const sessionId = crypto.randomUUID();
	const expiresAt = now + config.sessionTicketSeconds * 1000;
	const ticket = signAfkTicket(secret(), {
		v: 1,
		uid: userId,
		sid: sessionId,
		iat: now,
		exp: expiresAt,
		nonce: crypto.randomUUID().replaceAll('-', ''),
		iph: client.ip ? hashClientAddress(client.ip) : undefined,
		uah: client.userAgent ? hashUserAgent(client.userAgent) : undefined
	});

	return {
		ticket,
		expiresAt: new Date(expiresAt).toISOString(),
		sessionId,
		wsPath: AFK_WS_PATH,
		config: config.public,
		state
	};
};

const clampSeconds = (value: unknown, max: number) => {
	const number = typeof value === 'number' ? value : Number(value);

	if (!Number.isFinite(number) || number <= 0) return 0;

	return Math.min(max, Math.floor(number));
};

const logAfkEvent = (
	userId: string,
	action: string,
	message: string,
	metadata?: Record<string, unknown>
) => {
	logActivity({
		userId,
		action,
		severity: action.includes('cooldown') ? 'warning' : 'info',
		message,
		metadata
	});
};

export const ingestAfkProgress = async (input: AfkIngestInput): Promise<AfkIngestResult> =>
	withUserLock(input.userId, async () => {
		const config = readAfkConfig();
		const now = Date.now();
		const day = afkDayKey(now, config.dayResetHourUtc);
		const row = await loadAfkRow(input.userId);
		const sameDay = row?.day === day || !row;

		let earnedToday = sameDay ? (row?.earnedToday ?? 0) : 0;
		let pendingSeconds = sameDay ? (row?.pendingSeconds ?? 0) : 0;
		let totalEarned = row?.totalEarned ?? 0;
		let strikes = row?.strikes ?? 0;
		let cooldownUntil = row?.cooldownUntil ?? null;

		if (cooldownUntil && cooldownUntil.getTime() <= now) {
			cooldownUntil = null;
			strikes = 0;
		}

		const duplicateBeat =
			input.kind === 'beat' &&
			row?.lastSessionId === input.sessionId &&
			input.seq <= row.lastSeq;

		let awarded = 0;
		let payoutMinutes = 0;
		let capped = false;

		// Strikes deliberately survive reconnects: otherwise a script could dodge
		// the cooldown by simply opening a new session. They are cleared when a
		// cooldown expires or by successfully answering presence checks.

		if (input.kind === 'beat' && !duplicateBeat && config.enabled) {
			const seconds = clampSeconds(input.seconds, config.maxHeartbeatGapSeconds);

			if (config.coinsPerMinute > 0 && seconds > 0) {
				pendingSeconds = Math.min(
					pendingSeconds + seconds,
					pendingSecondsCap(config)
				);
			}

			const payout = computeAfkPayout({
				pendingSeconds,
				earnedToday,
				dailyCapMinutes: config.dailyCapMinutes,
				coinsPerMinute: config.coinsPerMinute,
				minimumPayoutMinutes: config.minimumPayoutMinutes
			});

			pendingSeconds = payout.pendingSeconds;
			earnedToday = payout.earnedToday;
			payoutMinutes = payout.payoutMinutes;
			awarded = payout.awarded;
			capped = payout.capped;

			if (awarded > 0) {
				await addCredits({
					userId: input.userId,
					amount: awarded,
					kind: 'afk',
					reference: `afk:${input.userId}:${day}:${payout.earnedToday - payoutMinutes}:${payoutMinutes}`,
					description: `AFK earnings for ${payoutMinutes} minute(s).`,
					metadata: {
						minutes: payoutMinutes,
						day,
						sessionId: input.sessionId,
						verifiedBy: 'websocket'
					}
				});

				totalEarned += awarded;
			}

			if (capped) pendingSeconds = 0;
		}

		if (input.kind === 'challenge-pass') {
			strikes = Math.max(0, strikes - 1);
		}

		if (input.kind === 'challenge-fail' || input.kind === 'flag') {
			strikes += 1;

			if (strikes >= config.maxStrikes) {
				if (config.cooldownMinutes > 0) {
					cooldownUntil = new Date(now + config.cooldownMinutes * 60_000);
				} else {
					strikes = 0;
				}

				logAfkEvent(
					input.userId,
					'afk.cooldown',
					`AFK earnings paused after ${config.maxStrikes} failed presence check(s).`,
					{
						sessionId: input.sessionId,
						kind: input.kind,
						cooldownMinutes: config.cooldownMinutes,
						meta: input.meta ?? null
					}
				);
			} else if (input.kind === 'flag') {
				logAfkEvent(input.userId, 'afk.flagged', 'Suspicious AFK activity detected.', {
					sessionId: input.sessionId,
					strikes,
					meta: input.meta ?? null
				});
			}
		}

		pendingSeconds = Math.max(0, Math.min(pendingSeconds, pendingSecondsCap(config)));

		await db
			.insert(afkSession)
			.values({
				userId: input.userId,
				lastPingAt: new Date(now),
				pendingSeconds,
				earnedToday,
				day,
				totalEarned,
				strikes,
				cooldownUntil,
				lastSessionId: input.sessionId,
				lastSeq: duplicateBeat ? (row?.lastSeq ?? 0) : input.seq,
				lastClientIp: input.ip ?? row?.lastClientIp ?? null,
				lastUserAgent: input.userAgent ?? row?.lastUserAgent ?? null,
				updatedAt: new Date(now)
			})
			.onConflictDoUpdate({
				target: afkSession.userId,
				set: {
					lastPingAt: new Date(now),
					pendingSeconds,
					earnedToday,
					day,
					totalEarned,
					strikes,
					cooldownUntil,
					lastSessionId: input.sessionId,
					lastSeq: duplicateBeat ? (row?.lastSeq ?? 0) : input.seq,
					lastClientIp: input.ip ?? row?.lastClientIp ?? null,
					lastUserAgent: input.userAgent ?? row?.lastUserAgent ?? null,
					updatedAt: new Date(now)
				}
			})
			.run();

		const nextRow = await loadAfkRow(input.userId);
		const state = await buildState(input.userId, config, nextRow, now);

		return { state, config, awarded, payoutMinutes, capped };
	});
