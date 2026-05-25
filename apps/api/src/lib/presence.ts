import { and, eq } from 'drizzle-orm';
import type { Database } from '@eam/db';
import { userPresence } from '@eam/db';

export type PresenceStatus = 'ONLINE' | 'AWAY' | 'DND' | 'OFFLINE';

export async function setUserPresence(
  db: Database,
  params: {
    userId: string;
    tenantId: string;
    status: PresenceStatus;
    socketId?: string | null;
  },
): Promise<void> {
  await db
    .insert(userPresence)
    .values({
      userId: params.userId,
      tenantId: params.tenantId,
      status: params.status,
      socketId: params.socketId ?? null,
      lastSeenAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userPresence.userId,
      set: {
        tenantId: params.tenantId,
        status: params.status,
        socketId: params.socketId ?? null,
        lastSeenAt: new Date(),
      },
    });
}

export async function listOnlineUsers(db: Database, tenantId: string) {
  return db
    .select({
      userId: userPresence.userId,
      status: userPresence.status,
      lastSeenAt: userPresence.lastSeenAt,
    })
    .from(userPresence)
    .where(
      and(eq(userPresence.tenantId, tenantId), eq(userPresence.status, 'ONLINE')),
    );
}
