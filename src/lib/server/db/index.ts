import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';
import { databaseConfig } from './connection.ts';

/**
 * Read the connection settings from `process.env` rather than `$app/env` so
 * this module can also be loaded by the production entry point (`server.ts`)
 * and by standalone scripts, which run outside the SvelteKit build.
 *
 * The connection is created lazily because `vite build` evaluates server
 * modules to analyse routes before the runtime environment exists. Importing
 * the module is safe; the first actual query still requires a configured
 * database.
 */
const createDatabase = () => {
	const client = createClient(databaseConfig(process.env));
	return drizzle(client, { schema });
};

type Database = ReturnType<typeof createDatabase>;

let database: Database | undefined;

const current = () => (database ??= createDatabase());

export const db = new Proxy({} as Database, {
	get(_target, property) {
		const instance = current();
		const value = Reflect.get(instance, property, instance);
		return typeof value === 'function' ? value.bind(instance) : value;
	}
});
