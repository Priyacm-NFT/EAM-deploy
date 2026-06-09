import { and, eq, ne } from 'drizzle-orm';
import type { Database } from '@eam/db';
import { userPresence, users } from '@eam/db';

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
      displayName: users.displayName,
      status: userPresence.status,
      lastSeenAt: userPresence.lastSeenAt,
    })
    .from(userPresence)
    .leftJoin(users, eq(userPresence.userId, users.id))
    .where(
      and(
        eq(userPresence.tenantId, tenantId),
        ne(userPresence.status, 'OFFLINE'),  // show ONLINE, AWAY, DND
      ),
    );
}
