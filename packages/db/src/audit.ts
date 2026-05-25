import { auditLogs } from './schema/identity.js';
import type { Database } from './client.js';

export interface AuditParams {
  tenantId?: string | null;
  userId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
}

export async function audit(db: Database, params: AuditParams): Promise<void> {
  await db.insert(auditLogs).values({
    tenantId: params.tenantId ?? null,
    userId: params.userId ?? null,
    action: params.action,
    resource: params.resource,
    resourceId: params.resourceId ?? null,
    ipAddress: params.ipAddress ?? null,
    metadata: params.metadata ?? {},
  });
}
