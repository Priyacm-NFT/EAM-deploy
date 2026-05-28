
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
  if (!process.env.DATABASE_URL) {
    console.warn(
      '[test] DATABASE_URL is not set — integration tests will be skipped.\n' +
      '       Make sure your repo-root .env file exists and vitest.config.ts is up to date.',
    );
    return false;
  }
  try {
    const db = createDb(process.env.DATABASE_URL);
    await db.execute(sql`select 1`);
    return true;
  } catch (err) {
    console.warn(
      '[test] Cannot reach Postgres — integration tests will be skipped.\n' +
      '       Start the dev stack first:  docker compose -f docker/docker-compose.dev.yml up -d\n' +
      `       Error: ${String(err)}`,
    );
    return false;
  }
}

/**
 * Check that Redis is reachable.
 * Socket / presence / notification tests depend on Redis being up.
 * When it is not available the tests skip themselves rather than timing out.
 */
export async function isRedisReachable(): Promise<boolean> {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  try {
    // Dynamically import so the module doesn't crash at load time if ioredis
    // is not installed, and so that the connection is always closed afterwards.
    const { Redis } = await import('ioredis');
    const client = new Redis(url, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 3000,
    });
    await client.connect();
    await client.ping();
    await client.quit();
    return true;
  } catch (err) {
    console.warn(
      '[test] Cannot reach Redis — socket/presence tests will be skipped.\n' +
      '       Start the dev stack first:  docker compose -f docker/docker-compose.dev.yml up -d\n' +
      `       Error: ${String(err)}`,
    );
    return false;
  }
}
