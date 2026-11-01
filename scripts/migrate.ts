#!/usr/bin/env bun
/**
 * Applies the checked-in Drizzle migrations without needing drizzle-kit.
 *
 * The production image only installs production dependencies, so it cannot run
 * `drizzle-kit migrate`. This script uses the runtime migrator from
 * `drizzle-orm` instead and is safe to run on every container start. It works
 * with local SQLite files and with hosted Turso databases.
 */

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { resolve } from 'node:path';
import { databaseConfig } from '../src/lib/server/db/connection.ts';

let config: ReturnType<typeof databaseConfig>;

try {
	config = databaseConfig(process.env);
} catch (cause) {
	console.error('[db]', cause instanceof Error ? cause.message : cause);
	process.exit(1);
}

const client = createClient(config);
const db = drizzle(client);
const migrationsFolder = resolve(import.meta.dir, '../drizzle');

try {
	await migrate(db, { migrationsFolder });
	console.log(`[db] Migrations applied from ${migrationsFolder}`);
} catch (cause) {
	console.error('[db] Migration failed:', cause);
	process.exitCode = 1;
} finally {
	client.close();
}
