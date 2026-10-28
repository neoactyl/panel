import { describe, expect, it } from 'vitest';
import { afkDayKey, afkNextDayStart } from './day.ts';
import { evaluateAfkBeat, type AfkBeatInput } from './eligibility.ts';
import { computeAfkPayout } from './payout.ts';
import { signAfkTicket, verifyAfkTicket, type AfkTicket } from './token.ts';

const SECRET = 'test-secret-that-is-longer-than-32-characters';

const ticket = (overrides: Partial<AfkTicket> = {}): AfkTicket => {
	const now = Date.now();

	return {
		v: 1,
		uid: 'user-1',
		sid: 'session-1',
		iat: now,
		exp: now + 30_000,
		nonce: 'nonce-0123456789abcdef',
		...overrides
	};
};

describe('AFK tickets', () => {
	it('round-trips a signed ticket', () => {
		const value = ticket();
		expect(verifyAfkTicket(SECRET, signAfkTicket(SECRET, value))).toEqual(value);
	});

	it('rejects a tampered payload or signature', () => {
		const token = signAfkTicket(SECRET, ticket());
		const [payload, signature] = token.split('.');

		expect(verifyAfkTicket(SECRET, `${payload}x.${signature}`)).toBeNull();
		expect(verifyAfkTicket(SECRET, `${payload}.${signature}x`)).toBeNull();
		expect(verifyAfkTicket('a-different-secret-that-is-long-enough', token)).toBeNull();
	});

	it('rejects expired and malformed tickets', () => {
		expect(verifyAfkTicket(SECRET, signAfkTicket(SECRET, ticket({ exp: Date.now() - 1 })))).toBeNull();
		expect(verifyAfkTicket(SECRET, 'not-a-ticket')).toBeNull();
		expect(
			verifyAfkTicket(SECRET, signAfkTicket(SECRET, ticket({ nonce: 'short' })))
		).toBeNull();
		expect(
			verifyAfkTicket(SECRET, signAfkTicket(SECRET, ticket({ sid: '' })))
		).toBeNull();
	});
});

const baseBeat = (overrides: Partial<AfkBeatInput> = {}): AfkBeatInput => ({
	now: 1_000_000,
	gapSeconds: 15,
	previous: { visible: true, focused: true },
	current: { visible: true, focused: true },
	interactions: 1,
	lastInteractionAt: 1_000_000,
	paused: false,
	challengePending: false,
	cooldownUntil: 0,
	config: {
		requireVisible: true,
		requireFocus: true,
		requireInteraction: true,
		idleTimeoutSeconds: 300,
		minInteractionsPerBeat: 1,
		minHeartbeatGapSeconds: 8,
		maxHeartbeatGapSeconds: 45
	},
	...overrides
});

describe('evaluateAfkBeat', () => {
	it('credits a healthy window, capped at the maximum gap', () => {
		expect(evaluateAfkBeat(baseBeat())).toEqual({
			eligible: true,
			seconds: 15,
			reason: 'eligible'
		});
		expect(evaluateAfkBeat(baseBeat({ gapSeconds: 900 })).seconds).toBe(45);
	});

	it('refuses paused, cooling down and challenge-pending connections', () => {
		expect(evaluateAfkBeat(baseBeat({ paused: true })).reason).toBe('paused');
		expect(evaluateAfkBeat(baseBeat({ cooldownUntil: 1_000_001 })).reason).toBe('cooldown');
		expect(evaluateAfkBeat(baseBeat({ challengePending: true })).reason).toBe('challenge');
	});

	it('rejects beats that arrive too quickly', () => {
		expect(evaluateAfkBeat(baseBeat({ gapSeconds: 2 }))).toEqual({
			eligible: false,
			seconds: 0,
			reason: 'too-soon'
		});
	});

	it('requires visible and focused tabs when configured', () => {
		expect(evaluateAfkBeat(baseBeat({ current: { visible: false, focused: true } })).reason).toBe(
			'hidden'
		);
		expect(evaluateAfkBeat(baseBeat({ previous: { visible: true, focused: false } })).reason).toBe(
			'unfocused'
		);
		expect(
			evaluateAfkBeat(
				baseBeat({
					current: { visible: false, focused: true },
					config: { ...baseBeat().config, requireVisible: false }
				})
			).eligible
		).toBe(true);
	});

	it('pauses idle sessions and honours the minimum interactions setting', () => {
		expect(
			evaluateAfkBeat(
				baseBeat({
					interactions: 0,
					lastInteractionAt: 1_000_000 - 301_000
				})
			).reason
		).toBe('idle');

		expect(
			evaluateAfkBeat(
				baseBeat({
					interactions: 2,
					lastInteractionAt: 1_000_000 - 301_000,
					config: { ...baseBeat().config, minInteractionsPerBeat: 3 }
				})
			).reason
		).toBe('idle');
	});

	it('treats recent interaction as activity when an idle timeout is set', () => {
		expect(
			evaluateAfkBeat(
				baseBeat({
					interactions: 0,
					lastInteractionAt: 1_000_000 - 10_000
				})
			).eligible
		).toBe(true);
	});
});

describe('computeAfkPayout', () => {
	const base = {
		pendingSeconds: 0,
		earnedToday: 0,
		dailyCapMinutes: 0,
		coinsPerMinute: 2,
		minimumPayoutMinutes: 1
	};

	it('pays whole minutes and keeps the remainder', () => {
		expect(computeAfkPayout({ ...base, pendingSeconds: 195 })).toEqual({
			pendingSeconds: 15,
			earnedToday: 3,
			payoutMinutes: 3,
			awarded: 6,
			capped: false
		});
	});

	it('waits until the minimum payout block is reached', () => {
		expect(computeAfkPayout({ ...base, pendingSeconds: 59, minimumPayoutMinutes: 5 })).toEqual({
			pendingSeconds: 59,
			earnedToday: 0,
			payoutMinutes: 0,
			awarded: 0,
			capped: false
		});

		expect(
			computeAfkPayout({ ...base, pendingSeconds: 300, minimumPayoutMinutes: 5 })
		).toMatchObject({ pendingSeconds: 0, payoutMinutes: 5, awarded: 10 });
	});

	it('respects the daily cap', () => {
		expect(
			computeAfkPayout({ ...base, pendingSeconds: 600, earnedToday: 4, dailyCapMinutes: 5 })
		).toEqual({
			pendingSeconds: 540,
			earnedToday: 5,
			payoutMinutes: 1,
			awarded: 2,
			capped: true
		});

		expect(
			computeAfkPayout({ ...base, pendingSeconds: 600, earnedToday: 5, dailyCapMinutes: 5 })
		).toEqual({
			pendingSeconds: 0,
			earnedToday: 5,
			payoutMinutes: 0,
			awarded: 0,
			capped: true
		});
	});

	it('pays the final partial block at the daily cap', () => {
		expect(
			computeAfkPayout({
				...base,
				pendingSeconds: 600,
				earnedToday: 8,
				dailyCapMinutes: 10,
				minimumPayoutMinutes: 5
			})
		).toEqual({
			pendingSeconds: 480,
			earnedToday: 10,
			payoutMinutes: 2,
			awarded: 4,
			capped: true
		});
	});

	it('never pays when the rate is zero', () => {
		expect(computeAfkPayout({ ...base, pendingSeconds: 600, coinsPerMinute: 0 })).toEqual({
			pendingSeconds: 600,
			earnedToday: 0,
			payoutMinutes: 0,
			awarded: 0,
			capped: false
		});
	});
});

describe('afkDayKey', () => {
	const at = (iso: string) => new Date(iso).getTime();

	it('uses the UTC date when the reset hour is midnight', () => {
		expect(afkDayKey(at('2026-03-01T23:59:59Z'), 0)).toBe('2026-03-01');
		expect(afkDayKey(at('2026-03-02T00:00:00Z'), 0)).toBe('2026-03-02');
	});

	it('rolls over at the configured UTC hour', () => {
		expect(afkDayKey(at('2026-03-02T05:59:59Z'), 6)).toBe('2026-03-01');
		expect(afkDayKey(at('2026-03-02T06:00:00Z'), 6)).toBe('2026-03-02');
	});

	it('computes the next reset instant', () => {
		expect(afkNextDayStart(at('2026-03-02T05:59:59Z'), 6)).toBe(
			at('2026-03-02T06:00:00Z')
		);
		expect(afkNextDayStart(at('2026-03-02T06:00:01Z'), 6)).toBe(
			at('2026-03-03T06:00:00Z')
		);
	});
});
