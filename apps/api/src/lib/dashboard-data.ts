import { and, count, desc, eq, notInArray, sql } from 'drizzle-orm';
import type { Database } from '@eam/db';
import { serviceRequests, workOrders, assets } from '@eam/db';
import { listOnlineUsers } from './presence.js';

export const CLOSED_SR_STATUSES = ['CLOSED', 'CANCELLED', 'RESOLVED'] as const;
export const CLOSED_WO_STATUSES = ['COMP', 'CLOSE', 'CAN'] as const;

export async function getDashboardWidgets(
  db: Database,
  tenantId: string,
  userId: string,
) {
  const [openSrRow, openWoRow, totalAssets, overdueWo] = await Promise.all([
    db.select({ value: count() }).from(serviceRequests)
      .where(and(eq(serviceRequests.tenantId, tenantId), notInArray(serviceRequests.status, [...CLOSED_SR_STATUSES]))),
    db.select({ value: count() }).from(workOrders)
      .where(and(eq(workOrders.tenantId, tenantId), notInArray(workOrders.status, [...CLOSED_WO_STATUSES]))),
    db.select({ value: count() }).from(assets).where(eq(assets.tenantId, tenantId)),
    db.select({ value: count() }).from(workOrders)
      .where(and(eq(workOrders.tenantId, tenantId), eq(workOrders.status, 'WAPPR'))),
  ]);

  const [myWos, recentWos, woByStatus] = await Promise.all([
    db.select({ id: workOrders.id, woNum: workOrders.woNum, description: workOrders.description, status: workOrders.status })
      .from(workOrders)
      .where(and(eq(workOrders.tenantId, tenantId), eq(workOrders.assignedToUserId, userId), notInArray(workOrders.status, [...CLOSED_WO_STATUSES])))
      .orderBy(desc(workOrders.updatedAt)).limit(8),
    db.select({ id: workOrders.id, woNum: workOrders.woNum, description: workOrders.description, status: workOrders.status })
      .from(workOrders)
      .where(and(eq(workOrders.tenantId, tenantId), notInArray(workOrders.status, [...CLOSED_WO_STATUSES])))
      .orderBy(desc(workOrders.createdAt)).limit(8),
    db.select({ status: workOrders.status, cnt: count() })
      .from(workOrders)
      .where(and(eq(workOrders.tenantId, tenantId), notInArray(workOrders.status, ['CLOSE', 'CAN'])))
      .groupBy(workOrders.status),
  ]);

  // Online users for collaboration widget
  const onlineUsers = await listOnlineUsers(db, tenantId);

  return [
    // ── KPI row ──────────────────────────────────────────────────────────────
    {
      id: 'kpi-open-wo',
      type: 'kpi',
      title: 'Open Work Orders',
      value: Number(openWoRow[0]?.value ?? 0),
      link: '/work-orders',
    },
    {
      id: 'kpi-open-sr',
      type: 'kpi',
      title: 'Open Service Requests',
      value: Number(openSrRow[0]?.value ?? 0),
      link: '/service-requests',
    },
    {
      id: 'kpi-assets',
      type: 'kpi',
      title: 'Total Assets',
      value: Number(totalAssets[0]?.value ?? 0),
      link: '/assets',
    },
    {
      id: 'kpi-pending-approval',
      type: 'kpi',
      title: 'Awaiting Approval',
      value: Number(overdueWo[0]?.value ?? 0),
    },
    // ── Shortcut widget ───────────────────────────────────────────────────────
    {
      id: 'shortcuts',
      type: 'shortcut',
      title: 'Quick actions',
      shortcuts: [
        { label: 'New Work Order', href: '/work-orders/new', icon: '🔧' },
        { label: 'New Service Request', href: '/service-requests/new', icon: '📋' },
        { label: 'New Asset', href: '/assets/new', icon: '🏭' },
        { label: 'View Reports', href: '/reports', icon: '📊' },
        { label: 'PM Masters', href: '/pm-masters', icon: '🗓️' },
      ],
    },
    // ── My assignments list ───────────────────────────────────────────────────
    {
      id: 'list-my-wo',
      type: 'list',
      title: 'My Assignments',
      rows: myWos.map((wo) => ({
        id: wo.id,
        label: `${wo.woNum} — ${wo.description}`,
        status: wo.status,
        link: `/work-orders/${wo.id}`,
      })),
    },
    // ── Recent WOs list ────────────────────────────────────────────────────────
    {
      id: 'list-recent-wo',
      type: 'list',
      title: 'Recent Work Orders',
      rows: recentWos.map((wo) => ({
        id: wo.id,
        label: `${wo.woNum} — ${wo.description}`,
        status: wo.status,
        link: `/work-orders/${wo.id}`,
      })),
    },
    // ── WO status chart ────────────────────────────────────────────────────────
    {
      id: 'chart-wo-status',
      type: 'chart',
      title: 'Work Orders by Status',
      chartType: 'bar',
      data: woByStatus.map((r) => ({ label: r.status, value: Number(r.cnt) })),
    },
    // ── Active users widget ────────────────────────────────────────────────────
    {
      id: 'active-users',
      type: 'active_users',
      title: 'Team online now',
      users: onlineUsers.map((u) => ({
        userId: u.userId,
        displayName: u.displayName ?? u.userId,
        status: u.status,
      })),
    },
  ];
}
