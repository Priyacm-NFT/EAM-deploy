import type { FastifyInstance } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import {
  db,
  permits,
  permitChecklistItems,
  permitApprovals,
  audit,
} from '@eam/db';
import { dispatchWebhookEvent } from '../lib/webhooks.js';
import { requirePermission } from '../plugins/auth.js';

const readGuard = { preHandler: requirePermission('permits:read') };
const writeGuard = { preHandler: requirePermission('permits:write') };
const approveGuard = { preHandler: requirePermission('permits:approve') };

export async function permitRoutes(app: FastifyInstance) {
  // ─── List ─────────────────────────────────────────────────────────────────────

  app.get('/permits', readGuard, async (request) => {
    const { status, type, woId } = request.query as { status?: string; type?: string; woId?: string };
    const tid = request.user!.tenantId;

    return db.select().from(permits).where(
      and(
        eq(permits.tenantId, tid),
        status ? eq(permits.status, status as typeof permits.$inferSelect.status) : undefined,
        type ? eq(permits.type, type as typeof permits.$inferSelect.type) : undefined,
        woId ? eq(permits.woId, woId) : undefined,
      ),
    ).orderBy(desc(permits.createdAt));
  });

  // ─── Create ───────────────────────────────────────────────────────────────────

  app.post('/permits', {
    ...writeGuard,
    schema: {
      body: {
        type: 'object',
        required: ['type', 'description'],
        properties: {
          type: { type: 'string', minLength: 1 },
          description: { type: 'string', minLength: 1 },
          woId: { type: 'string' },
          assetId: { type: 'string' },
          locationId: { type: 'string' },
          validFrom: { type: 'string' },
          validTo: { type: 'string' },
          notes: { type: 'string' },
          checklistItems: {
            type: 'array',
            items: {
              type: 'object',
              required: ['category', 'description'],
              properties: {
                category: { type: 'string' },
                description: { type: 'string' },
                sequence: { type: 'number' },
                isRequired: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const tid = request.user!.tenantId;

    // Defensive: treat body as unknown to safely extract fields
    const rawBody = request.body as Record<string, unknown>;
    request.log.info({ rawBody }, 'POST /permits received body');

    const descriptionRaw = rawBody['description'];
    const descriptionStr = typeof descriptionRaw === 'string' ? descriptionRaw.trim() : '';
    if (!descriptionStr) {
      return reply.code(400).send({ error: 'Description is required', debug_received: rawBody });
    }

    const typeStr = typeof rawBody['type'] === 'string' ? rawBody['type'] : '';
    if (!typeStr) {
      return reply.code(400).send({ error: 'Type is required' });
    }

    const count = await db.select({ id: permits.id }).from(permits).where(eq(permits.tenantId, tid));
    const permitNum = `PTW-${String(count.length + 1).padStart(5, '0')}`;

    const [row] = await db.insert(permits).values({
      tenantId: tid,
      permitNum,
      type: typeStr as typeof permits.$inferInsert.type,
      description: descriptionStr,
      woId: typeof rawBody['woId'] === 'string' ? rawBody['woId'] : undefined,
      assetId: typeof rawBody['assetId'] === 'string' ? rawBody['assetId'] : undefined,
      locationId: typeof rawBody['locationId'] === 'string' ? rawBody['locationId'] : undefined,
      validFrom: typeof rawBody['validFrom'] === 'string' && rawBody['validFrom'] ? new Date(rawBody['validFrom'] as string) : undefined,
      validTo: typeof rawBody['validTo'] === 'string' && rawBody['validTo'] ? new Date(rawBody['validTo'] as string) : undefined,
      notes: typeof rawBody['notes'] === 'string' ? rawBody['notes'] : undefined,
      requestedByUserId: request.user!.id,
    }).returning();

    // Create default checklist based on type
    const defaultItems = getDefaultChecklistItems(typeStr);
    const customItems = (Array.isArray(rawBody['checklistItems']) ? rawBody['checklistItems'] : []) as Array<{ category: string; description: string; sequence?: number; isRequired?: boolean }>;
    const allItems = [...defaultItems, ...customItems];

    if (allItems.length > 0) {
      await db.insert(permitChecklistItems).values(
        allItems.map((item, i) => ({
          permitId: row!.id,
          category: (item.category ?? 'GENERAL') as typeof permitChecklistItems.$inferInsert.category,
          description: item.description,
          sequence: ('sequence' in item ? item.sequence : undefined) ?? i,
          isRequired: item.isRequired ?? true,
        })),
      );
    }

    // Create approval steps
    const approvalSteps = getApprovalSteps(typeStr);
    if (approvalSteps.length > 0) {
      await db.insert(permitApprovals).values(
        approvalSteps.map((step, i) => ({
          permitId: row!.id,
          step: i + 1,
          role: step.role,
        })),
      );
    }

    await audit(db, { tenantId: tid, userId: request.user!.id, action: 'CREATE', resource: 'Permit', resourceId: row!.id });
    return reply.code(201).send(row);
  });

  // ─── Get Detail ───────────────────────────────────────────────────────────────

  app.get('/permits/:id', readGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;

    const [permit] = await db.select().from(permits)
      .where(and(eq(permits.id, id), eq(permits.tenantId, tid))).limit(1);
    if (!permit) return reply.code(404).send({ error: 'Permit not found' });

    const [checklist, approvals] = await Promise.all([
      db.select().from(permitChecklistItems).where(eq(permitChecklistItems.permitId, id)).orderBy(permitChecklistItems.sequence),
      db.select().from(permitApprovals).where(eq(permitApprovals.permitId, id)).orderBy(permitApprovals.step),
    ]);

    // Check auto-expiry
    const isExpired = permit.validTo && permit.validTo < new Date() && permit.status === 'ACTIVE';
    if (isExpired) {
      await db.update(permits).set({ status: 'EXPIRED', updatedAt: new Date() })
        .where(eq(permits.id, id));
      permit.status = 'EXPIRED';
    }

    return { ...permit, checklist, approvals };
  });

  // ─── Update ───────────────────────────────────────────────────────────────────

  app.put('/permits/:id', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<typeof permits.$inferInsert>;
    const tid = request.user!.tenantId;

    const [row] = await db.update(permits).set({ ...body, updatedAt: new Date() })
      .where(and(eq(permits.id, id), eq(permits.tenantId, tid))).returning();
    if (!row) return reply.code(404).send({ error: 'Permit not found' });
    return row;
  });

  // ─── Checklist ────────────────────────────────────────────────────────────────

  app.get('/permits/:id/checklist', readGuard, async (request) => {
    const { id } = request.params as { id: string };
    return db.select().from(permitChecklistItems)
      .where(eq(permitChecklistItems.permitId, id)).orderBy(permitChecklistItems.sequence);
  });

  app.post('/permits/:id/checklist', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<typeof permitChecklistItems.$inferInsert>;
    const [row] = await db.insert(permitChecklistItems)
      .values({ permitId: id, ...body } as typeof permitChecklistItems.$inferInsert).returning();
    return reply.code(201).send(row);
  });

  app.put('/permits/:id/checklist/:itemId', writeGuard, async (request, reply) => {
    const { itemId } = request.params as { id: string; itemId: string };
    const body = request.body as Partial<typeof permitChecklistItems.$inferInsert>;
    const [row] = await db.update(permitChecklistItems)
      .set({ ...body, checkedByUserId: request.user!.id, checkedAt: body.checked ? new Date() : undefined })
      .where(eq(permitChecklistItems.id, itemId)).returning();
    if (!row) return reply.code(404).send({ error: 'Checklist item not found' });
    return row;
  });

  app.delete('/permits/:id/checklist/:itemId', writeGuard, async (request, reply) => {
    const { itemId } = request.params as { id: string; itemId: string };
    await db.delete(permitChecklistItems).where(eq(permitChecklistItems.id, itemId));
    return reply.code(204).send();
  });

  // ─── Approve ──────────────────────────────────────────────────────────────────

  app.post('/permits/:id/approve', approveGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { step?: number; comments?: string };
    const tid = request.user!.tenantId;

    const [permit] = await db.select().from(permits)
      .where(and(eq(permits.id, id), eq(permits.tenantId, tid))).limit(1);
    if (!permit) return reply.code(404).send({ error: 'Permit not found' });
    if (!['DRAFT', 'PENDING_APPROVAL'].includes(permit.status)) {
      return reply.code(400).send({ error: 'Permit is not in an approvable state' });
    }

    // Update current pending approval step
    const pendingApprovals = await db.select().from(permitApprovals)
      .where(and(eq(permitApprovals.permitId, id), eq(permitApprovals.status, 'PENDING')))
      .orderBy(permitApprovals.step);

    if (pendingApprovals.length > 0) {
      const currentStep = pendingApprovals[0]!;
      await db.update(permitApprovals).set({
        status: 'APPROVED',
        assignedUserId: request.user!.id,
        comments: body.comments,
        decidedAt: new Date(),
      }).where(eq(permitApprovals.id, currentStep.id));
    }

    // Check if all steps approved
    const remaining = await db.select().from(permitApprovals)
      .where(and(eq(permitApprovals.permitId, id), eq(permitApprovals.status, 'PENDING')));

    const newStatus = remaining.length === 0 ? 'ACTIVE' : 'PENDING_APPROVAL';
    const [updated] = await db.update(permits).set({
      status: newStatus as typeof permits.$inferInsert.status,
      issuedByUserId: remaining.length === 0 ? request.user!.id : permit.issuedByUserId,
      updatedAt: new Date(),
    }).where(eq(permits.id, id)).returning();

    await audit(db, { tenantId: tid, userId: request.user!.id, action: 'APPROVE', resource: 'Permit', resourceId: id });
    if (updated!.status === 'ACTIVE') {
      void dispatchWebhookEvent(tid, 'PERMIT_APPROVED', { permitId: id, permitNum: updated!.permitNum });
    }
    return updated;
  });

  // ─── Reject ───────────────────────────────────────────────────────────────────

  app.post('/permits/:id/reject', approveGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { comments: string };
    const tid = request.user!.tenantId;

    const [updated] = await db.update(permits).set({
      status: 'REJECTED',
      updatedAt: new Date(),
    }).where(and(eq(permits.id, id), eq(permits.tenantId, tid))).returning();

    if (!updated) return reply.code(404).send({ error: 'Permit not found' });

    // Mark current pending step rejected
    await db.update(permitApprovals).set({
      status: 'REJECTED',
      assignedUserId: request.user!.id,
      comments: body.comments,
      decidedAt: new Date(),
    }).where(and(eq(permitApprovals.permitId, id), eq(permitApprovals.status, 'PENDING')));

    await audit(db, { tenantId: tid, userId: request.user!.id, action: 'REJECT', resource: 'Permit', resourceId: id, metadata: { comments: body.comments } });
    return updated;
  });

  // ─── Close ────────────────────────────────────────────────────────────────────

  app.post('/permits/:id/close', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;

    const [updated] = await db.update(permits).set({ status: 'CLOSED', updatedAt: new Date() })
      .where(and(eq(permits.id, id), eq(permits.tenantId, tid))).returning();
    if (!updated) return reply.code(404).send({ error: 'Permit not found' });

    await audit(db, { tenantId: tid, userId: request.user!.id, action: 'CLOSE', resource: 'Permit', resourceId: id });
    return updated;
  });

  // ─── Submit for approval ──────────────────────────────────────────────────────

  app.post('/permits/:id/submit', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;

    const [permit] = await db.select().from(permits)
      .where(and(eq(permits.id, id), eq(permits.tenantId, tid))).limit(1);
    if (!permit) return reply.code(404).send({ error: 'Permit not found' });
    if (permit.status !== 'DRAFT') return reply.code(400).send({ error: 'Only DRAFT permits can be submitted' });

    // Check all required checklist items are completed
    const unchecked = await db.select({ id: permitChecklistItems.id }).from(permitChecklistItems)
      .where(and(
        eq(permitChecklistItems.permitId, id),
        eq(permitChecklistItems.isRequired, true),
        eq(permitChecklistItems.checked, false),
      ));

    if (unchecked.length > 0) {
      return reply.code(400).send({ error: `${unchecked.length} required checklist item(s) are not completed` });
    }

    const [updated] = await db.update(permits).set({ status: 'PENDING_APPROVAL', updatedAt: new Date() })
      .where(eq(permits.id, id)).returning();

    return updated;
  });
}

function getDefaultChecklistItems(type: string): Array<{ category: string; description: string; isRequired: boolean }> {
  const base = [
    { category: 'PPE', description: 'Appropriate PPE identified and worn', isRequired: true },
    { category: 'GENERAL', description: 'Area inspected and safe to proceed', isRequired: true },
    { category: 'GENERAL', description: 'Emergency contacts available', isRequired: true },
  ];

  const typeSpecific: Record<string, Array<{ category: string; description: string; isRequired: boolean }>> = {
    HOT_WORK: [
      { category: 'GENERAL', description: 'Combustible materials cleared from 10m radius', isRequired: true },
      { category: 'GAS_TEST', description: 'Flammable gas test performed (< 10% LEL)', isRequired: true },
      { category: 'JSA', description: 'Fire extinguisher positioned at work site', isRequired: true },
      { category: 'GENERAL', description: 'Fire watch assigned', isRequired: true },
    ],
    CONFINED_SPACE: [
      { category: 'GAS_TEST', description: 'Oxygen level tested (19.5–23.5%)', isRequired: true },
      { category: 'GAS_TEST', description: 'Toxic gas levels tested', isRequired: true },
      { category: 'ISOLATION', description: 'All energy sources isolated (LOTO)', isRequired: true },
      { category: 'LOTO', description: 'Rescue plan and rescue team in place', isRequired: true },
      { category: 'JSA', description: 'Continuous atmospheric monitoring in place', isRequired: true },
    ],
    ELECTRICAL: [
      { category: 'ISOLATION', description: 'Circuit de-energised and LOTO applied', isRequired: true },
      { category: 'ISOLATION', description: 'Voltage verified with approved tester', isRequired: true },
      { category: 'LOTO', description: 'All isolation points locked and tagged', isRequired: true },
    ],
    HEIGHT: [
      { category: 'PPE', description: 'Fall arrest harness inspected and worn', isRequired: true },
      { category: 'GENERAL', description: 'Scaffold / platform inspected and tagged', isRequired: true },
      { category: 'GENERAL', description: 'Exclusion zone established below work area', isRequired: true },
    ],
    EXCAVATION: [
      { category: 'GENERAL', description: 'Underground services located and marked', isRequired: true },
      { category: 'GENERAL', description: 'Shoring / sloping plan in place', isRequired: true },
      { category: 'GAS_TEST', description: 'Gas detection active during excavation', isRequired: false },
    ],
    CHEMICAL: [
      { category: 'PPE', description: 'Chemical-resistant PPE worn', isRequired: true },
      { category: 'GENERAL', description: 'SDS reviewed and available on site', isRequired: true },
      { category: 'GENERAL', description: 'Spill kit positioned at work site', isRequired: true },
      { category: 'GENERAL', description: 'Eyewash station available', isRequired: true },
    ],
  };

  return [...base, ...(typeSpecific[type] ?? [])];
}

function getApprovalSteps(type: string): Array<{ role: string }> {
  if (['HOT_WORK', 'CONFINED_SPACE', 'ELECTRICAL'].includes(type)) {
    return [{ role: 'supervisor' }, { role: 'safety_officer' }];
  }
  return [{ role: 'supervisor' }];
}
