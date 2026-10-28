import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DATABASE_URL: { description: 'The database connection string.' },
	DATABASE_AUTH_TOKEN: {
		description:
			'Optional auth token for a networked libSQL/Turso database. Required when DATABASE_URL points at a remote database that enforces authentication.',
		schema: (value) => value ?? undefined
	},
	ORIGIN: {
		description: 'The app origin (base URL), e.g. `http://localhost:5173`.'
	},
	BETTER_AUTH_URL: {
		description:
			'Base URL used by Better Auth, e.g. `http://localhost:5173`. Defaults to `ORIGIN` when unset.',
		schema: (value) => value ?? undefined
	},
	BETTER_AUTH_SECRET: {
		description: 'Secret used to sign tokens. For production use 32 characters generated with high entropy. See [Better Auth installation](https://www.better-auth.com/docs/installation).'
	},
	SETTINGS_ENCRYPTION_KEY: {
		description: 'Master key used to encrypt panel API tokens at rest with AES-256-GCM. Use 32 or more random characters.'
	},
	DISCORD_CLIENT_ID: {
		description: 'Discord OAuth client ID, used by Better Auth to enable "Sign in with Discord". Leave unset to disable Discord sign-in.',
		schema: (value) => value ?? undefined
	},
	DISCORD_CLIENT_SECRET: {
		description: 'Discord OAuth client secret, used by Better Auth to enable "Sign in with Discord". Leave unset to disable Discord sign-in.',
		schema: (value) => value ?? undefined
	},
	DISCORD_SHARD_IDS: {
		description:
			'Comma-separated Discord gateway shard IDs this process runs (for example "0" or "1,2"). Defaults to 0.',
		schema: (value) => value ?? undefined
	},
	DISCORD_SHARD_COUNT: {
		description:
			'Total Discord gateway shard count. Must be identical in every bot process. Defaults to the highest shard ID plus one.',
		schema: (value) => value ?? undefined
	},
	DISCORD_EMBED_BOT: {
		description:
			'Whether the web process starts the embedded Discord bot. Set to false when the bot runs in a separate process. Defaults to true.',
		schema: (value) => value ?? undefined
	},
	STRIPE_SECRET_KEY: {
		description:
			'Optional Stripe secret key for credit top-ups. The admin Settings page overrides this value.',
		schema: (value) => value ?? undefined
	},
	STRIPE_WEBHOOK_SECRET: {
		description:
			'Optional Stripe webhook signing secret for /api/auth/stripe/webhook. The admin Settings page overrides this value.',
		schema: (value) => value ?? undefined
	}
});
