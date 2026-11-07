import { describe, expect, it } from 'vitest';
import { billingAccessFor } from './access.ts';

const now = new Date('2026-01-01T00:00:00.000Z').getTime();

describe('billingAccessFor', () => {
	it('leaves active servers alone before their renewal date', () => {
		expect(
			billingAccessFor(
				{ status: 'active', nextRenewalAt: new Date(now + 60_000) },
				now
			)
		).toEqual({ restricted: false, reason: null });
	});

	it('locks active servers whose renewal date has passed', () => {
		expect(
			billingAccessFor(
				{ status: 'active', nextRenewalAt: new Date(now) },
				now
			)
		).toEqual({ restricted: true, reason: 'expired' });
	});

	it('locks suspended servers and keeps them renew-able', () => {
		expect(
			billingAccessFor(
				{ status: 'suspended', nextRenewalAt: new Date(now + 60_000) },
				now
			)
		).toEqual({ restricted: true, reason: 'suspended' });
	});

	it('locks deleted servers', () => {
		expect(
			billingAccessFor(
				{ status: 'deleted', nextRenewalAt: new Date(now + 60_000) },
				now
			)
		).toEqual({ restricted: true, reason: 'deleted' });
	});

	it('does not restrict servers without billing', () => {
		expect(billingAccessFor(null, now)).toEqual({ restricted: false, reason: null });
	});
});
