import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DATABASE_URL: { description: 'The database connection string.' },
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
