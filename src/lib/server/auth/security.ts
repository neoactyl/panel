import { and, eq, gte, sql } from 'drizzle-orm';
import { fetchWithTimeout } from '#lib/http.ts';
import { db } from '#lib/server/db/index.ts';
import { activityLog } from '#lib/server/db/ops.ts';
import { logActivity } from '#lib/server/system/logs.ts';
import { getBool, getNumber } from '#lib/server/config/settings.ts';

export type SecurityCode = 'REGISTRATION_BLOCKED' | 'VPN_BLOCKED' | 'LOGIN_LOCKED';

export class SecurityError extends Error {
	code: SecurityCode;

	constructor(message: string, code: SecurityCode) {
		super(message);
		this.name = 'SecurityError';
		this.code = code;
	}
}

const failures = new Map<string, number[]>();
const proxyCache = new Map<string, { expires: number; blocked: boolean; reason?: string }>();
const PROXY_TTL = 6 * 60 * 60 * 1000;

export const getClientIp = (event: { getClientAddress: () => string }): string => {
	try {
		return normalizeIp(event.getClientAddress());
	} catch {
		return 'unknown';
	}
};

const normalizeIp = (value: string): string => {
	const ip = value.trim();
	if (ip.startsWith('::ffff:')) return ip.slice(7);
	return ip;
};

const isPrivateAddress = (ip: string): boolean => {
	if (!ip || ip === 'unknown' || ip === '::1' || ip === '127.0.0.1') return true;
	if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('169.254.')) return true;
	if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
	if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80:')) return true;
	return false;
};

const secondsAgo = (seconds: number) => new Date(Date.now() - seconds * 1000);

export const checkVpnOrProxy = async (
	ip: string
): Promise<{ blocked: boolean; reason?: string }> => {
	if (!getBool('security.blockVpn')) return { blocked: false };
	if (isPrivateAddress(ip)) return { blocked: false };

	const cached = proxyCache.get(ip);
	if (cached && cached.expires > Date.now()) return cached;

	try {
		const response = await fetchWithTimeout(
			`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,proxy,hosting`,
			{},
			3000
		);

		if (!response.ok) throw new Error(`Lookup failed with ${response.status}`);

		const body = (await response.json()) as {
			status?: string;
			proxy?: boolean;
			hosting?: boolean;
		};

		const blocked = body.status === 'success' && Boolean(body.proxy || body.hosting);
		const result = {
			blocked,
			reason: blocked ? 'VPN, proxy or hosting network detected.' : undefined,
			expires: Date.now() + PROXY_TTL
		};

		proxyCache.set(ip, result);
		return result;
	} catch {
		return { blocked: false };
	}
};

export const assertRegistrationAllowed = async (ip: string) => {
	if (isPrivateAddress(ip)) return;

	const limit = getNumber('security.maxAccountsPerIp');
	if (limit <= 0) return;

	const windowHours = Math.max(1, getNumber('security.registrationWindowHours'));
	const since = secondsAgo(windowHours * 3600);

	const row = await db
		.select({ count: sql<number>`count(*)` })
		.from(activityLog)
		.where(and(eq(activityLog.action, 'auth.register'), eq(activityLog.ip, ip), gte(activityLog.createdAt, since)))
		.get();

	if ((row?.count ?? 0) >= limit) {
		throw new SecurityError(
			`Too many accounts have been created from this network. The limit is ${limit} every ${windowHours} hours.`,
			'REGISTRATION_BLOCKED'
		);
	}

	const proxy = await checkVpnOrProxy(ip);
	if (proxy.blocked) {
		throw new SecurityError(
			proxy.reason ?? 'VPN and proxy connections cannot register.',
			'VPN_BLOCKED'
		);
	}
};

export const recordRegistration = (ip: string, userId: string, email: string) => {
	logActivity({
		userId,
		action: 'auth.register',
		severity: 'info',
		message: `Account registered for ${email}.`,
		ip,
		metadata: { email }
	});
};

export const assertLoginAllowed = (ip: string) => {
	const max = getNumber('security.maxFailedLogins');
	if (max <= 0) return;

	const windowMs = Math.max(1, getNumber('security.lockoutMinutes')) * 60 * 1000;
	const now = Date.now();
	const recent = (failures.get(ip) ?? []).filter((at) => now - at < windowMs);
	failures.set(ip, recent);

	if (recent.length >= max) {
		const unlockIn = Math.ceil((windowMs - (now - recent[0])) / 60000);
		throw new SecurityError(
			`Too many failed sign-in attempts. Try again in ${Math.max(1, unlockIn)} minute(s).`,
			'LOGIN_LOCKED'
		);
	}
};

export const recordLoginFailure = (ip: string, email: string) => {
	const windowMs = Math.max(1, getNumber('security.lockoutMinutes')) * 60 * 1000;
	const now = Date.now();
	const recent = (failures.get(ip) ?? []).filter((at) => now - at < windowMs);
	recent.push(now);
	failures.set(ip, recent);

	logActivity({
		action: 'auth.login.failed',
		severity: 'warning',
		message: `Failed sign-in attempt for ${email || 'unknown email'}.`,
		ip,
		metadata: { email }
	});
};

export const clearLoginFailures = (ip: string) => {
	failures.delete(ip);
};
