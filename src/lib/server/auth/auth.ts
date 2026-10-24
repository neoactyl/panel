import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { db } from '#lib/server/db/index.ts';
import { serverEnv } from '#lib/server/config/env.ts';
import { getSetting } from '#lib/server/config/settings.ts';
import { admin } from 'better-auth/plugins';

const BASE_URL = serverEnv.BETTER_AUTH_URL || serverEnv.ORIGIN;

const discordCredentials = () => {
	const clientId = getSetting('discord.clientId').trim() || serverEnv.DISCORD_CLIENT_ID || '';
	const clientSecret =
		getSetting('discord.clientSecret').trim() || serverEnv.DISCORD_CLIENT_SECRET || '';

	return clientId && clientSecret ? { clientId, clientSecret } : null;
};

const buildAuth = (discord: { clientId: string; clientSecret: string } | null) =>
	betterAuth({
		baseURL: BASE_URL,
		secret: serverEnv.BETTER_AUTH_SECRET,
		trustedOrigins: [BASE_URL],
		database: drizzleAdapter(db, { provider: 'sqlite' }),
		emailAndPassword: {
			enabled: true,
			minPasswordLength: 8,
			maxPasswordLength: 128
		},
		session: {
			expiresIn: 60 * 60 * 24 * 7,
			updateAge: 60 * 60 * 24
		},
		rateLimit: {
			enabled: true,
			window: 60,
			max: 100,
			customRules: {
				'/sign-in/email': { window: 60, max: 10 },
				'/sign-up/email': { window: 60, max: 5 }
			}
		},
		advanced: {
			defaultCookieAttributes: {
				sameSite: 'lax',
				httpOnly: true,
				secure: BASE_URL.startsWith('https://')
			}
		},
		socialProviders: discord
			? {
					discord: {
						...discord,
						prompt: 'consent'
					}
				}
			: undefined,
		plugins: [admin(), sveltekitCookies(getRequestEvent)]
	});

type Auth = ReturnType<typeof buildAuth>;

const credentialKey = (discord: ReturnType<typeof discordCredentials>) =>
	discord ? `${discord.clientId}:${discord.clientSecret}` : '';

const initialDiscord = discordCredentials();
let cached: { key: string; auth: Auth } = {
	key: credentialKey(initialDiscord),
	auth: buildAuth(initialDiscord)
};

export let auth = cached.auth;

export const getAuth = () => {
	const discord = discordCredentials();
	const key = credentialKey(discord);

	if (cached.key === key) {
		auth = cached.auth;
		return auth;
	}

	auth = buildAuth(discord);
	cached = { key, auth };
	return auth;
};

export type AuthApi = Auth['api'];
