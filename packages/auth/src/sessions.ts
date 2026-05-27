import { eq, and, isNull, desc, inArray } from 'drizzle-orm';
import type { Database } from '@eam/db';
import { sessions } from '@eam/db';
import type { SessionPolicy } from '@eam/shared';
import { isSessionValid } from './session-policy.js';

export async function revokeAllSessions(db: Database, userId: string): Promise<number> {
  const result = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  return result.length;
}

export async function revokeSessionById(db: Database, sessionId: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
}

export async function enforceConcurrentLimit(
  db: Database,
  userId: string,
  maxConcurrent: number,
): Promise<void> {
  const active = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .orderBy(desc(sessions.createdAt));

  const toRevoke = active.slice(maxConcurrent);
  if (toRevoke.length === 0) return;

  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      inArray(
        sessions.id,
        toRevoke.map((s) => s.id),
      ),
    );
}

export async function touchSession(db: Database, sessionId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ lastActivityAt: new Date() })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

export async function getSessionByTokenHash(
  db: Database,
  tokenHash: string,
): Promise<typeof sessions.$inferSelect | undefined> {
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)))
    .limit(1);
  return session;
}

export async function getSessionById(
  db: Database,
  sessionId: string,
): Promise<typeof sessions.$inferSelect | undefined> {
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  return session;
}

export function validateStoredSession(
  session: typeof sessions.$inferSelect,
  policy: SessionPolicy,
): boolean {
  return isSessionValid(
    {
      expiresAt: session.expiresAt,
      lastActivityAt: session.lastActivityAt ?? session.createdAt,
      revokedAt: session.revokedAt,
      createdAt: session.createdAt,
    },
    policy,
  );
}
