import { and, count, desc, eq, notInArray } from 'drizzle-orm';
import type { Database } from '@eam/db';
import { serviceRequests, workOrders } from '@eam/db';

export const CLOSED_SR_STATUSES = ['CLOSED', 'CANCELLED', 'RESOLVED'] as const;
export const CLOSED_WO_STATUSES = ['COMP', 'CLOSE', 'CAN'] as const;

export type DashboardWidget =
  | { id: string; type: 'kpi'; title: string; value: number }
  | {
      id: string;
      type: 'list';
      title: string;
      rows: { id: string; label: string; status: string }[];
    };

export async function getDashboardWidgets(
  db: Database,
  tenantId: string,
  userId: string,
): Promise<DashboardWidget[]> {
  const [openSrRow] = await db
    .select({ value: count() })
    .from(serviceRequests)
    .where(
      and(
        eq(serviceRequests.tenantId, tenantId),
        eq(serviceRequests.requesterId, userId),
        notInArray(serviceRequests.status, [...CLOSED_SR_STATUSES]),
      ),
    );

  const [openWoRow] = await db
    .select({ value: count() })
    .from(workOrders)
    .where(
      and(
        eq(workOrders.tenantId, tenantId),
        eq(workOrders.assignedToUserId, userId),
        notInArray(workOrders.status, [...CLOSED_WO_STATUSES]),
      ),
    );

  const recentWos = await db
    .select({
      id: workOrders.id,
      woNum: workOrders.woNum,
      description: workOrders.description,
      status: workOrders.status,
    })
    .from(workOrders)
    .where(
      and(
        eq(workOrders.tenantId, tenantId),
        notInArray(workOrders.status, [...CLOSED_WO_STATUSES]),
      ),
    )
    .orderBy(desc(workOrders.updatedAt))
    .limit(5);

  return [
    {
      id: 'kpi-open-sr',
      type: 'kpi',
      title: 'My Open SRs',
      value: Number(openSrRow?.value ?? 0),
    },
    {
      id: 'kpi-open-wo',
      type: 'kpi',
      title: 'Open Work Orders',
      value: Number(openWoRow?.value ?? 0),
    },
    {
      id: 'list-recent-wo',
      type: 'list',
      title: 'Recent Work Orders',
      rows: recentWos.map((wo) => ({
        id: wo.id,
        label: `${wo.woNum} — ${wo.description}`,
        status: wo.status,
      })),
    },
  ];
}
