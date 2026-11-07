import { eq } from 'drizzle-orm';
import { getBool } from '#lib/server/config/settings.ts';
import { db } from '#lib/server/db/index.ts';
import { serverBilling } from '#lib/server/db/ops.ts';

export type BillingAccessReason = 'suspended' | 'expired' | 'deleted';

export type BillingAccess = {
	restricted: boolean;
	reason: BillingAccessReason | null;
};

const UNRESTRICTED: BillingAccess = { restricted: false, reason: null };

type AccessBilling = {
	status: string;
	nextRenewalAt: Date | string | number;
};

/**
 * Decide whether a server should be locked down because of its billing state.
 *
 * Suspended and deleted servers are always locked. Active servers whose
 * renewal moment has passed are also locked: the renewal worker may not have
 * run yet, but the server has expired and must not be startable in the
 * meantime. Renewing the server clears the restriction.
 */
export const billingAccessFor = (
	billing: AccessBilling | null | undefined,
	now = Date.now()
): BillingAccess => {
	if (!billing) return UNRESTRICTED;

	if (billing.status === 'deleted') return { restricted: true, reason: 'deleted' };
	if (billing.status === 'suspended') return { restricted: true, reason: 'suspended' };

	if (
		billing.status === 'active' &&
		new Date(billing.nextRenewalAt).getTime() <= now
	) {
		return { restricted: true, reason: 'expired' };
	}

	return UNRESTRICTED;
};

export const getServerBillingAccess = async (serverId: string): Promise<BillingAccess> => {
	// Renewals are an optional feature. Without them every server is operable.
	if (!getBool('credits.enabled')) return UNRESTRICTED;

	const billing = await db
		.select({
			status: serverBilling.status,
			nextRenewalAt: serverBilling.nextRenewalAt
		})
		.from(serverBilling)
		.where(eq(serverBilling.serverId, serverId))
		.get();

	return billingAccessFor(billing);
};
