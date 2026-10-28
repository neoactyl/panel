import { describe, expect, it } from 'vitest';
import { DAY_MS, formatTimeRemaining, getRenewalWindow } from './renewal-window.ts';

const now = Date.UTC(2026, 0, 1, 0, 0, 0);

describe('getRenewalWindow', () => {
	it('opens the renewal window only inside the last 2% of the interval', () => {
		const early = getRenewalWindow(
			{ status: 'active', intervalDays: 30, nextRenewalAt: new Date(now + 10 * DAY_MS) },
			now
		);
		const late = getRenewalWindow(
			{ status: 'active', intervalDays: 30, nextRenewalAt: new Date(now + 60 * 60 * 1000) },
			now
		);

		expect(early.canRenew).toBe(false);
		expect(late.canRenew).toBe(true);
	});

	it('always allows suspended servers to renew', () => {
		const window = getRenewalWindow(
			{ status: 'suspended', intervalDays: 30, nextRenewalAt: new Date(now + 30 * DAY_MS) },
			now
		);

		expect(window.canRenew).toBe(true);
	});

	it('computes interval and opening time from the billing record', () => {
		const expiresAt = now + 5 * DAY_MS;
		const window = getRenewalWindow(
			{ status: 'active', intervalDays: 30, nextRenewalAt: expiresAt },
			now
		);

		expect(window.remainingMs).toBe(5 * DAY_MS);
		expect(window.intervalMs).toBe(30 * DAY_MS);
		expect(window.opensAt.getTime()).toBe(expiresAt - 30 * DAY_MS * 0.02);
	});

	it('never produces an interval shorter than one day', () => {
		const window = getRenewalWindow(
			{ status: 'active', intervalDays: 0, nextRenewalAt: new Date(now) },
			now
		);

		expect(window.intervalMs).toBe(DAY_MS);
	});
});

describe('formatTimeRemaining', () => {
	it('reports expired at or below zero', () => {
		expect(formatTimeRemaining(0)).toBe('expired');
		expect(formatTimeRemaining(-1)).toBe('expired');
	});

	it('formats minutes, hours and days', () => {
		expect(formatTimeRemaining(1)).toBe('1m');
		expect(formatTimeRemaining(90 * 60 * 1000)).toBe('1h 30m');
		expect(formatTimeRemaining(2 * DAY_MS + 3 * 60 * 60 * 1000)).toBe('2d 3h');
	});
});
