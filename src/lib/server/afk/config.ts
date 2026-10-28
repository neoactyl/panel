import { getBool, getNumber } from '#lib/server/config/settings.ts';

export type AfkConfig = {
	enabled: boolean;
	coinsPerMinute: number;
	dailyCapMinutes: number;
	minimumPayoutMinutes: number;
	heartbeatSeconds: number;
	minHeartbeatGapSeconds: number;
	maxHeartbeatGapSeconds: number;
	idleTimeoutSeconds: number;
	requireVisible: boolean;
	requireFocus: boolean;
	requireInteraction: boolean;
	minInteractionsPerBeat: number;
	challengeEnabled: boolean;
	challengeMinSeconds: number;
	challengeMaxSeconds: number;
	challengeWindowSeconds: number;
	challengeMinResponseMs: number;
	maxStrikes: number;
	cooldownMinutes: number;
	sessionTicketSeconds: number;
	maxSessionsPerIp: number;
	bindSessionToIp: boolean;
	bindSessionToUserAgent: boolean;
	dayResetHourUtc: number;
	/** Safe subset sent to the browser. */
	public: AfkPublicConfig;
};

export type AfkPublicConfig = {
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
};

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, Math.floor(Number.isFinite(value) ? value : min)));

/**
 * Reads every AFK rule from the admin settings table on each call. The gateway
 * receives a fresh copy after every heartbeat, so changes apply without a
 * restart (at most one heartbeat of delay).
 */
export const readAfkConfig = (): AfkConfig => {
	const heartbeatSeconds = clamp(getNumber('afk.heartbeatSeconds'), 5, 120);
	const minHeartbeatGapSeconds = Math.min(
		heartbeatSeconds - 1,
		clamp(getNumber('afk.minHeartbeatGapSeconds'), 2, 120)
	);
	const maxHeartbeatGapSeconds = clamp(
		getNumber('afk.maxHeartbeatGapSeconds') || heartbeatSeconds,
		heartbeatSeconds,
		600
	);
	const challengeMinSeconds = clamp(getNumber('afk.challengeMinSeconds'), 10, 86_400);
	const challengeMaxSeconds = Math.max(
		challengeMinSeconds,
		clamp(getNumber('afk.challengeMaxSeconds'), 10, 86_400)
	);

	const publicConfig: AfkPublicConfig = {
		enabled: false,
		coinsPerMinute: Math.max(0, getNumber('afk.coinsPerMinute')),
		dailyCapMinutes: Math.max(0, getNumber('afk.dailyCapMinutes')),
		minimumPayoutMinutes: Math.max(1, getNumber('afk.minimumPayoutMinutes')),
		heartbeatSeconds,
		maxHeartbeatGapSeconds,
		idleTimeoutSeconds: clamp(getNumber('afk.idleTimeoutSeconds'), 0, 86_400),
		requireVisible: getBool('afk.requireVisible'),
		requireFocus: getBool('afk.requireFocus'),
		requireInteraction: getBool('afk.requireInteraction'),
		challengeEnabled: getBool('afk.challengeEnabled'),
		challengeWindowSeconds: clamp(getNumber('afk.challengeWindowSeconds'), 5, 300),
		dayResetHourUtc: clamp(getNumber('afk.dayResetHourUtc'), 0, 23)
	};

	const enabled =
		getBool('afk.enabled') && getBool('credits.enabled') && getBool('credits.allowEarn');

	return {
		...publicConfig,
		enabled,
		public: { ...publicConfig, enabled },
		minHeartbeatGapSeconds,
		minInteractionsPerBeat: clamp(getNumber('afk.minInteractionsPerBeat'), 0, 100),
		challengeMinSeconds,
		challengeMaxSeconds,
		challengeMinResponseMs: clamp(getNumber('afk.challengeMinResponseMs'), 0, 10_000),
		maxStrikes: clamp(getNumber('afk.maxStrikes'), 1, 100),
		cooldownMinutes: clamp(getNumber('afk.cooldownMinutes'), 0, 10_080),
		sessionTicketSeconds: clamp(getNumber('afk.sessionTicketSeconds'), 10, 600),
		maxSessionsPerIp: clamp(getNumber('afk.maxSessionsPerIp'), 1, 1_000),
		bindSessionToIp: getBool('afk.bindSessionToIp'),
		bindSessionToUserAgent: getBool('afk.bindSessionToUserAgent')
	};
};

/**
 * A user's "day" starts at the configured UTC hour instead of midnight UTC.
 * The returned key is stored in the afk_session row so caps roll over cleanly.
 */
export { afkDayKey, afkNextDayStart } from './day.ts';

export const pendingSecondsCap = (config: AfkConfig) =>
	Math.max(
		300,
		config.heartbeatSeconds * 4,
		// The buffer must be able to hold at least one full minimum payout block,
		// otherwise a large minimum payout could never be reached.
		config.minimumPayoutMinutes * 60 + config.heartbeatSeconds
	);
