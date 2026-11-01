import { defineConfig } from 'drizzle-kit';
import {
	databaseConfig,
	isRemoteDatabase
} from './src/lib/server/db/connection.ts';

const credentials = databaseConfig(process.env);
const remote = isRemoteDatabase(credentials.url);

const shared = {
	schema: './src/lib/server/db/schema.ts',
	verbose: true,
	strict: true
} as const;

export default defineConfig(
	remote
		? {
				...shared,
				dialect: 'turso',
				dbCredentials: credentials
			}
		: {
				...shared,
				dialect: 'sqlite',
				dbCredentials: { url: credentials.url }
			}
);
