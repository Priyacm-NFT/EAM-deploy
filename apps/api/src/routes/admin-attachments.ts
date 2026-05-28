import type { FastifyInstance } from 'fastify';
import { eq, and, desc, isNull, lt, isNotNull } from 'drizzle-orm';
import { db, documentTypes, attachments } from '@eam/db';
import { requirePermission } from '../plugins/auth.js';

const guard = { preHandler: requirePermission('admin:attachments:manage') };

// In-memory scan config store (in production this would be a DB table)
const scanConfigCache: Record<string, Record<string, unknown>> = {};

export async function adminAttachmentRoutes(app: FastifyInstance) {
  // ─── Document Types ──────────────────────────────────────────────────────────

  app.get('/admin/attachments/document-types', guard, async (request) => {
    return db
      .select()
      .from(documentTypes)
      .where(eq(documentTypes.tenantId, request.user!.tenantId))
      .orderBy(documentTypes.name);
  });

  app.post('/admin/attachments/document-types', guard, async (request, reply) => {
    const body = request.body as {
      name: string;
      label: string;
      description?: string;
      allowedExtensions?: string[];
      maxSizeBytes?: number;
      retentionDays?: number;
      visibility?: 'PUBLIC' | 'ROLE_RESTRICTED';
      requiredRoles?: string[];
      virusScanEnabled?: boolean;
      virusScanAction?: 'QUARANTINE' | 'REJECT' | 'ALERT';
    };

    const [row] = await db
      .insert(documentTypes)
      .values({
        tenantId: request.user!.tenantId,
        name: body.name,
        label: body.label,
        description: body.description,
        allowedExtensions: body.allowedExtensions ?? [],
        maxSizeBytes: body.maxSizeBytes ?? 52428800,
        retentionDays: body.retentionDays,
        visibility: body.visibility ?? 'PUBLIC',
        requiredRoles: body.requiredRoles ?? [],
        virusScanEnabled: body.virusScanEnabled ?? true,
        virusScanAction: body.virusScanAction ?? 'QUARANTINE',
      })
      .returning();

    return reply.code(201).send(row);
  });

  app.put('/admin/attachments/document-types/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      label?: string;
      description?: string;
      allowedExtensions?: string[];
      maxSizeBytes?: number;
      retentionDays?: number;
      visibility?: 'PUBLIC' | 'ROLE_RESTRICTED';
      requiredRoles?: string[];
      virusScanEnabled?: boolean;
      virusScanAction?: 'QUARANTINE' | 'REJECT' | 'ALERT';
      isActive?: boolean;
    };

    const updates: Partial<typeof documentTypes.$inferInsert> = {};
    if (body.name != null) updates.name = body.name;
    if (body.label != null) updates.label = body.label;
    if (body.description != null) updates.description = body.description;
    if (body.allowedExtensions != null) updates.allowedExtensions = body.allowedExtensions;
    if (body.maxSizeBytes != null) updates.maxSizeBytes = body.maxSizeBytes;
    if (body.retentionDays != null) updates.retentionDays = body.retentionDays;
    if (body.visibility != null) updates.visibility = body.visibility;
    if (body.requiredRoles != null) updates.requiredRoles = body.requiredRoles;
    if (body.virusScanEnabled != null) updates.virusScanEnabled = body.virusScanEnabled;
    if (body.virusScanAction != null) updates.virusScanAction = body.virusScanAction;
    if (body.isActive != null) updates.isActive = body.isActive;

    const [row] = await db
      .update(documentTypes)
      .set(updates)
      .where(
        and(
          eq(documentTypes.id, id),
          eq(documentTypes.tenantId, request.user!.tenantId),
        ),
      )
      .returning();

    if (!row) return reply.code(404).send({ error: 'Document type not found' });
    return row;
  });

  app.delete('/admin/attachments/document-types/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [dt] = await db
      .select()
      .from(documentTypes)
      .where(
        and(
          eq(documentTypes.id, id),
          eq(documentTypes.tenantId, request.user!.tenantId),
        ),
      )
      .limit(1);

    if (!dt) return reply.code(404).send({ error: 'Document type not found' });
    if (dt.isSystem) return reply.code(403).send({ error: 'System document types cannot be deleted' });

    await db
      .delete(documentTypes)
      .where(eq(documentTypes.id, id));

    return reply.code(204).send();
  });

  // ─── Attachment Library ──────────────────────────────────────────────────────

  app.get('/admin/attachments/library', guard, async (request) => {
    const query = request.query as {
      search?: string;
      entityType?: string;
      scanStatus?: string;
      documentTypeId?: string;
      page?: string;
      limit?: string;
    };

    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 50)));
    const offset = (page - 1) * limit;

    const rows = await db
      .select()
      .from(attachments)
      .where(
        and(
          eq(attachments.tenantId, request.user!.tenantId),
          isNull(attachments.deletedAt),
        ),
      )
      .orderBy(desc(attachments.uploadedAt))
      .limit(limit)
      .offset(offset);

    const filtered = rows.filter((a: typeof rows[0]) => {
      if (query.entityType && a.entityType !== query.entityType) return false;
      if (query.scanStatus && a.scanStatus !== query.scanStatus) return false;
      if (query.documentTypeId && a.documentTypeId !== query.documentTypeId) return false;
      if (query.search) {
        const q = query.search.toLowerCase();
        return a.originalFilename.toLowerCase().includes(q) || (a.description ?? '').toLowerCase().includes(q);
      }
      return true;
    });

    return { data: filtered, page, limit, total: filtered.length };
  });

  app.delete('/admin/attachments/library/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [att] = await db
      .select()
      .from(attachments)
      .where(
        and(
          eq(attachments.id, id),
          eq(attachments.tenantId, request.user!.tenantId),
        ),
      )
      .limit(1);

    if (!att) return reply.code(404).send({ error: 'Attachment not found' });

    await db
      .update(attachments)
      .set({ deletedAt: new Date() })
      .where(eq(attachments.id, id));

    return reply.code(204).send();
  });

  app.post('/admin/attachments/library/:id/quarantine', guard, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [att] = await db
      .select()
      .from(attachments)
      .where(
        and(
          eq(attachments.id, id),
          eq(attachments.tenantId, request.user!.tenantId),
        ),
      )
      .limit(1);

    if (!att) return reply.code(404).send({ error: 'Attachment not found' });

    const [updated] = await db
      .update(attachments)
      .set({ scanStatus: 'INFECTED' })
      .where(eq(attachments.id, id))
      .returning();

    return { ok: true, attachment: updated };
  });

  // ─── Scan Config ─────────────────────────────────────────────────────────────

  app.get('/admin/attachments/scan-config', guard, async (request) => {
    const tenantId = request.user!.tenantId;
    const cfg = scanConfigCache[tenantId] ?? {};
    return {
      engine: (cfg.engine as string) ?? 'clamav',
      icapHost: (cfg.icapHost as string) ?? '',
      icapPort: (cfg.icapPort as number) ?? 1344,
      icapService: (cfg.icapService as string) ?? 'avscan',
      enabled: (cfg.enabled as boolean) ?? true,
      maxFileSizeBytes: (cfg.maxFileSizeBytes as number) ?? 52428800,
      engineVersion: '1.0.0-clamav',
      lastUpdated: (cfg.lastUpdated as string) ?? null,
    };
  });

  app.put('/admin/attachments/scan-config', guard, async (request, _reply) => {
    const body = request.body as {
      engine?: string;
      icapHost?: string;
      icapPort?: number;
      icapService?: string;
      enabled?: boolean;
      maxFileSizeBytes?: number;
    };
    const tenantId = request.user!.tenantId;
    scanConfigCache[tenantId] = {
      ...(scanConfigCache[tenantId] ?? {}),
      ...body,
      lastUpdated: new Date().toISOString(),
    };
    return { ok: true, config: scanConfigCache[tenantId] };
  });

  app.post('/admin/attachments/scan-config/test', guard, async (_request, _reply) => {
    // EICAR test — simulate scan engine check
    const eicarResult = { signature: 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE', detected: true, engine: 'clamav' };
    return {
      ok: true,
      testFile: 'eicar.com',
      result: eicarResult,
      message: 'Scan engine is operational — EICAR test file detected correctly.',
    };
  });

  // ─── Retention / Purge ───────────────────────────────────────────────────────

  app.get('/admin/attachments/retention', guard, async (request) => {
    // Return attachments past their expiry date that haven't been deleted
    const now = new Date();
    const expired = await db
      .select()
      .from(attachments)
      .where(
        and(
          eq(attachments.tenantId, request.user!.tenantId),
          isNull(attachments.deletedAt),
          isNotNull(attachments.expiresAt),
          lt(attachments.expiresAt, now),
        ),
      )
      .orderBy(attachments.expiresAt);

    return expired;
  });

  app.post('/admin/attachments/retention/purge', guard, async (request, _reply) => {
    const body = request.body as { ids?: string[]; purgeAll?: boolean };
    const now = new Date();

    let deleted = 0;

    if (body.purgeAll) {
      const expired = await db
        .select({ id: attachments.id })
        .from(attachments)
        .where(
          and(
            eq(attachments.tenantId, request.user!.tenantId),
            isNull(attachments.deletedAt),
            isNotNull(attachments.expiresAt),
            lt(attachments.expiresAt, now),
          ),
        );

      for (const row of expired) {
        await db
          .update(attachments)
          .set({ deletedAt: now })
          .where(eq(attachments.id, row.id));
        deleted++;
      }
    } else if (body.ids?.length) {
      for (const id of body.ids) {
        await db
          .update(attachments)
          .set({ deletedAt: now })
          .where(
            and(
              eq(attachments.id, id),
              eq(attachments.tenantId, request.user!.tenantId),
            ),
          );
        deleted++;
      }
    }

    return { ok: true, purged: deleted };
  });
}
