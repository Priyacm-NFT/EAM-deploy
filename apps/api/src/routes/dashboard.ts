import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db, dashboardLayouts } from '@eam/db';
import { authenticate } from '../plugins/auth.js';
import { getDashboardWidgets } from '../lib/dashboard-data.js';

export async function dashboardRoutes(app: FastifyInstance) {

  // Existing — live widget data
  app.get('/dashboard', { preHandler: authenticate }, async (request) => {
    const widgets = await getDashboardWidgets(db, request.user!.tenantId, request.user!.id);
    return { widgets, tenantId: request.user!.tenantId };
  });

  // FIX 7: GET saved layout
  app.get('/dashboard/layout', { preHandler: authenticate }, async (request) => {
    const { id: userId, tenantId, roles: userRoles } = request.user!;

    const [userLayout] = await db
      .select()
      .from(dashboardLayouts)
      .where(and(eq(dashboardLayouts.tenantId, tenantId), eq(dashboardLayouts.userId, userId)))
      .limit(1);
    if (userLayout) return { layout: userLayout.layout, source: 'user' };

    for (const roleId of userRoles ?? []) {
      const [roleLayout] = await db
        .select()
        .from(dashboardLayouts)
        .where(and(eq(dashboardLayouts.tenantId, tenantId), eq(dashboardLayouts.roleId, roleId), eq(dashboardLayouts.isDefault, true)))
        .limit(1);
      if (roleLayout) return { layout: roleLayout.layout, source: 'role_default' };
    }

    return { layout: {}, source: 'empty' };
  });

  // FIX 7: PUT save layout (upsert)
  app.put('/dashboard/layout', { preHandler: authenticate }, async (request, reply) => {
    const { id: userId, tenantId } = request.user!;
    const { layout } = request.body as { layout: Record<string, unknown> };
    if (!layout || typeof layout !== 'object') {
      return reply.status(400).send({ error: 'layout must be an object' });
    }

    const [existing] = await db
      .select({ id: dashboardLayouts.id })
      .from(dashboardLayouts)
      .where(and(eq(dashboardLayouts.tenantId, tenantId), eq(dashboardLayouts.userId, userId)))
      .limit(1);

    if (existing) {
      await db.update(dashboardLayouts).set({ layout }).where(eq(dashboardLayouts.id, existing.id));
    } else {
      await db.insert(dashboardLayouts).values({ tenantId, userId, layout, isDefault: false });
    }
    return reply.send({ ok: true });
  });

  // FIX 7: Admin sets role-default layout
  app.put('/dashboard/layout/role/:roleId', { preHandler: authenticate }, async (request, reply) => {
    const { roleId } = request.params as { roleId: string };
    const { layout } = request.body as { layout: Record<string, unknown> };
    const tenantId = request.user!.tenantId;

    const [existing] = await db
      .select({ id: dashboardLayouts.id })
      .from(dashboardLayouts)
      .where(and(eq(dashboardLayouts.tenantId, tenantId), eq(dashboardLayouts.roleId, roleId), eq(dashboardLayouts.isDefault, true)))
      .limit(1);

    if (existing) {
      await db.update(dashboardLayouts).set({ layout }).where(eq(dashboardLayouts.id, existing.id));
    } else {
      await db.insert(dashboardLayouts).values({ tenantId, roleId, layout, isDefault: true });
    }
    return reply.send({ ok: true });
  });
}
