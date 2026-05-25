import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { createDb } from '@eam/db';

const dbPackageDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/db',
);

export function pushSchema(): void {
  if (!process.env.DATABASE_URL) return;
  execSync('pnpm exec drizzle-kit push --force', {
    cwd: dbPackageDir,
    env: { ...process.env },
    stdio: 'pipe',
  });
}

export async function isDatabaseReachable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    const db = createDb(process.env.DATABASE_URL);
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}
