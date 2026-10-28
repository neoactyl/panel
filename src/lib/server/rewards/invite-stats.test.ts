import { describe, expect, it } from 'vitest';
import {
	byRecency,
	isInviteClaimable,
	isInviteCounted,
	summarizeInvites,
	type TrackedInvite
} from './invite-stats.ts';

const DAY = 24 * 60 * 60 * 1000;
const DAYS = (count: number) => count * DAY;

const joinedAt = new Date('2026-02-01T12:00:00.000Z');

const invite = (overrides: Partial<TrackedInvite> = {}): TrackedInvite => ({
	discordId: overrides.discordId ?? 'invitee',
	joinedAt,
	stillInServer: true,
	counted: true,
	rewardedAt: null,
	...overrides
});

describe('isInviteCounted (anti-alt)', () => {
	it('counts accounts that already meet the minimum age', () => {
		const accountCreatedAt = new Date(joinedAt.getTime() - DAYS(40));

		expect(isInviteCounted(joinedAt, accountCreatedAt, 30)).toBe(true);
		expect(isInviteCounted(joinedAt, accountCreatedAt, 30)).toBe(true);
	});

	it('rejects accounts created too recently', () => {
		const accountCreatedAt = new Date(joinedAt.getTime() - DAYS(5));

		expect(isInviteCounted(joinedAt, accountCreatedAt, 30)).toBe(false);
	});

	it('treats the boundary as eligible', () => {
		const accountCreatedAt = new Date(joinedAt.getTime() - DAYS(30));

		expect(isInviteCounted(joinedAt, accountCreatedAt, 30)).toBe(true);
	});

	it('counts everything when no minimum age is configured', () => {
		expect(isInviteCounted(joinedAt, joinedAt, 0)).toBe(true);
	});
});

describe('isInviteClaimable (no rejoin reclaim)', () => {
	it('never makes a rewarded invite claimable again after a rejoin', () => {
		const rewarded = invite({ rewardedAt: new Date('2026-02-02T00:00:00.000Z'), stillInServer: true });

		expect(isInviteClaimable(rewarded, true)).toBe(false);
		expect(isInviteClaimable(rewarded, false)).toBe(false);
	});

	it('never promotes an account that failed the age gate later', () => {
		const pending = invite({ counted: false, stillInServer: true });

		expect(isInviteClaimable(pending, false)).toBe(false);
	});

	it('respects the still-member requirement', () => {
		const left = invite({ stillInServer: false, rewardedAt: null });

		expect(isInviteClaimable(left, true)).toBe(false);
		expect(isInviteClaimable(left, false)).toBe(true);
	});
});

describe('summarizeInvites', () => {
	const rows: TrackedInvite[] = [
		invite({ discordId: 'active' }),
		invite({ discordId: 'left', stillInServer: false }),
		invite({ discordId: 'pending', counted: false }),
		invite({ discordId: 'rewarded', rewardedAt: new Date('2026-02-03T00:00:00.000Z') })
	];

	it('splits valid, active, left, pending and rewarded invites', () => {
		expect(summarizeInvites(rows, { requireStillMember: true })).toEqual({
			total: 4,
			valid: 3,
			active: 2,
			left: 1,
			pending: 1,
			rewarded: 1,
			claimable: 1
		});
	});

	it('allows left but unrewarded invites when members need not stay', () => {
		expect(summarizeInvites(rows, { requireStillMember: false }).claimable).toBe(2);
	});

	it('reports an empty history', () => {
		expect(summarizeInvites([], { requireStillMember: true })).toEqual({
			total: 0,
			valid: 0,
			active: 0,
			left: 0,
			pending: 0,
			rewarded: 0,
			claimable: 0
		});
	});
});

describe('byRecency', () => {
	it('orders the most recent join first', () => {
		const older = invite({ discordId: 'older', joinedAt: new Date('2026-01-01T00:00:00.000Z') });
		const newer = invite({ discordId: 'newer', joinedAt: new Date('2026-03-01T00:00:00.000Z') });

		expect([older, newer].sort(byRecency).map((entry) => entry.discordId)).toEqual([
			'newer',
			'older'
		]);
	});
});
