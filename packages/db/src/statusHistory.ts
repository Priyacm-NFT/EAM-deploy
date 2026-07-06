import { statusHistory } from './schema/entities.js';
import type { Database } from './client.js';

// FIX: shared helper for the universal status-history log — mirrors the
// existing audit() helper's shape/call pattern deliberately, so any route
// that already knows how to call audit(db, {...}) can call this the same
// way. One insert per actual status change; callers are responsible for
// only calling this when fromStatus !== toStatus (matches how the
// existing "auto-start matching workflow on status transition" checks
// already gate their own calls in assets.ts/work-orders.ts).

export interface StatusHistoryParams {
  tenantId: string;
  entityType: string;
  entityId: string;
  fromStatus?: string | null;
  toStatus: string;
  changedByUserId?: string | null;
  notes?: string | null;
}

export async function recordStatusHistory(db: Database, params: StatusHistoryParams): Promise<void> {
  await db.insert(statusHistory).values({
    tenantId: params.tenantId,
    entityType: params.entityType,
    entityId: params.entityId,
    fromStatus: params.fromStatus ?? null,
    toStatus: params.toStatus,
    changedByUserId: params.changedByUserId ?? null,
    notes: params.notes ?? null,
  });
}
