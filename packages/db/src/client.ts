import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://eam:eam@localhost:5432/eam';

const client = postgres(connectionString, { max: 10 });

export const db = drizzle(client, { schema });
export type Database = typeof db;

export function createDb(url?: string) {
  const c = postgres(url ?? connectionString, { max: 10 });
  return drizzle(c, { schema });
}
