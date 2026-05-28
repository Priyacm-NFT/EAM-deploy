import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db, organisations, sites, statusSets, statusTransitions } from '@eam/db';
import { requirePermission } from '../plugins/auth.js';

const guard = { preHandler: requirePermission('admin:config:manage') };

export async function adminOrgRoutes(app: FastifyInstance) {
  // ─── Organisations ───────────────────────────────────────────────────────────

  app.get('/admin/org/organisations', guard, async (request) => {
    return db
      .select()
      .from(organisations)
      .where(eq(organisations.tenantId, request.user!.tenantId))
      .orderBy(organisations.name);
  });

  app.post('/admin/org/organisations', guard, async (request, reply) => {
    const body = request.body as {
      name: string;
      code: string;
      description?: string;
      address?: string;
    };

    const [row] = await db
      .insert(organisations)
      .values({
        tenantId: request.user!.tenantId,
        name: body.name,
        code: body.code,
        description: body.description,
        address: body.address,
      })
      .returning();

    return reply.code(201).send(row);
  });

  app.put('/admin/org/organisations/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      code?: string;
      description?: string;
      address?: string;
      isActive?: boolean;
    };

    const updates: Partial<typeof organisations.$inferInsert> = {};
    if (body.name != null) updates.name = body.name;
    if (body.code != null) updates.code = body.code;
    if (body.description != null) updates.description = body.description;
    if (body.address != null) updates.address = body.address;
    if (body.isActive != null) updates.isActive = body.isActive;
    updates.updatedAt = new Date();

    const [row] = await db
      .update(organisations)
      .set(updates)
      .where(
        and(
          eq(organisations.id, id),
          eq(organisations.tenantId, request.user!.tenantId),
        ),
      )
      .returning();

    if (!row) return reply.code(404).send({ error: 'Organisation not found' });
    return row;
  });

  app.delete('/admin/org/organisations/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };

    // Check for dependent sites
    const [depSite] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.orgId, id), eq(sites.tenantId, request.user!.tenantId)))
      .limit(1);

    if (depSite) {
      return reply.code(409).send({ error: 'Cannot delete organisation with active sites' });
    }

    await db
      .delete(organisations)
      .where(
        and(
          eq(organisations.id, id),
          eq(organisations.tenantId, request.user!.tenantId),
        ),
      );

    return reply.code(204).send();
  });

  // ─── Sites ────────────────────────────────────────────────────────────────────

  app.get('/admin/org/sites', guard, async (request) => {
    return db
      .select()
      .from(sites)
      .where(eq(sites.tenantId, request.user!.tenantId))
      .orderBy(sites.name);
  });

  app.post('/admin/org/sites', guard, async (request, reply) => {
    const body = request.body as {
      name: string;
      siteNum: string;
      orgId?: string;
      description?: string;
      address?: string;
      timezone?: string;
    };

    const [row] = await db
      .insert(sites)
      .values({
        tenantId: request.user!.tenantId,
        name: body.name,
        siteNum: body.siteNum,
        orgId: body.orgId,
        description: body.description,
        address: body.address,
        timezone: body.timezone ?? 'UTC',
      })
      .returning();

    return reply.code(201).send(row);
  });

  app.put('/admin/org/sites/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      siteNum?: string;
      orgId?: string | null;
      description?: string;
      address?: string;
      timezone?: string;
      isActive?: boolean;
    };

    const updates: Partial<typeof sites.$inferInsert> = {};
    if (body.name != null) updates.name = body.name;
    if (body.siteNum != null) updates.siteNum = body.siteNum;
    if ('orgId' in body) updates.orgId = body.orgId ?? undefined;
    if (body.description != null) updates.description = body.description;
    if (body.address != null) updates.address = body.address;
    if (body.timezone != null) updates.timezone = body.timezone;
    if (body.isActive != null) updates.isActive = body.isActive;
    updates.updatedAt = new Date();

    const [row] = await db
      .update(sites)
      .set(updates)
      .where(
        and(
          eq(sites.id, id),
          eq(sites.tenantId, request.user!.tenantId),
        ),
      )
      .returning();

    if (!row) return reply.code(404).send({ error: 'Site not found' });
    return row;
  });

  app.delete('/admin/org/sites/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db
      .delete(sites)
      .where(
        and(
          eq(sites.id, id),
          eq(sites.tenantId, request.user!.tenantId),
        ),
      );
    return reply.code(204).send();
  });

  // ─── Status Sets ──────────────────────────────────────────────────────────────

  app.get('/admin/org/status-sets', guard, async (request) => {
    const sets = await db
      .select()
      .from(statusSets)
      .where(eq(statusSets.tenantId, request.user!.tenantId))
      .orderBy(statusSets.name);

    // Attach transition counts
    const result = await Promise.all(
      sets.map(async (s: typeof sets[0]) => {
        const transitions = await db
          .select()
          .from(statusTransitions)
          .where(eq(statusTransitions.statusSetId, s.id));
        return { ...s, transitionCount: transitions.length };
      }),
    );

    return result;
  });

  app.post('/admin/org/status-sets', guard, async (request, reply) => {
    const body = request.body as {
      name: string;
      label: string;
      entityType: string;
      description?: string;
    };

    const [row] = await db
      .insert(statusSets)
      .values({
        tenantId: request.user!.tenantId,
        name: body.name,
        label: body.label,
        entityType: body.entityType,
        description: body.description,
      })
      .returning();

    return reply.code(201).send(row);
  });

  app.put('/admin/org/status-sets/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      label?: string;
      description?: string;
      isActive?: boolean;
    };

    const updates: Partial<typeof statusSets.$inferInsert> = {};
    if (body.name != null) updates.name = body.name;
    if (body.label != null) updates.label = body.label;
    if (body.description != null) updates.description = body.description;
    if (body.isActive != null) updates.isActive = body.isActive;
    updates.updatedAt = new Date();

    const [row] = await db
      .update(statusSets)
      .set(updates)
      .where(
        and(
          eq(statusSets.id, id),
          eq(statusSets.tenantId, request.user!.tenantId),
        ),
      )
      .returning();

    if (!row) return reply.code(404).send({ error: 'Status set not found' });
    return row;
  });

  app.delete('/admin/org/status-sets/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [ss] = await db
      .select()
      .from(statusSets)
      .where(
        and(
          eq(statusSets.id, id),
          eq(statusSets.tenantId, request.user!.tenantId),
        ),
      )
      .limit(1);

    if (!ss) return reply.code(404).send({ error: 'Status set not found' });
    if (ss.isSystem) return reply.code(403).send({ error: 'System status sets cannot be deleted' });

    // Cascade deletes transitions via FK
    await db.delete(statusSets).where(eq(statusSets.id, id));
    return reply.code(204).send();
  });

  // ─── Status Transitions ───────────────────────────────────────────────────────

  app.get('/admin/org/status-sets/:id/transitions', guard, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [ss] = await db
      .select()
      .from(statusSets)
      .where(
        and(
          eq(statusSets.id, id),
          eq(statusSets.tenantId, request.user!.tenantId),
        ),
      )
      .limit(1);

    if (!ss) return reply.code(404).send({ error: 'Status set not found' });

    return db
      .select()
      .from(statusTransitions)
      .where(eq(statusTransitions.statusSetId, id))
      .orderBy(statusTransitions.fromStatus);
  });

  app.post('/admin/org/status-sets/:id/transitions', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      fromStatus: string;
      toStatus: string;
      label?: string;
      requiresComment?: boolean;
      requiredRole?: string;
      notifyRoles?: string[];
      conditionExpression?: string;
    };

    const [row] = await db
      .insert(statusTransitions)
      .values({
        statusSetId: id,
        fromStatus: body.fromStatus,
        toStatus: body.toStatus,
        label: body.label,
        requiresComment: body.requiresComment ?? false,
        requiredRole: body.requiredRole,
        notifyRoles: body.notifyRoles ?? [],
        conditionExpression: body.conditionExpression,
      })
      .returning();

    return reply.code(201).send(row);
  });

  app.put('/admin/org/status-sets/:id/transitions/:transId', guard, async (request, reply) => {
    const { transId } = request.params as { id: string; transId: string };
    const body = request.body as {
      fromStatus?: string;
      toStatus?: string;
      label?: string;
      requiresComment?: boolean;
      requiredRole?: string;
      notifyRoles?: string[];
      conditionExpression?: string;
    };

    const updates: Partial<typeof statusTransitions.$inferInsert> = {};
    if (body.fromStatus != null) updates.fromStatus = body.fromStatus;
    if (body.toStatus != null) updates.toStatus = body.toStatus;
    if (body.label != null) updates.label = body.label;
    if (body.requiresComment != null) updates.requiresComment = body.requiresComment;
    if (body.requiredRole != null) updates.requiredRole = body.requiredRole;
    if (body.notifyRoles != null) updates.notifyRoles = body.notifyRoles;
    if (body.conditionExpression != null) updates.conditionExpression = body.conditionExpression;

    const [row] = await db
      .update(statusTransitions)
      .set(updates)
      .where(eq(statusTransitions.id, transId))
      .returning();

    if (!row) return reply.code(404).send({ error: 'Transition not found' });
    return row;
  });

  app.delete('/admin/org/status-sets/:id/transitions/:transId', guard, async (request, reply) => {
    const { transId } = request.params as { id: string; transId: string };
    await db.delete(statusTransitions).where(eq(statusTransitions.id, transId));
    return reply.code(204).send();
  });
}
