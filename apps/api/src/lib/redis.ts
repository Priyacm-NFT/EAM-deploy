import { Redis } from 'ioredis';

let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }
  return client;
}

export async function redisSetex(key: string, ttlSeconds: number, value: string): Promise<void> {
  const r = getRedis();
  await r.setex(key, ttlSeconds, value);
}

export async function redisGet(key: string): Promise<string | null> {
  const r = getRedis();
  return r.get(key);
}

export async function redisDel(key: string): Promise<void> {
  const r = getRedis();
  await r.del(key);
}
