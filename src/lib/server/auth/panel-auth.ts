import { eq } from 'drizzle-orm';
import { getAdapter } from '#lib/server/panel/adapter.ts';
import { db } from '#lib/server/db/index.ts';
import { panelAccount } from '#lib/server/db/schema.ts';
import { fetchWithTimeout } from '#lib/http.ts';
import { getBool, getPanelConfig } from '#lib/server/config/settings.ts';

export type PanelIdentity = {
	id: string;
	email: string;
	username: string;
};

export class PanelAuthError extends Error {
	constructor(
		message: string,
		readonly code: 'INVALID' | 'EXISTS' | 'UNAVAILABLE'
	) {
		super(message);
		this.name = 'PanelAuthError';
	}
}

const accountCapabilities = () => getAdapter().capabilities.accounts;

/**
 * Whether this adapter supports panel accounts at all. This is intentionally
 * independent of `panel.linkAccounts`: that setting only controls whether
 * accounts are linked automatically during login.
 */
export const panelAuthEnabled = () => accountCapabilities().link;

/** Whether panel accounts are linked automatically when a user signs in. */
export const panelAutoLinkEnabled = () =>
	panelAuthEnabled() && getBool('panel.linkAccounts');

export const panelAccountCreationEnabled = () => {
	const capabilities = accountCapabilities();
	return panelAuthEnabled() && capabilities.create && getBool('panel.createAccounts');
};

const endpoint = (path: string) => {
	const { url } = getPanelConfig();
	if (!url) throw new PanelAuthError('The panel is not configured.', 'UNAVAILABLE');
	return new URL(path, url).toString();
};

const panelFetch = async (path: string, init: RequestInit = {}) => {
	try {
		return await fetchWithTimeout(endpoint(path), init);
	} catch (cause) {
		if (cause instanceof PanelAuthError) throw cause;
		throw new PanelAuthError('The panel is currently unavailable.', 'UNAVAILABLE');
	}
};

type PanelUserResponse = {
	user?: { uuid?: string; email?: string; username?: string };
	type?: string;
};

const identityFrom = (body: PanelUserResponse): PanelIdentity | null => {
	if (!body.user?.uuid || !body.user.email) return null;

	return {
		id: body.user.uuid,
		email: body.user.email,
		username: body.user.username ?? body.user.email.split('@')[0] ?? body.user.email
	};
};

export const verifyPanelLogin = async (
	email: string,
	password: string
): Promise<PanelIdentity | null> => {
	if (!panelAuthEnabled()) return null;

	const response = await panelFetch('/api/auth/login', {
		method: 'POST',
		headers: { 'content-type': 'application/json', accept: 'application/json' },
		body: JSON.stringify({ user: email, password })
	});

	if (response.status === 429) {
		throw new PanelAuthError('Too many panel login attempts. Try again shortly.', 'UNAVAILABLE');
	}

	if (!response.ok) return null;

	const body = (await response.json().catch(() => ({}))) as PanelUserResponse;
	return identityFrom(body);
};

const findPanelUser = async (email: string): Promise<PanelIdentity | null> => {
	const { url: panelUrl, token } = getPanelConfig();
	if (!token) return null;

	const url = new URL('/api/admin/users', panelUrl);
	url.searchParams.set('page', '1');
	url.searchParams.set('per_page', '50');
	url.searchParams.set('search', email);

	const response = await panelFetch(url.pathname + url.search, {
		headers: { authorization: `Bearer ${token}`, accept: 'application/json' }
	});

	if (!response.ok) return null;

	const body = (await response.json().catch(() => null)) as {
		users?: { data?: PanelUserResponse['user'][] };
	} | null;

	const match = body?.users?.data?.find(
		(user) => user?.email?.toLowerCase() === email.toLowerCase()
	);

	if (!match?.uuid || !match.email) return null;

	return {
		id: match.uuid,
		email: match.email,
		username: match.username ?? match.email.split('@')[0] ?? match.email
	};
};

const usernameFor = (name: string, email: string) => {
	const base = (name || email.split('@')[0] || 'user')
		.toLowerCase()
		.replace(/[^a-z0-9_]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 24);

	return `${base || 'user'}_${crypto.randomUUID().slice(0, 6)}`;
};

export const registerPanelUser = async (
	name: string,
	email: string,
	password: string
): Promise<PanelIdentity> => {
	if (!panelAccountCreationEnabled()) {
		throw new PanelAuthError(
			'This panel does not support automatic account creation.',
			'UNAVAILABLE'
		);
	}

	const { token } = getPanelConfig();

	if (!token) {
		throw new PanelAuthError('The panel is not configured.', 'UNAVAILABLE');
	}

	const existing = await findPanelUser(email);

	if (existing) {
		const verified = await verifyPanelLogin(email, password);
		if (!verified) {
			throw new PanelAuthError(
				'An account with this email already exists in the panel. Use your existing panel password.',
				'EXISTS'
			);
		}
		return verified;
	}

	const [nameFirst, ...nameRest] = name.trim().split(/\s+/);
	const response = await panelFetch('/api/admin/users', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			accept: 'application/json',
			authorization: `Bearer ${token}`
		},
		body: JSON.stringify({
			username: usernameFor(name, email),
			email,
			password,
			name_first: nameFirst || null,
			name_last: nameRest.join(' ') || null,
			admin: false,
			frozen: false,
			suspended: false,
			verify_email: true,
			send_email: false,
			language: 'en'
		})
	});

	if (response.ok) {
		const body = (await response.json().catch(() => ({}))) as PanelUserResponse;
		const identity = identityFrom(body);
		if (identity) return identity;
	}

	if (response.status === 429) {
		throw new PanelAuthError('Too many registration attempts. Try again shortly.', 'UNAVAILABLE');
	}

	const verified = await verifyPanelLogin(email, password);
	if (verified) return verified;

	throw new PanelAuthError(
		'Could not create the panel account. The email may already be in use with a different password.',
		'EXISTS'
	);
};

export const linkPanelAccount = async (userId: string, identity: PanelIdentity) => {
	await db
		.insert(panelAccount)
		.values({
			userId,
			panelUserId: identity.id,
			panelEmail: identity.email
		})
		.onConflictDoUpdate({
			target: panelAccount.userId,
			set: {
				panelUserId: identity.id,
				panelEmail: identity.email
			}
		})
		.run();
};

export const getPanelAccount = async (userId: string) => {
	return db
		.select({
			panelUserId: panelAccount.panelUserId,
			panelEmail: panelAccount.panelEmail
		})
		.from(panelAccount)
		.where(eq(panelAccount.userId, userId))
		.get();
};

export const getPanelUserId = async (userId: string): Promise<string | undefined> => {
	const row = await db
		.select({ panelUserId: panelAccount.panelUserId })
		.from(panelAccount)
		.where(eq(panelAccount.userId, userId))
		.get();

	return row?.panelUserId;
};

export const getPanelAccountOwner = async (panelUserId: string): Promise<string | undefined> => {
	const row = await db
		.select({ userId: panelAccount.userId })
		.from(panelAccount)
		.where(eq(panelAccount.panelUserId, panelUserId))
		.get();

	return row?.userId;
};
