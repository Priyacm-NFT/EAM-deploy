import { redisDel, redisGet, redisSetex } from './redis.js';

const LOGIN_ATTEMPTS_TTL = 3600;

function loginAttemptsKey(userId: string): string {
  return `auth:login-attempts:${userId}`;
}

function loginLockKey(userId: string): string {
  return `auth:locked:${userId}`;
}

function passwordResetKey(tokenHash: string): string {
  return `password-reset:${tokenHash}`;
}

function mfaPhoneKey(userId: string): string {
  return `mfa:phone:${userId}`;
}

export async function isAccountLocked(userId: string): Promise<boolean> {
  return (await redisGet(loginLockKey(userId))) !== null;
}

export async function recordFailedLogin(
  userId: string,
  lockoutAfterFailures: number,
  lockoutDurationSeconds: number,
): Promise<number> {
  const attempts = Number(await redisGet(loginAttemptsKey(userId)) ?? '0') + 1;
  await redisSetex(loginAttemptsKey(userId), LOGIN_ATTEMPTS_TTL, String(attempts));
  if (attempts >= lockoutAfterFailures) {
    await redisSetex(loginLockKey(userId), lockoutDurationSeconds, '1');
  }
  return attempts;
}

export async function clearLoginLockout(userId: string): Promise<void> {
  await redisDel(loginAttemptsKey(userId));
  await redisDel(loginLockKey(userId));
}

export async function storePasswordResetToken(
  tokenHash: string,
  userId: string,
  ttlSeconds: number,
): Promise<void> {
  await redisSetex(passwordResetKey(tokenHash), ttlSeconds, userId);
}

export async function consumePasswordResetToken(tokenHash: string): Promise<string | null> {
  const userId = await redisGet(passwordResetKey(tokenHash));
  if (!userId) return null;
  await redisDel(passwordResetKey(tokenHash));
  return userId;
}

export async function storeMfaPhone(userId: string, phone: string): Promise<void> {
  await redisSetex(mfaPhoneKey(userId), 60 * 60 * 24 * 365, phone);
}

export async function getMfaPhone(userId: string): Promise<string | null> {
  return redisGet(mfaPhoneKey(userId));
}

export async function clearMfaPhone(userId: string): Promise<void> {
  await redisDel(mfaPhoneKey(userId));
}
