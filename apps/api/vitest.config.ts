import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Parse the repo-root .env file into a plain object.
 * We avoid a dotenv dependency by reading the file with Node's built-in fs.
 * These values are injected into process.env before any test file is imported,
 * which is exactly what vitest's `test.env` option does.
 */
function parseEnvFile(filePath: string): Record<string, string> {
  try {
    const lines = readFileSync(filePath, 'utf-8').split('\n');
    const result: Record<string, string> = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key) result[key] = val;
    }
    return result;
  } catch {
    // .env not found — tests that need DB/Redis will skip themselves gracefully
    return {};
  }
}

// Resolve path: apps/api → repo root (two levels up)
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

const dotenv = parseEnvFile(path.join(repoRoot, '.env'));

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30000,   // socket tests need a bit more time
    hookTimeout: 30000,
    // Inject all .env variables so isDatabaseReachable() and isRedisReachable()
    // can see DATABASE_URL and REDIS_URL without the developer having to
    // export them manually before running `pnpm test`.
    env: dotenv,
    // Silence Fastify logger noise in test output
    silent: false,
  },
});

