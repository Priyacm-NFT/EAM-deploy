import type { Redis } from 'ioredis';
import { shouldRateLimit as shouldRateLimitCount } from './recipients.js';

export interface RateLimitConfig {
  max: number;
  windowSeconds: number;
  overflowMode: 'digest' | 'drop';
}

export function parseRateLimitConfig(
  raw: Record<string, unknown> | null | undefined,
): RateLimitConfig | null {
  if (!raw) return null;
  const max = Number(raw.max);
  const windowMinutes = Number(raw.windowMinutes);
  const windowSeconds = Number(
    raw.windowSeconds ?? (Number.isFinite(windowMinutes) ? windowMinutes * 60 : 60),
  );
  if (!Number.isFinite(max) || max <= 0) return null;
  const overflowMode = raw.overflowMode === 'drop' ? 'drop' : 'digest';
  return {
    max,
    windowSeconds: Number.isFinite(windowSeconds) && windowSeconds > 0 ? windowSeconds : 60,
    overflowMode,
  };
}

const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

export function checkInMemoryRateLimit(
  key: string,
  max: number,
  windowSeconds: number,
): { allowed: boolean; count: number } {
  const now = Date.now();
  const bucket = memoryBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, count: 1 };
  }
  bucket.count += 1;
  return { allowed: !shouldRateLimitCount(bucket.count, max, windowSeconds), count: bucket.count };
}

export async function checkRedisRateLimit(
  redis: Redis,
  key: string,
  max: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; count: number }> {
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }
  return { allowed: count <= max, count };
}

export function resetInMemoryRateLimits(): void {
  memoryBuckets.clear();
}
