/**
 * Resolve database connection settings from the environment.
 *
 * Neoactyl talks to libSQL, so the same code works with a local SQLite file and
 * with a hosted [Turso](https://turso.tech/) database. Turso's own environment
 * variable names are accepted as aliases, which makes it possible to use the
 * values from `turso db show` / `turso db tokens create` (or a hosting
 * integration) without renaming them.
 *
 * This module deliberately has no dependencies so it can also be imported by
 * standalone scripts and by `drizzle.config.ts`, which run outside SvelteKit.
 */

export type DatabaseEnv = {
	DATABASE_URL?: string;
	DATABASE_AUTH_TOKEN?: string;
	TURSO_DATABASE_URL?: string;
	TURSO_AUTH_TOKEN?: string;
};

const clean = (value: string | undefined) => {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
};

/** The connection string, preferring `DATABASE_URL` over `TURSO_DATABASE_URL`. */
export const resolveDatabaseUrl = (env: DatabaseEnv) =>
	clean(env.DATABASE_URL) ?? clean(env.TURSO_DATABASE_URL);

/** The auth token, preferring `DATABASE_AUTH_TOKEN` over `TURSO_AUTH_TOKEN`. */
export const resolveDatabaseAuthToken = (env: DatabaseEnv) =>
	clean(env.DATABASE_AUTH_TOKEN) ?? clean(env.TURSO_AUTH_TOKEN);

/** Whether the connection string points at a networked libSQL/Turso server. */
export const isRemoteDatabase = (url: string | undefined) =>
	Boolean(url && /^(?:libsql|https?|wss?):\/\//i.test(url));

/**
 * Build the options passed to `@libsql/client`.
 *
 * Throws a readable error when no connection string is configured. A missing
 * auth token is left to the client so that token-less self-hosted libSQL
 * servers keep working.
 */
export const databaseConfig = (env: DatabaseEnv) => {
	const url = resolveDatabaseUrl(env);

	if (!url) {
		throw new Error(
			'DATABASE_URL (or TURSO_DATABASE_URL) is not set. Add it to your environment before starting Neoactyl.'
		);
	}

	const authToken = resolveDatabaseAuthToken(env);

	return {
		url,
		...(authToken ? { authToken } : {})
	};
};
