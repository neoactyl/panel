import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';
import { databaseConfig } from './connection.ts';
import { serverEnv } from '#lib/server/config/env.ts';

const client = createClient(databaseConfig(serverEnv));

export const db = drizzle(client, { schema });
