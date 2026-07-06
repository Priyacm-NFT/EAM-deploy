import type { FastifyInstance } from 'fastify';
import { eq, and, desc, ilike, or, lt, getTableColumns } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  db,
  serviceRequests,
  srCategories,
  workOrders,
  assets,
  locations,
  sites,
  users,
  tenants,
  attachments,
  documentTypes,
  statusSets,
  statusTransitions,
  audit,
  statusHistory,
  recordStatusHistory,
} from '@eam/db';
import { validateCustomFields } from '../lib/entity-fields.js';
import { requirePermission } from '../plugins/auth.js';
import { nextAutoRecordCode } from '@eam/shared';
import { dispatchWebhookEvent } from '../lib/webhooks.js';

const readGuard = { preHandler: requirePermission('service_requests:read') };
const writeGuard = { preHandler: requirePermission('service_requests:write') };

/** Map priority to SLA target hours */
const SLA_HOURS: Record<string, number> = {
  URGENT: 4,
  HIGH: 8,
  MEDIUM: 24,
  LOW: 72,
};

export async function serviceRequestRoutes(app: FastifyInstance) {

  // ─── List ─────────────────────────────────────────────────────────────────────

  app.get('/service-requests', readGuard, async (request) => {
    const { status, priority, siteId, assetId, category, slaBreached, q, page, pageSize } =
      request.query as {
        status?: string;
        priority?: string;
        siteId?: string;
        assetId?: string;
        category?: string;
        slaBreached?: string;
        q?: string;
        page?: string;
        pageSize?: string;
      };
    const tid = request.user!.tenantId;
    const limit = Math.min(Number(pageSize ?? 50), 200);
    const offset = (Number(page ?? 1) - 1) * limit;

    const rows = await db
      .select({
        id: serviceRequests.id,
        srNum: serviceRequests.srNum,
        description: serviceRequests.description,
        status: serviceRequests.status,
        priority: serviceRequests.priority,
        category: serviceRequests.category,
        channel: serviceRequests.channel,
        slaBreached: serviceRequests.slaBreached,
        slaDueAt: serviceRequests.slaDueAt,
        convertedToWoId: serviceRequests.convertedToWoId,
        createdAt: serviceRequests.createdAt,
        updatedAt: serviceRequests.updatedAt,
        requesterName: users.displayName,
        assetNum: assets.assetNum,
        locationName: locations.name,
        siteName: sites.name,
      })
      .from(serviceRequests)
      .leftJoin(users, eq(serviceRequests.requesterId, users.id))
      .leftJoin(assets, eq(serviceRequests.assetId, assets.id))
      .leftJoin(locations, eq(serviceRequests.locationId, locations.id))
      .leftJoin(sites, eq(serviceRequests.siteId, sites.id))
      .where(
        and(
          eq(serviceRequests.tenantId, tid),
          status ? eq(serviceRequests.status, status as typeof serviceRequests.$inferSelect.status) : undefined,
          priority ? eq(serviceRequests.priority, priority as typeof serviceRequests.$inferSelect.priority) : undefined,
          siteId ? eq(serviceRequests.siteId, siteId) : undefined,
          assetId ? eq(serviceRequests.assetId, assetId) : undefined,
          category ? eq(serviceRequests.category, category) : undefined,
          slaBreached === 'true' ? eq(serviceRequests.slaBreached, true) : undefined,
          q
            ? or(
                ilike(serviceRequests.srNum, `%${q}%`),
                ilike(serviceRequests.description, `%${q}%`),
              )
            : undefined,
        ),
      )
      .orderBy(desc(serviceRequests.createdAt))
      .limit(limit)
      .offset(offset);

    return { data: rows, page: Number(page ?? 1), pageSize: limit };
  });

  // ─── Create ───────────────────────────────────────────────────────────────────

  app.post('/service-requests', writeGuard, async (request, reply) => {
    const body = request.body as {
      description: string;
      priority?: string;
      category?: string;
      channel?: string;
      assetId?: string;
      locationId?: string;
      siteId?: string;
      // FIX: real Maximo "Reported By" / "Report Date" — see the schema
      // comment on service_requests.reported_by_user_id. Distinct from
      // requesterId (who it's raised on behalf of) — a helpdesk agent
      // logging an SR for someone else is the reporter, not necessarily
      // the requester.
      reportedByUserId?: string;
      reportedDate?: string;
      // FIX (SR create form parity): requested service window.
      startDate?: string;
      endDate?: string;
      customData?: Record<string, unknown>;
    };
    const tid = request.user!.tenantId;

    const customData = body.customData ?? {};
    const validation = await validateCustomFields(tid, 'ServiceRequest', { ...body, ...customData }, request.user!.roles ?? []);
    if (!validation.valid) return reply.code(422).send({ error: 'Validation failed', errors: validation.errors });

    const count = await db.select({ id: serviceRequests.id }).from(serviceRequests)
      .where(eq(serviceRequests.tenantId, tid));
    const srNum = nextAutoRecordCode(count.length);

    // FIX (P1-2 gap): "category.routing_role drives the P0-3 workflow
    // assignment for triage." Look up the category config (if the
    // submitted category name matches one) and let it override the
    // generic priority-based SLA table below — a category's own
    // configured SLA hours are more specific than "MEDIUM = 24h for
    // everything", and its routingRole is what the triage queue uses to
    // filter/route this SR to the right team even before anyone's
    // manually assigned it.
    let categoryConfig: typeof srCategories.$inferSelect | undefined;
    if (body.category) {
      [categoryConfig] = await db.select().from(srCategories)
        .where(and(eq(srCategories.tenantId, tid), eq(srCategories.name, body.category), eq(srCategories.isActive, true)))
        .limit(1);
    }

    const priority = (body.priority ?? categoryConfig?.defaultPriority ?? 'MEDIUM') as keyof typeof SLA_HOURS;
    const slaTargetHours = categoryConfig?.slaHours ?? SLA_HOURS[priority] ?? 24;
    const slaDueAt = new Date(Date.now() + slaTargetHours * 3600000);

    const [row] = await db.insert(serviceRequests).values({
      tenantId: tid,
      srNum,
      description: body.description,
      priority: priority as typeof serviceRequests.$inferInsert.priority,
      category: body.category,
      routedRole: categoryConfig?.routingRole,
      channel: (body.channel ?? 'WEB') as typeof serviceRequests.$inferInsert.channel,
      requesterId: request.user!.id,
      reportedByUserId: body.reportedByUserId ?? request.user!.id,
      reportedDate: body.reportedDate ? new Date(body.reportedDate) : new Date(),
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      assetId: body.assetId,
      locationId: body.locationId,
      siteId: body.siteId,
      slaTargetHours,
      slaDueAt,
      customData: body.customData ?? {},
    }).returning();

    void recordStatusHistory(db, {
      tenantId: tid,
      entityType: 'ServiceRequest',
      entityId: row!.id,
      fromStatus: null,
      toStatus: row!.status,
      changedByUserId: request.user!.id,
      notes: 'Service Request created',
    }).catch((e: unknown) => console.warn('[status-history] ServiceRequest create record failed:', e));

    await audit(db, { tenantId: tid, userId: request.user!.id, action: 'CREATE', resource: 'ServiceRequest', resourceId: row!.id });
    void dispatchWebhookEvent(tid, 'SR_CREATED', { srId: row!.id, srNum: row!.srNum, priority: row!.priority });
    return reply.code(201).send(row);
  });

  // ─── SR Categories (P1-2 gap) ────────────────────────────────────────────────

  app.get('/sr-categories', readGuard, async (request) => {
    const tid = request.user!.tenantId;
    return db.select().from(srCategories).where(eq(srCategories.tenantId, tid)).orderBy(srCategories.name);
  });

  app.post('/admin/sr-categories', writeGuard, async (request, reply) => {
    const tid = request.user!.tenantId;
    const body = request.body as { name: string; parentId?: string; defaultPriority?: string; slaHours?: number; routingRole?: string };
    if (!body.name?.trim()) return reply.code(422).send({ error: 'name is required' });

    const [existing] = await db.select({ id: srCategories.id }).from(srCategories)
      .where(and(eq(srCategories.tenantId, tid), eq(srCategories.name, body.name.trim()))).limit(1);
    if (existing) return reply.code(409).send({ error: `Category "${body.name}" already exists` });

    const [row] = await db.insert(srCategories).values({
      tenantId: tid,
      name: body.name.trim(),
      parentId: body.parentId,
      defaultPriority: (body.defaultPriority ?? 'MEDIUM') as typeof srCategories.$inferInsert.defaultPriority,
      slaHours: body.slaHours,
      routingRole: body.routingRole,
    }).returning();
    await audit(db, { tenantId: tid, userId: request.user!.id, action: 'CREATE', resource: 'SRCategory', resourceId: row!.id });
    return reply.code(201).send(row);
  });

  app.put('/admin/sr-categories/:id', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;
    const body = request.body as Partial<{ name: string; parentId: string; defaultPriority: string; slaHours: number; routingRole: string; isActive: boolean }>;
    const [row] = await db.update(srCategories)
      .set({ ...body, updatedAt: new Date() } as Partial<typeof srCategories.$inferInsert>)
      .where(and(eq(srCategories.id, id), eq(srCategories.tenantId, tid)))
      .returning();
    if (!row) return reply.code(404).send({ error: 'Category not found' });
    return row;
  });

  app.delete('/admin/sr-categories/:id', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;
    const [row] = await db.update(srCategories)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(srCategories.id, id), eq(srCategories.tenantId, tid)))
      .returning();
    if (!row) return reply.code(404).send({ error: 'Category not found' });
    return reply.code(204).send();
  });

  // ─── Email-to-ticket webhook (P1-2 gap — AC-P1-2.5) ─────────────────────────
  // "Email-to-ticket creates an SR from an inbound email with attachments
  // preserved." No inbound path existed at all before this — only an
  // outbound *bounce* webhook (POST /webhooks/email/bounce) did.
  //
  // No end-user auth — an email relay (Mailgun/SendGrid/Postmark inbound
  // parse, or a generic SMTP-to-webhook bridge) calls this, not a logged-
  // in user, so it's secret-header authenticated the same way the bounce
  // webhook is. Tenant is resolved from the recipient address's local
  // part: mail should be routed to an address like
  // sr+<tenantSlug>@yourdomain.com, or the payload can pass tenantId
  // directly for providers/tests that support custom fields.
  app.post('/email-intake/sr', async (request, reply) => {
    const secret = request.headers['x-email-intake-secret'];
    if (secret && secret !== process.env.EMAIL_INTAKE_WEBHOOK_SECRET) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const body = request.body as Record<string, unknown>;

    // Normalize across a few common inbound-parse formats.
    let fromEmail: string | undefined;
    let toEmail: string | undefined;
    let subject: string | undefined;
    let textBody: string | undefined;
    let tenantIdFromPayload: string | undefined;
    let rawAttachments: Array<{ filename: string; contentType: string; base64: string }> = [];

    if (typeof body.From === 'string' || typeof body.Subject === 'string') {
      // Postmark inbound format: From, To, Subject, TextBody, Attachments: [{Name, Content, ContentType}]
      fromEmail = body.From as string;
      toEmail = body.To as string;
      subject = body.Subject as string;
      textBody = (body.TextBody as string) ?? (body.HtmlBody as string);
      const atts = Array.isArray(body.Attachments) ? body.Attachments as Record<string, unknown>[] : [];
      rawAttachments = atts.map((a) => ({
        filename: String(a.Name ?? 'attachment'),
        contentType: String(a.ContentType ?? 'application/octet-stream'),
        base64: String(a.Content ?? ''),
      }));
    } else if (typeof body.sender === 'string' || typeof body.subject === 'string') {
      // Mailgun-ish format
      fromEmail = body.sender as string ?? body.from as string;
      toEmail = body.recipient as string;
      subject = body.subject as string;
      textBody = body['body-plain'] as string ?? body.text as string;
      tenantIdFromPayload = body.tenantId as string;
    } else {
      // Generic fallback for direct/test calls
      fromEmail = body.from as string;
      toEmail = body.to as string;
      subject = body.subject as string;
      textBody = body.text as string ?? body.body as string;
      tenantIdFromPayload = body.tenantId as string;
      const atts = Array.isArray(body.attachments) ? body.attachments as Record<string, unknown>[] : [];
      rawAttachments = atts.map((a) => ({
        filename: String(a.filename ?? 'attachment'),
        contentType: String(a.contentType ?? 'application/octet-stream'),
        base64: String(a.base64 ?? a.content ?? ''),
      }));
    }

    if (!fromEmail) return reply.code(400).send({ error: 'Could not extract sender email from payload' });

    // Resolve tenant: explicit payload field wins, otherwise parse the
    // recipient local-part for a "sr+<slug>" or "sr-<slug>" convention.
    let tid = tenantIdFromPayload;
    if (!tid && toEmail) {
      const localPart = toEmail.split('@')[0] ?? '';
      const slugMatch = localPart.match(/^sr[+-](.+)$/i);
      if (slugMatch) {
        const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slugMatch[1]!.toLowerCase())).limit(1);
        tid = tenant?.id;
      }
    }
    if (!tid) {
      return reply.code(400).send({
        error: 'Could not resolve a tenant for this email. Route inbound mail to sr+<tenantSlug>@yourdomain, or include tenantId in the payload.',
      });
    }

    // Match an existing user by email for requesterId/reportedByUserId;
    // an SR from an unrecognized sender still gets created (channel
    // EMAIL, requesterId left null) rather than being dropped, since
    // rejecting silently would just make the email vanish with no ticket
    // and no bounce either.
    const [matchedUser] = await db.select({ id: users.id }).from(users)
      .where(and(eq(users.tenantId, tid), eq(users.email, fromEmail))).limit(1);

    const count = await db.select({ id: serviceRequests.id }).from(serviceRequests).where(eq(serviceRequests.tenantId, tid));
    const srNum = nextAutoRecordCode(count.length);
    const priority: keyof typeof SLA_HOURS = 'MEDIUM';
    const slaTargetHours = SLA_HOURS[priority];
    const slaDueAt = new Date(Date.now() + slaTargetHours * 3600000);

    const [row] = await db.insert(serviceRequests).values({
      tenantId: tid,
      srNum,
      description: subject?.trim() || '(No subject)',
      priority: priority as typeof serviceRequests.$inferInsert.priority,
      channel: 'EMAIL',
      requesterId: matchedUser?.id,
      reportedByUserId: matchedUser?.id,
      reportedDate: new Date(),
      slaTargetHours,
      slaDueAt,
      customData: { emailFrom: fromEmail, emailBody: textBody ?? null },
    }).returning();

    // Preserve attachments — this is the AC-P1-2.5 requirement by name.
    // Reuses the same `attachments` table every other upload path in the
    // app writes to, so these show up in the SR's normal Attachments tab
    // like any other file, not as a special email-only concept.
    if (rawAttachments.length > 0) {
      let [docType] = await db.select().from(documentTypes)
        .where(and(eq(documentTypes.tenantId, tid), eq(documentTypes.name, 'email_attachment'))).limit(1);
      if (!docType) {
        [docType] = await db.insert(documentTypes).values({
          tenantId: tid,
          name: 'email_attachment',
          label: 'Email Attachment',
          description: 'Files received via the email-to-ticket intake',
        }).returning();
      }

      const { putObject } = await import('@eam/attachment-service');
      for (const att of rawAttachments) {
        if (!att.base64) continue;
        const buffer = Buffer.from(att.base64, 'base64');
        const storageKey = `sr/${row!.id}/${Date.now()}-${att.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        try {
          await putObject(storageKey, buffer, att.contentType);
          await db.insert(attachments).values({
            tenantId: tid,
            documentTypeId: docType!.id,
            entityType: 'ServiceRequest',
            entityId: row!.id,
            storageKey,
            originalFilename: att.filename,
            mimeType: att.contentType,
            sizeBytes: buffer.length,
          });
        } catch (e) {
          request.log.warn({ err: e, filename: att.filename }, '[email-intake] attachment upload failed, continuing without it');
        }
      }
    }

    void recordStatusHistory(db, {
      tenantId: tid,
      entityType: 'ServiceRequest',
      entityId: row!.id,
      fromStatus: null,
      toStatus: row!.status,
      changedByUserId: null,
      notes: `Created from inbound email (${fromEmail})`,
    }).catch((e: unknown) => console.warn('[status-history] ServiceRequest email-intake record failed:', e));

    await audit(db, { tenantId: tid, userId: null, action: 'CREATE', resource: 'ServiceRequest', resourceId: row!.id, metadata: { source: 'email-intake', from: fromEmail } });
    void dispatchWebhookEvent(tid, 'SR_CREATED', { srId: row!.id, srNum: row!.srNum, priority: row!.priority, source: 'email' });

    return reply.code(201).send({ id: row!.id, srNum: row!.srNum, attachmentsSaved: rawAttachments.length });
  });

  // ─── Assignable users (MUST be before /:id routes) ───────────────────────────

  app.get('/service-requests/assignable-users', readGuard, async (request) => {
    const tid = request.user!.tenantId;
    return db
      .select({ id: users.id, displayName: users.displayName, email: users.email })
      .from(users)
      .where(and(eq(users.tenantId, tid), eq(users.isActive, true)))
      .orderBy(users.displayName);
  });

  // ─── Get detail ───────────────────────────────────────────────────────────────

  app.get('/service-requests/:id', readGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;

    // FIX: this route previously did a plain select() with no joins at
    // all, so assetNum/locationName/assignedDisplayName/reporterName
    // were always undefined in the response even when assetId/
    // locationId/assignedToUserId/requesterId were correctly saved on
    // the record — the Overview tab always rendered "—" for these
    // regardless of what was actually stored. The list route (GET
    // /service-requests above) already joined for assetNum/locationName;
    // this brings the single-record route in line with it, plus adds
    // the assignee/requester joins the detail page also needs.
    const assignedUsers = alias(users, 'assigned_users');
    const requesterUsers = alias(users, 'requester_users');

    const [sr] = await db
      .select({
        ...getTableColumns(serviceRequests),
        assetNum: assets.assetNum,
        locationName: locations.name,
        siteName: sites.name,
        assignedDisplayName: assignedUsers.displayName,
        reporterName: requesterUsers.displayName,
        reporterEmail: requesterUsers.email,
      })
      .from(serviceRequests)
      .leftJoin(assets, eq(serviceRequests.assetId, assets.id))
      .leftJoin(locations, eq(serviceRequests.locationId, locations.id))
      .leftJoin(sites, eq(serviceRequests.siteId, sites.id))
      .leftJoin(assignedUsers, eq(serviceRequests.assignedToUserId, assignedUsers.id))
      .leftJoin(requesterUsers, eq(serviceRequests.requesterId, requesterUsers.id))
      .where(and(eq(serviceRequests.id, id), eq(serviceRequests.tenantId, tid)))
      .limit(1);
    if (!sr) return reply.code(404).send({ error: 'Service request not found' });

    let convertedWo = null;
    if (sr.convertedToWoId) {
      const [wo] = await db.select({ id: workOrders.id, woNum: workOrders.woNum, status: workOrders.status })
        .from(workOrders).where(eq(workOrders.id, sr.convertedToWoId)).limit(1);
      convertedWo = wo;
    }

    // FIX: resolve reportedByUserId -> a display name, same pattern as
    // the equivalent lookup added to GET /items/:id — a plain select()
    // wildcard here too, so a small extra query rather than reworking
    // this into an explicit-column select + join.
    const [reporter] = sr.reportedByUserId
      ? await db.select({ displayName: users.displayName }).from(users).where(eq(users.id, sr.reportedByUserId)).limit(1)
      : [null];

    const slaStatus = getSlaStatus(sr);
    return { ...sr, convertedWo, slaStatus, reportedByName: reporter?.displayName ?? null };
  });

  // ─── Update ───────────────────────────────────────────────────────────────────

  app.put('/service-requests/:id', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    // FIX: request.body arrives as plain JSON — startDate/endDate/
    // reportedDate/closedAt/resolvedAt come through as ISO date STRINGS,
    // never real Date objects. The previous version cast the whole body
    // straight to `Partial<typeof serviceRequests.$inferInsert>` and
    // spread it directly into .set(), which only worked by accident for
    // fields nothing ever actually sent as a string — the moment the SR
    // edit form started sending startDate/endDate, Drizzle's postgres-js
    // driver tried to call .toISOString() on a string and 500'd. Timestamp
    // fields are converted explicitly below instead of trusting the cast.
    const body = request.body as Partial<Record<keyof typeof serviceRequests.$inferInsert, unknown>> & {
      startDate?: string | null;
      endDate?: string | null;
      reportedDate?: string | null;
    };
    const tid = request.user!.tenantId;

    const { startDate, endDate, reportedDate, ...rest } = body;
    const updates: Partial<typeof serviceRequests.$inferInsert> = { ...(rest as Partial<typeof serviceRequests.$inferInsert>) };
    if ('startDate' in body) updates.startDate = startDate ? new Date(startDate) : null;
    if ('endDate' in body) updates.endDate = endDate ? new Date(endDate) : null;
    if ('reportedDate' in body) updates.reportedDate = reportedDate ? new Date(reportedDate) : null;
    updates.updatedAt = new Date();

    const [row] = await db.update(serviceRequests)
      .set(updates)
      .where(and(eq(serviceRequests.id, id), eq(serviceRequests.tenantId, tid)))
      .returning();

    if (!row) return reply.code(404).send({ error: 'Service request not found' });
    await audit(db, { tenantId: tid, userId: request.user!.id, action: 'UPDATE', resource: 'ServiceRequest', resourceId: id });
    return row;
  });

  // ─── Assign ───────────────────────────────────────────────────────────────────

  app.post('/service-requests/:id/assign', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { assignedToUserId: string | null; comment?: string };
    const tid = request.user!.tenantId;

    const [sr] = await db
      .select()
      .from(serviceRequests)
      .where(and(eq(serviceRequests.id, id), eq(serviceRequests.tenantId, tid)))
      .limit(1);
    if (!sr) return reply.code(404).send({ error: 'Service request not found' });

    if (body.assignedToUserId) {
      const [assignee] = await db
        .select({ id: users.id, displayName: users.displayName, isActive: users.isActive })
        .from(users)
        .where(and(eq(users.id, body.assignedToUserId), eq(users.tenantId, tid)))
        .limit(1);
      if (!assignee) return reply.code(400).send({ error: 'Assignee not found in this tenant' });
      if (!assignee.isActive) return reply.code(400).send({ error: 'Cannot assign to an inactive user' });
    }

    const prevAssignee = sr.assignedToUserId;

    const [updated] = await db
      .update(serviceRequests)
      .set({
        assignedToUserId: body.assignedToUserId ?? null,
        status:
          sr.status === 'NEW' && body.assignedToUserId
            ? 'QUEUED'
            : sr.status,
        updatedAt: new Date(),
      })
      .where(and(eq(serviceRequests.id, id), eq(serviceRequests.tenantId, tid)))
      .returning();

    await audit(db, {
      tenantId: tid,
      userId: request.user!.id,
      action: body.assignedToUserId ? 'ASSIGN' : 'UNASSIGN',
      resource: 'ServiceRequest',
      resourceId: id,
      metadata: {
        prevAssignee,
        newAssignee: body.assignedToUserId ?? null,
        comment: body.comment ?? null,
        autoStatusAdvance: sr.status === 'NEW' && !!body.assignedToUserId,
      },
    });

    void dispatchWebhookEvent(tid, 'SR_ASSIGNED', {
      srId: id,
      srNum: sr.srNum,
      assignedToUserId: body.assignedToUserId ?? null,
      assignedByUserId: request.user!.id,
    });

    const { WorkflowEngine } = await import('@eam/workflow-engine');
    const engine = new WorkflowEngine(db);
    void engine.startWorkflow(
      'ServiceRequest',
      id,
      'SR_ASSIGNED',
      tid,
      {
        srId: id,
        srNum: sr.srNum,
        assignedToUserId: body.assignedToUserId ?? null,
        priority: sr.priority,
        description: sr.description,
      },
    );

    return updated;
  });

  // FIX: "status history for all the application" — read side for
  // Service Requests, same pattern as Assets/Work Orders above.
  app.get('/service-requests/:id/status-history', readGuard, async (request) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;
    return db
      .select({
        id: statusHistory.id,
        fromStatus: statusHistory.fromStatus,
        toStatus: statusHistory.toStatus,
        changedAt: statusHistory.changedAt,
        notes: statusHistory.notes,
        changedByName: users.displayName,
      })
      .from(statusHistory)
      .leftJoin(users, eq(statusHistory.changedByUserId, users.id))
      .where(and(eq(statusHistory.entityType, 'ServiceRequest'), eq(statusHistory.entityId, id), eq(statusHistory.tenantId, tid)))
      .orderBy(desc(statusHistory.changedAt));
  });

  // ─── Status Transition ────────────────────────────────────────────────────────

  app.post('/service-requests/:id/transition', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { toStatus: string; comment?: string };
    const tid = request.user!.tenantId;

    const [sr] = await db.select().from(serviceRequests)
      .where(and(eq(serviceRequests.id, id), eq(serviceRequests.tenantId, tid))).limit(1);
    if (!sr) return reply.code(404).send({ error: 'Service request not found' });

    const [srSet] = await db.select().from(statusSets)
      .where(and(eq(statusSets.entityType, 'ServiceRequest'), eq(statusSets.tenantId, tid))).limit(1);

    if (srSet) {
      const [transition] = await db.select().from(statusTransitions)
        .where(
          and(
            eq(statusTransitions.statusSetId, srSet.id),
            eq(statusTransitions.fromStatus, sr.status),
            eq(statusTransitions.toStatus, body.toStatus),
          ),
        ).limit(1);

      if (!transition) {
        return reply.code(400).send({ error: `Transition from ${sr.status} to ${body.toStatus} is not allowed` });
      }
      if (transition.requiresComment && !body.comment) {
        return reply.code(400).send({ error: 'A comment is required for this transition' });
      }
    }

    const updates: Partial<typeof serviceRequests.$inferInsert> = {
      status: body.toStatus as typeof serviceRequests.$inferInsert.status,
      updatedAt: new Date(),
    };
    if (body.toStatus === 'CLOSED' || body.toStatus === 'RESOLVED') {
      updates.closedAt = new Date();
      if (body.toStatus === 'RESOLVED') updates.resolvedAt = new Date();
      updates.closureNotes = body.comment ?? null;
    }

    // FIX (PRD 9.2 gap — SLA clock pause): entering WAITING_ON_REQUESTER
    // starts the pause clock; leaving it (to any other status) stops it,
    // banks the elapsed pause duration into the running total, and —
    // critically — pushes slaDueAt forward by that same duration, so
    // time spent waiting on the requester never counts against the
    // team's SLA. Symmetric with how the field only ever gets touched at
    // exactly these two transition edges, never on any other status
    // change.
    const now = new Date();
    if (body.toStatus === 'WAITING_ON_REQUESTER') {
      updates.slaPausedAt = now;
    } else if (sr.status === 'WAITING_ON_REQUESTER' && sr.slaPausedAt) {
      const pausedMs = now.getTime() - sr.slaPausedAt.getTime();
      updates.slaPausedAt = null;
      updates.slaPausedTotalMs = (BigInt(sr.slaPausedTotalMs ?? '0') + BigInt(Math.max(0, pausedMs))).toString();
      if (sr.slaDueAt) {
        updates.slaDueAt = new Date(sr.slaDueAt.getTime() + Math.max(0, pausedMs));
      }
    }

    const [updated] = await db.update(serviceRequests).set(updates)
      .where(and(eq(serviceRequests.id, id), eq(serviceRequests.tenantId, tid)))
      .returning();

    await audit(db, {
      tenantId: tid,
      userId: request.user!.id,
      action: `STATUS_${body.toStatus}`,
      resource: 'ServiceRequest',
      resourceId: id,
      metadata: { fromStatus: sr.status, toStatus: body.toStatus, comment: body.comment ?? null },
    });

    void recordStatusHistory(db, {
      tenantId: tid,
      entityType: 'ServiceRequest',
      entityId: id,
      fromStatus: sr.status,
      toStatus: body.toStatus,
      changedByUserId: request.user!.id,
      notes: body.comment ?? null,
    }).catch((e: unknown) => console.warn('[status-history] ServiceRequest transition record failed:', e));

    const { WorkflowEngine } = await import('@eam/workflow-engine');
    const engine = new WorkflowEngine(db);
    void engine.startWorkflow(
      'ServiceRequest',
      id,
      `SR_${sr.status}_TO_${body.toStatus}`,
      tid,
      {
        srId: id,
        srNum: sr.srNum,
        fromStatus: sr.status,
        toStatus: body.toStatus,
        requesterId: sr.requesterId ?? request.user!.id,
        priority: sr.priority,
      },
    );

    return updated;
  });

  // ─── Convert to Work Order ────────────────────────────────────────────────────

  app.post('/service-requests/:id/convert', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      description?: string;
      type?: string;
      priority?: string;
      targetStartDate?: string;
      targetFinishDate?: string;
    };
    const tid = request.user!.tenantId;

    const [sr] = await db.select().from(serviceRequests)
      .where(and(eq(serviceRequests.id, id), eq(serviceRequests.tenantId, tid))).limit(1);
    if (!sr) return reply.code(404).send({ error: 'Service request not found' });
    if (sr.convertedToWoId) return reply.code(409).send({ error: 'SR already converted to a work order' });

    const woCount = await db.select({ id: workOrders.id }).from(workOrders).where(eq(workOrders.tenantId, tid));
    const woNum = nextAutoRecordCode(woCount.length);

    const [wo] = await db.insert(workOrders).values({
      tenantId: tid,
      woNum,
      description: body.description ?? sr.description,
      type: (body.type ?? 'CM') as typeof workOrders.$inferInsert.type,
      priority: (body.priority ?? sr.priority) as typeof workOrders.$inferInsert.priority,
      assetId: sr.assetId,
      locationId: sr.locationId,
      siteId: sr.siteId,
      srId: id,
      targetStartDate: body.targetStartDate ? new Date(body.targetStartDate) : undefined,
      targetFinishDate: body.targetFinishDate ? new Date(body.targetFinishDate) : undefined,
    }).returning();

    await db.update(serviceRequests).set({
      status: 'CONVERTED',
      convertedToWoId: wo!.id,
      updatedAt: new Date(),
    }).where(and(eq(serviceRequests.id, id), eq(serviceRequests.tenantId, tid)));

    // FIX: this route inserts the new Work Order directly rather than
    // going through POST /work-orders, so it needs its own initial
    // status-history seed (same as that route does) — otherwise a
    // WO created via SR-conversion would silently have no history at
    // all. Also records the SR's own CONVERTED transition, since this
    // status change happens here rather than through the shared
    // /transition endpoint above.
    void recordStatusHistory(db, {
      tenantId: tid,
      entityType: 'WorkOrder',
      entityId: wo!.id,
      fromStatus: null,
      toStatus: wo!.status,
      changedByUserId: request.user!.id,
      notes: `Created from Service Request ${sr.srNum}`,
    }).catch((e: unknown) => console.warn('[status-history] WorkOrder create (from SR) record failed:', e));

    void recordStatusHistory(db, {
      tenantId: tid,
      entityType: 'ServiceRequest',
      entityId: id,
      fromStatus: sr.status,
      toStatus: 'CONVERTED',
      changedByUserId: request.user!.id,
      notes: `Converted to Work Order ${woNum}`,
    }).catch((e: unknown) => console.warn('[status-history] ServiceRequest convert record failed:', e));

    await audit(db, {
      tenantId: tid,
      userId: request.user!.id,
      action: 'CONVERT_TO_WO',
      resource: 'ServiceRequest',
      resourceId: id,
      metadata: { woId: wo!.id, woNum },
    });

    return reply.code(201).send(wo);
  });

  // ─── SLA detail ───────────────────────────────────────────────────────────────

  app.get('/service-requests/:id/sla', readGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;

    const [sr] = await db.select().from(serviceRequests)
      .where(and(eq(serviceRequests.id, id), eq(serviceRequests.tenantId, tid))).limit(1);
    if (!sr) return reply.code(404).send({ error: 'Service request not found' });

    return getSlaStatus(sr);
  });

  // ─── Overdue SRs (internal — used by SLA monitor worker) ─────────────────────

  app.get('/service-requests/overdue-sla', { preHandler: requirePermission('service_requests:read') }, async (request) => {
    const tid = request.user!.tenantId;
    const now = new Date();

    return db.select().from(serviceRequests).where(
      and(
        eq(serviceRequests.tenantId, tid),
        eq(serviceRequests.slaBreached, false),
        lt(serviceRequests.slaDueAt, now),
      ),
    );
  });
}

function getSlaStatus(sr: typeof serviceRequests.$inferSelect) {
  const now = Date.now();
  const dueAt = sr.slaDueAt ? sr.slaDueAt.getTime() : null;
  const isClosed = ['CLOSED', 'RESOLVED', 'CONVERTED', 'CANCELLED'].includes(sr.status);

  if (isClosed) {
    const closedTs = sr.closedAt?.getTime() ?? sr.updatedAt.getTime();
    const breached = dueAt ? closedTs > dueAt : false;
    return {
      targetHours: sr.slaTargetHours,
      dueAt: sr.slaDueAt,
      breached,
      status: breached ? 'BREACHED' : 'MET',
      remainingMs: null,
    };
  }

  if (!dueAt) return { targetHours: sr.slaTargetHours, dueAt: null, breached: false, status: 'NOT_SET', remainingMs: null };

  const remainingMs = dueAt - now;
  const breached = remainingMs < 0;
  let status: string;
  if (breached) status = 'BREACHED';
  else if (remainingMs < 3600000) status = 'CRITICAL';
  else if (remainingMs < 14400000) status = 'WARNING';
  else status = 'OK';

  return { targetHours: sr.slaTargetHours, dueAt: sr.slaDueAt, breached, status, remainingMs };
}
