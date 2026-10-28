import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';
import { serverEnv } from '#lib/server/config/env.ts';

const client = createClient({
  url: serverEnv.DATABASE_URL,
  ...(serverEnv.DATABASE_AUTH_TOKEN
    ? { authToken: serverEnv.DATABASE_AUTH_TOKEN }
    : {}),
});

export const db = drizzle(client, { schema });
