import type { FastifyInstance } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import {
  db,
  permits,
  permitChecklistItems,
  permitApprovals,
  permitTypesConfig,
  audit,
} from '@eam/db';
import { dispatchWebhookEvent } from '../lib/webhooks.js';
import { entityDefinitions, fieldDefinitions } from '@eam/db';
import { FieldRulesService } from '@eam/config-engine';
import { requirePermission } from '../plugins/auth.js';
import { nextAutoRecordCode } from '@eam/shared';

const readGuard = { preHandler: requirePermission('permits:read') };
const writeGuard = { preHandler: requirePermission('permits:write') };
const approveGuard = { preHandler: requirePermission('permits:approve') };

export async function permitRoutes(app: FastifyInstance) {

// ── Custom field validation helper ──────────────────────────────────────────
async function validateCustomFields(
  tid: string,
  entityName: string,
  data: Record<string, unknown>,
  userRoles: string[],
  currentStatus?: string,
): Promise<{ valid: boolean; errors: Array<{ field_key: string; message: string }> }> {
  const [entity] = await db
    .select()
    .from(entityDefinitions)
    .where(and(eq(entityDefinitions.tenantId, tid), eq(entityDefinitions.name, entityName)))
    .limit(1);
  if (!entity) return { valid: true, errors: [] };

  const fields = await db
    .select()
    .from(fieldDefinitions)
    .where(and(eq(fieldDefinitions.entityId, entity.id), eq(fieldDefinitions.tenantId, tid), eq(fieldDefinitions.isActive, true)));

  const svc = new FieldRulesService(db);
  const rules = await svc.loadRules(tid, entity.id, currentStatus);
  return svc.validateWrite(fields, rules, data, userRoles);
}
// ─────────────────────────────────────────────────────────────────────────────

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

    // Treat body as unknown to safely extract fields
    const rawBody = request.body as Record<string, unknown>;
    request.log.info({ rawBody }, 'POST /permits received body');

    // ── Custom field validation ──────────────────────────────────────────────
    const customDataRaw = typeof rawBody['customData'] === 'object' && rawBody['customData'] ? rawBody['customData'] as Record<string, unknown> : {};
    const validation = await validateCustomFields(tid, 'Permit', { ...rawBody, ...customDataRaw }, request.user!.roles ?? []);
    if (!validation.valid) return reply.code(422).send({ error: 'Validation failed', errors: validation.errors });
    // ────────────────────────────────────────────────────────────────────────

    const descriptionRaw = rawBody['description'];
    const descriptionStr = typeof descriptionRaw === 'string' ? descriptionRaw.trim() : '';
    if (!descriptionStr) {
      return reply.code(400).send({ error: 'Description is required', debug_received: rawBody });
    }

    const typeStr = typeof rawBody['type'] === 'string' ? rawBody['type'] : '';
    if (!typeStr) {
      return reply.code(400).send({ error: 'Type is required' });
    }

    // FIX (P1-6 gap — AC-P1-6.6): look up the admin-configured type
    // first. typeConfig is null for tenants that haven't configured
    // anything yet (or for a genuinely unknown type string), in which
    // case the original hardcoded getDefaultChecklistItems() /
    // getApprovalSteps() below still apply — this is a safety net, not
    // the primary path, once a tenant has run the seed migration or
    // configured its own types via /admin/permit-types.
    const [typeConfig] = await db.select().from(permitTypesConfig)
      .where(and(eq(permitTypesConfig.tenantId, tid), eq(permitTypesConfig.type, typeStr), eq(permitTypesConfig.isActive, true)))
      .limit(1);

    const validFromDate = typeof rawBody['validFrom'] === 'string' && rawBody['validFrom'] ? new Date(rawBody['validFrom'] as string) : undefined;
    const validToDate = typeof rawBody['validTo'] === 'string' && rawBody['validTo'] ? new Date(rawBody['validTo'] as string) : undefined;

    if (typeConfig?.maxValidityHours && validFromDate && validToDate) {
      const hours = (validToDate.getTime() - validFromDate.getTime()) / (1000 * 60 * 60);
      if (hours > typeConfig.maxValidityHours) {
        return reply.code(400).send({
          error: `${typeConfig.label} permits are configured with a maximum validity of ${typeConfig.maxValidityHours} hours; the requested window is ${hours.toFixed(1)} hours.`,
        });
      }
    }

    const count = await db.select({ id: permits.id }).from(permits).where(eq(permits.tenantId, tid));
    const permitNum = nextAutoRecordCode(count.length);

    const [row] = await db.insert(permits).values({
      tenantId: tid,
      permitNum,
      type: typeStr,
      description: descriptionStr,
      woId: typeof rawBody['woId'] === 'string' ? rawBody['woId'] : undefined,
      assetId: typeof rawBody['assetId'] === 'string' ? rawBody['assetId'] : undefined,
      locationId: typeof rawBody['locationId'] === 'string' ? rawBody['locationId'] : undefined,
      validFrom: validFromDate,
      validTo: validToDate,
      notes: typeof rawBody['notes'] === 'string' ? rawBody['notes'] : undefined,
      requestedByUserId: request.user!.id,
    }).returning();

    // Create default checklist based on type — admin-configured template
    // takes priority; hardcoded getDefaultChecklistItems() is the
    // fallback for tenants/types with no config row.
    const defaultItems = typeConfig
      ? (typeConfig.checklistTemplate as Array<{ category: string; description: string; sequence?: number; isRequired?: boolean }>)
      : getDefaultChecklistItems(typeStr);
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

    // Create approval steps — same priority as checklist: admin config
    // first, hardcoded getApprovalSteps() fallback second.
    const approvalSteps = typeConfig
      ? (typeConfig.requiredApproverRoles as string[]).map((role) => ({ role }))
      : getApprovalSteps(typeStr);
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

  // ─── Admin: Permit Types Config (P1-6 gap — AC-P1-6.6) ──────────────────────
  // "Admin can configure a new permit type with custom checklist and
  // approver roles." These are the routes that make that literally true
  // — a genuinely new `type` string, with its own checklist template and
  // approver roles, becomes usable in POST /permits the moment it's
  // created here, no deploy or migration required.

  app.get('/admin/permit-types', readGuard, async (request) => {
    const tid = request.user!.tenantId;
    return db.select().from(permitTypesConfig)
      .where(eq(permitTypesConfig.tenantId, tid))
      .orderBy(permitTypesConfig.label);
  });

  app.get('/admin/permit-types/:id', readGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;
    const [row] = await db.select().from(permitTypesConfig)
      .where(and(eq(permitTypesConfig.id, id), eq(permitTypesConfig.tenantId, tid))).limit(1);
    if (!row) return reply.code(404).send({ error: 'Permit type not found' });
    return row;
  });

  app.post('/admin/permit-types', writeGuard, async (request, reply) => {
    const tid = request.user!.tenantId;
    const body = request.body as {
      type: string;
      label: string;
      checklistTemplate?: Array<{ category: string; description: string; isRequired?: boolean; sequence?: number }>;
      requiredApproverRoles?: string[];
      maxValidityHours?: number;
    };

    if (!body.type?.trim() || !body.label?.trim()) {
      return reply.code(422).send({ error: 'type and label are required' });
    }
    // Normalize to the same UPPER_SNAKE convention the built-in types use
    // — not enforced strictly (this is text now, not an enum) but keeps
    // new types consistent with the seeded ones for anyone filtering by
    // type elsewhere in the app.
    const typeKey = body.type.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');

    const [existing] = await db.select({ id: permitTypesConfig.id }).from(permitTypesConfig)
      .where(and(eq(permitTypesConfig.tenantId, tid), eq(permitTypesConfig.type, typeKey))).limit(1);
    if (existing) return reply.code(409).send({ error: `A permit type "${typeKey}" already exists` });

    const [row] = await db.insert(permitTypesConfig).values({
      tenantId: tid,
      type: typeKey,
      label: body.label.trim(),
      checklistTemplate: body.checklistTemplate ?? [],
      requiredApproverRoles: body.requiredApproverRoles ?? ['supervisor'],
      maxValidityHours: body.maxValidityHours,
      createdByUserId: request.user!.id,
    }).returning();

    await audit(db, { tenantId: tid, userId: request.user!.id, action: 'CREATE', resource: 'PermitTypeConfig', resourceId: row!.id });
    return reply.code(201).send(row);
  });

  app.put('/admin/permit-types/:id', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;
    const body = request.body as Partial<{
      label: string;
      checklistTemplate: Array<{ category: string; description: string; isRequired?: boolean; sequence?: number }>;
      requiredApproverRoles: string[];
      maxValidityHours: number | null;
      isActive: boolean;
    }>;

    const [row] = await db.update(permitTypesConfig)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(permitTypesConfig.id, id), eq(permitTypesConfig.tenantId, tid)))
      .returning();
    if (!row) return reply.code(404).send({ error: 'Permit type not found' });

    await audit(db, { tenantId: tid, userId: request.user!.id, action: 'UPDATE', resource: 'PermitTypeConfig', resourceId: id });
    return row;
  });

  app.delete('/admin/permit-types/:id', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;

    // Soft-delete (isActive: false) rather than a hard DELETE — existing
    // permits already created with this type keep working (permits.type
    // is just text, not a foreign key), and this only stops the type
    // from being offered for *new* permits going forward.
    const [row] = await db.update(permitTypesConfig)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(permitTypesConfig.id, id), eq(permitTypesConfig.tenantId, tid)))
      .returning();
    if (!row) return reply.code(404).send({ error: 'Permit type not found' });

    await audit(db, { tenantId: tid, userId: request.user!.id, action: 'DEACTIVATE', resource: 'PermitTypeConfig', resourceId: id });
    return reply.code(204).send();
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

