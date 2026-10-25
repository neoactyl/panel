export const DAY_MS = 24 * 60 * 60 * 1000;

export const RENEWAL_WINDOW_FRACTION = 0.02;

type RenewalBilling = {
	status: string;
	intervalDays: number;
	nextRenewalAt: Date | string | number;
};

export type RenewalWindow = {
	canRenew: boolean;
	remainingMs: number;
	intervalMs: number;
	opensAt: Date;
};

export const getRenewalWindow = (
	billing: RenewalBilling,
	now = Date.now()
): RenewalWindow => {
	const expiresAt = new Date(billing.nextRenewalAt).getTime();
	const intervalMs = Math.max(1, Math.floor(billing.intervalDays)) * DAY_MS;
	const remainingMs = expiresAt - now;
	const opensAt = new Date(expiresAt - intervalMs * RENEWAL_WINDOW_FRACTION);
	const canRenew =
		billing.status === 'suspended' ||
		(billing.status === 'active' && remainingMs <= intervalMs * RENEWAL_WINDOW_FRACTION);

	return { canRenew, remainingMs, intervalMs, opensAt };
};

export const formatTimeRemaining = (remainingMs: number) => {
	if (remainingMs <= 0) return 'expired';

	const minutes = Math.max(1, Math.ceil(remainingMs / 60000));
	const days = Math.floor(minutes / 1440);
	const hours = Math.floor((minutes % 1440) / 60);
	const mins = minutes % 60;

	if (days > 0) return `${days}d ${hours}h`;
	if (hours > 0) return `${hours}h ${mins}m`;
	return `${mins}m`;
};
