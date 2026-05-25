import type { Database } from '@eam/db';
import { chatMessages } from '@eam/db';

export async function persistChatMessage(
  db: Database,
  params: {
    tenantId: string;
    fromUserId: string;
    toUserId: string;
    content: string;
    contextEntityType?: string;
    contextEntityId?: string;
  },
) {
  const [msg] = await db
    .insert(chatMessages)
    .values({
      tenantId: params.tenantId,
      fromUserId: params.fromUserId,
      toUserId: params.toUserId,
      content: params.content,
      contextEntityType: params.contextEntityType,
      contextEntityId: params.contextEntityId,
    })
    .returning();
  return msg!;
}
