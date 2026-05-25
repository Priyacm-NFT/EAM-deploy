import type { SessionPolicy } from '@eam/shared';
import { DEFAULT_SESSION_POLICY } from '@eam/shared';

export interface SessionRow {
  expiresAt: Date;
  lastActivityAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export function computeSessionExpiry(
  policy: SessionPolicy = DEFAULT_SESSION_POLICY,
  now = new Date(),
): Date {
  return new Date(now.getTime() + policy.absoluteTimeoutDays * 24 * 60 * 60 * 1000);
}

export function isIdleExpired(
  session: SessionRow,
  policy: SessionPolicy = DEFAULT_SESSION_POLICY,
  now = new Date(),
): boolean {
  const idleMs = policy.idleTimeoutMinutes * 60 * 1000;
  return now.getTime() - session.lastActivityAt.getTime() > idleMs;
}

export function isSessionValid(
  session: SessionRow,
  policy: SessionPolicy = DEFAULT_SESSION_POLICY,
  now = new Date(),
): boolean {
  if (session.revokedAt) return false;
  if (session.expiresAt < now) return false;
  if (isIdleExpired(session, policy, now)) return false;
  return true;
}
