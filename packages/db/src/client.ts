import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://eam:eam@localhost:5432/eam';

const client = postgres(connectionString, { max: 10 });

export const db = drizzle(client, { schema });

export type Database = ReturnType<typeof drizzle<typeof schema>>;

export function createDb(url?: string): Database {
  const c = postgres(url ?? connectionString, { max: 10 });
  return drizzle(c, { schema });
}