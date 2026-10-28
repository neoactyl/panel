import type { AfkConfig } from './config.ts';

export type AfkActivity = {
	visible: boolean;
	focused: boolean;
};

export type AfkBeatInput = {
	now: number;
	gapSeconds: number;
	previous: AfkActivity;
	current: AfkActivity;
	/** Number of trusted-ish input events reported since the previous beat. */
	interactions: number;
	lastInteractionAt: number;
	paused: boolean;
	challengePending: boolean;
	cooldownUntil: number;
	config: Pick<
		AfkConfig,
		| 'requireVisible'
		| 'requireFocus'
		| 'requireInteraction'
		| 'idleTimeoutSeconds'
		| 'minInteractionsPerBeat'
		| 'minHeartbeatGapSeconds'
		| 'maxHeartbeatGapSeconds'
	>;
};

export type AfkBeatReason =
	| 'eligible'
	| 'paused'
	| 'cooldown'
	| 'challenge'
	| 'hidden'
	| 'unfocused'
	| 'idle'
	| 'too-soon';

export type AfkBeatResult = {
	eligible: boolean;
	seconds: number;
	reason: AfkBeatReason;
};

/**
 * Decides how much of a heartbeat window may be credited. The caller must use
 * server-measured time (`now - previousBeatAt`), never a timestamp supplied by
 * the browser.
 */
export const evaluateAfkBeat = (input: AfkBeatInput): AfkBeatResult => {
	const { config } = input;

	if (input.paused) return { eligible: false, seconds: 0, reason: 'paused' };
	if (input.cooldownUntil > input.now) return { eligible: false, seconds: 0, reason: 'cooldown' };
	if (input.challengePending) return { eligible: false, seconds: 0, reason: 'challenge' };
	if (input.gapSeconds < config.minHeartbeatGapSeconds) {
		return { eligible: false, seconds: 0, reason: 'too-soon' };
	}

	if (config.requireVisible && (!input.previous.visible || !input.current.visible)) {
		return { eligible: false, seconds: 0, reason: 'hidden' };
	}

	if (config.requireFocus && (!input.previous.focused || !input.current.focused)) {
		return { eligible: false, seconds: 0, reason: 'unfocused' };
	}

	if (config.requireInteraction) {
		const recentlyActive =
			config.idleTimeoutSeconds > 0 &&
			input.lastInteractionAt > 0 &&
			input.now - input.lastInteractionAt <= config.idleTimeoutSeconds * 1000;

		const requiredInteractions = Math.max(1, config.minInteractionsPerBeat);

		if (!recentlyActive && input.interactions < requiredInteractions) {
			return { eligible: false, seconds: 0, reason: 'idle' };
		}
	}

	const seconds = Math.max(0, Math.min(input.gapSeconds, config.maxHeartbeatGapSeconds));

	return { eligible: seconds > 0, seconds, reason: 'eligible' };
};
