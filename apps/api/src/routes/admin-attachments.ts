import type { FastifyInstance } from 'fastify';
import { eq, and, desc, isNull, lt, isNotNull, inArray } from 'drizzle-orm';
import { db, documentTypes, attachments } from '@eam/db';
import { requirePermission } from '../plugins/auth.js';
import { scanBuffer } from '@eam/attachment-service';

const guard = { preHandler: requirePermission('admin:attachments:manage') };

// In-memory scan settings cache (per tenant). In production use a DB table.
const scanSettingsCache = new Map<string, Record<string, unknown>>();

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
      mandatoryForStatus?: string[];
    };
    const [row] = await db.insert(documentTypes).values({
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
      mandatoryForStatus: body.mandatoryForStatus ?? [],
    }).returning();
    return reply.code(201).send(row);
  });

  app.put('/admin/attachments/document-types/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<{
      name: string; label: string; description: string;
      allowedExtensions: string[]; maxSizeBytes: number; retentionDays: number;
      visibility: 'PUBLIC' | 'ROLE_RESTRICTED'; requiredRoles: string[];
      virusScanEnabled: boolean; virusScanAction: 'QUARANTINE' | 'REJECT' | 'ALERT';
      mandatoryForStatus: string[]; isActive: boolean;
    }>;
    const updates: Partial<typeof documentTypes.$inferInsert> = {};
    for (const key of Object.keys(body) as (keyof typeof body)[]) {
      if (body[key] != null) (updates as Record<string, unknown>)[key] = body[key];
    }
    const [row] = await db.update(documentTypes).set(updates)
      .where(and(eq(documentTypes.id, id), eq(documentTypes.tenantId, request.user!.tenantId)))
      .returning();
    if (!row) return reply.code(404).send({ error: 'Document type not found' });
    return row;
  });

  app.delete('/admin/attachments/document-types/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [dt] = await db.select().from(documentTypes)
      .where(and(eq(documentTypes.id, id), eq(documentTypes.tenantId, request.user!.tenantId))).limit(1);
    if (!dt) return reply.code(404).send({ error: 'Not found' });
    if (dt.isSystem) return reply.code(403).send({ error: 'System document types cannot be deleted' });
    await db.delete(documentTypes).where(eq(documentTypes.id, id));
    return reply.code(204).send();
  });

  // ─── Mandatory attachment enforcement helper (called by entity routes) ───────
  // Exposed as a utility — entity save routes import checkMandatoryAttachments()
  app.get('/admin/attachments/mandatory-check', guard, async (request, reply) => {
    const q = request.query as { entityType: string; entityId: string; toStatus: string };
    const result = await checkMandatoryAttachments(
      request.user!.tenantId,
      q.entityType,
      q.entityId,
      q.toStatus,
    );
    return result;
  });

  // ─── Attachment Library ──────────────────────────────────────────────────────

  app.get('/admin/attachments/library', guard, async (request) => {
    const query = request.query as {
      search?: string; entityType?: string; scanStatus?: string;
      documentTypeId?: string; page?: string; limit?: string;
    };
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Number(query.limit ?? 50));
    const offset = (page - 1) * limit;

    const rows = await db
      .select({
        att: attachments,
        dtName: documentTypes.name,
        dtLabel: documentTypes.label,
      })
      .from(attachments)
      .leftJoin(documentTypes, eq(attachments.documentTypeId, documentTypes.id))
      .where(and(eq(attachments.tenantId, request.user!.tenantId), isNull(attachments.deletedAt)))
      .orderBy(desc(attachments.uploadedAt))
      .limit(limit)
      .offset(offset);

    const data = rows
      .filter((r) => {
        const a = r.att;
        if (query.entityType && a.entityType !== query.entityType) return false;
        if (query.scanStatus && a.scanStatus.toLowerCase() !== query.scanStatus.toLowerCase()) return false;
        if (query.documentTypeId && a.documentTypeId !== query.documentTypeId) return false;
        if (query.search) {
          const q = query.search.toLowerCase();
          return a.originalFilename.toLowerCase().includes(q) ||
            (a.description ?? '').toLowerCase().includes(q) ||
            (a.tags ?? []).some((t) => t.toLowerCase().includes(q));
        }
        return true;
      })
      .map((r) => ({
        id: r.att.id,
        fileName: r.att.originalFilename,
        documentType: r.dtLabel ?? r.dtName ?? r.att.documentTypeId,
        entityType: r.att.entityType,
        entityId: r.att.entityId,
        fileSizeBytes: r.att.sizeBytes,
        mimeType: r.att.mimeType,
        uploadedBy: r.att.uploadedBy ?? '—',
        uploadedAt: r.att.uploadedAt,
        scanStatus: r.att.scanStatus.toLowerCase(),
        versionCount: 1,
        referenceCount: 1,
        tags: r.att.tags ?? [],
        downloadUrl: null,   // client calls presign-download separately
        versionOf: r.att.versionOf,
        versionNum: r.att.versionNum,
        description: r.att.description,
      }));

    return { data, page, limit, total: data.length };
  });

  app.delete('/admin/attachments/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [att] = await db.select().from(attachments)
      .where(and(eq(attachments.id, id), eq(attachments.tenantId, request.user!.tenantId))).limit(1);
    if (!att) return reply.code(404).send({ error: 'Not found' });
    await db.update(attachments).set({ deletedAt: new Date() }).where(eq(attachments.id, id));
    return reply.code(204).send();
  });

  // ─── Quarantine an attachment (admin) ─────────────────────────────────────────
  app.post('/admin/attachments/:id/quarantine', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [att] = await db.select().from(attachments)
      .where(and(eq(attachments.id, id), eq(attachments.tenantId, request.user!.tenantId))).limit(1);
    if (!att) return reply.code(404).send({ error: 'Not found' });
    const [updated] = await db.update(attachments)
      .set({ scanStatus: 'INFECTED' })
      .where(eq(attachments.id, id))
      .returning();
    return { ok: true, attachment: updated };
  });

  // ─── Version history for an attachment ────────────────────────────────────────
  app.get('/admin/attachments/:id/versions', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;
    const [root] = await db.select().from(attachments)
      .where(and(eq(attachments.id, id), eq(attachments.tenantId, tid))).limit(1);
    if (!root) return reply.code(404).send({ error: 'Not found' });
    const rootId = root.versionOf ?? root.id;
    const allVersions = await db.select().from(attachments)
      .where(and(eq(attachments.tenantId, tid), eq(attachments.versionOf, rootId)))
      .orderBy(desc(attachments.versionNum));
    const [original] = await db.select().from(attachments)
      .where(and(eq(attachments.id, rootId), eq(attachments.tenantId, tid))).limit(1);
    const versions = original ? [original, ...allVersions] : allVersions;
    return versions.map((v) => ({
      id: v.id, versionNum: v.versionNum,
      filename: v.originalFilename, sizeBytes: v.sizeBytes,
      uploadedBy: v.uploadedBy, uploadedAt: v.uploadedAt,
      scanStatus: v.scanStatus, mimeType: v.mimeType,
    }));
  });

  // ─── Scan Engine Status ───────────────────────────────────────────────────────
  app.get('/admin/attachments/scan-engine/status', guard, async (request) => {
    const tid = request.user!.tenantId;
    const cfg = scanSettingsCache.get(tid) ?? {};
    const engine = (cfg.icapEnabled ? 'icap' : null) ??
      (process.env.CLAMAV_DISABLED === 'true' ? 'eicar-fallback' : 'clamav');

    // Count scanned attachments
    const allAtts = await db.select({ scanStatus: attachments.scanStatus })
      .from(attachments)
      .where(eq(attachments.tenantId, tid));
    const totalScanned = allAtts.filter((a) => a.scanStatus !== 'PENDING').length;
    const totalDetected = allAtts.filter((a) => a.scanStatus === 'INFECTED').length;

    return {
      engine,
      version: engine === 'clamav' ? process.env.CLAMAV_VERSION ?? '0.103.x' : '1.0.0',
      definitionDate: new Date().toISOString().slice(0, 10),
      status: process.env.CLAMAV_DISABLED === 'true' ? 'degraded' : 'online',
      lastScanAt: null,
      totalScanned,
      totalDetected,
    };
  });

  app.post('/admin/attachments/scan-engine/test', guard, async () => {
    // Scan EICAR test string to verify engine works
    const eicar = Buffer.from(
      'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
      'utf8',
    );
    const result = await scanBuffer(eicar);
    return {
      ok: result.status === 'INFECTED',
      testFile: 'EICAR test string',
      result,
      message: result.status === 'INFECTED'
        ? 'Scan engine operational — EICAR test file detected correctly.'
        : result.status === 'CLEAN'
          ? '⚠ EICAR not detected — engine may need definition update.'
          : `Scan failed: ${result.signature}`,
    };
  });

  // ─── Scan Policies (per document type) ───────────────────────────────────────
  app.get('/admin/attachments/scan-policies', guard, async (request) => {
    const types = await db.select().from(documentTypes)
      .where(eq(documentTypes.tenantId, request.user!.tenantId));
    return types.map((dt) => ({
      id: dt.id,
      documentTypeName: dt.label || dt.name,
      virusScanEnabled: dt.virusScanEnabled,
      scanAction: dt.virusScanAction.toLowerCase() as 'quarantine' | 'reject' | 'alert',
    }));
  });

  app.patch('/admin/attachments/scan-policies/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      virusScanEnabled?: boolean;
      scanAction?: 'quarantine' | 'reject' | 'alert';
    };
    const updates: Partial<typeof documentTypes.$inferInsert> = {};
    if (body.virusScanEnabled != null) updates.virusScanEnabled = body.virusScanEnabled;
    if (body.scanAction != null) updates.virusScanAction = body.scanAction.toUpperCase() as 'QUARANTINE' | 'REJECT' | 'ALERT';
    const [row] = await db.update(documentTypes).set(updates)
      .where(and(eq(documentTypes.id, id), eq(documentTypes.tenantId, request.user!.tenantId)))
      .returning();
    if (!row) return reply.code(404).send({ error: 'Not found' });
    return { id: row.id, documentTypeName: row.label || row.name, virusScanEnabled: row.virusScanEnabled, scanAction: row.virusScanAction.toLowerCase() };
  });

  // ─── Scan Settings (global, per tenant) ──────────────────────────────────────
  app.get('/admin/attachments/scan-settings', guard, async (request) => {
    const cfg = scanSettingsCache.get(request.user!.tenantId) ?? {};
    return {
      icapEnabled: cfg.icapEnabled ?? false,
      icapHost: cfg.icapHost ?? '',
      icapPort: cfg.icapPort ?? 1344,
      icapServiceName: cfg.icapServiceName ?? 'avscan',
      globalScanEnabled: cfg.globalScanEnabled ?? true,
      quarantineAdminEmail: cfg.quarantineAdminEmail ?? '',
    };
  });

  app.put('/admin/attachments/scan-settings', guard, async (request) => {
    const body = request.body as Record<string, unknown>;
    const tid = request.user!.tenantId;
    scanSettingsCache.set(tid, { ...(scanSettingsCache.get(tid) ?? {}), ...body });
    return { ok: true };
  });

  // ─── Retention ───────────────────────────────────────────────────────────────
  app.get('/admin/attachments/retention/candidates', guard, async (request) => {
    const now = new Date();
    const expired = await db.select({
      att: attachments,
      dtName: documentTypes.name,
      dtLabel: documentTypes.label,
      retentionDays: documentTypes.retentionDays,
    })
      .from(attachments)
      .leftJoin(documentTypes, eq(attachments.documentTypeId, documentTypes.id))
      .where(and(
        eq(attachments.tenantId, request.user!.tenantId),
        isNull(attachments.deletedAt),
        isNotNull(attachments.expiresAt),
        lt(attachments.expiresAt, now),
      ))
      .orderBy(attachments.expiresAt);

    return expired.map((r) => ({
      id: r.att.id,
      fileName: r.att.originalFilename,
      documentType: r.dtLabel ?? r.dtName ?? '',
      entityType: r.att.entityType,
      entityId: r.att.entityId,
      uploadedBy: r.att.uploadedBy ?? '',
      uploadedAt: r.att.uploadedAt,
      retentionDays: r.retentionDays ?? 0,
      expiredAt: r.att.expiresAt,
      daysOverdue: Math.floor((now.getTime() - new Date(r.att.expiresAt!).getTime()) / 86400000),
      fileSizeBytes: r.att.sizeBytes,
      referenceCount: 1,
      markedForDeletion: false,
    }));
  });

  app.get('/admin/attachments/retention/summary', guard, async (request) => {
    const now = new Date();
    const expired = await db.select({ sizeBytes: attachments.sizeBytes })
      .from(attachments)
      .where(and(
        eq(attachments.tenantId, request.user!.tenantId),
        isNull(attachments.deletedAt),
        isNotNull(attachments.expiresAt),
        lt(attachments.expiresAt, now),
      ));
    return {
      totalExpired: expired.length,
      totalMarked: 0,
      storageBytesRecoverable: expired.reduce((s, r) => s + r.sizeBytes, 0),
    };
  });

  app.post('/admin/attachments/retention/mark', guard, async (request) => {
    const { ids } = request.body as { ids: string[] };
    // Mark as expiring immediately
    await db.update(attachments)
      .set({ expiresAt: new Date() })
      .where(and(
        eq(attachments.tenantId, request.user!.tenantId),
        inArray(attachments.id, ids),
      ));
    return { ok: true, marked: ids.length };
  });

  app.post('/admin/attachments/retention/confirm-delete', guard, async (request) => {
    const { ids } = request.body as { ids: string[] };
    await db.update(attachments)
      .set({ deletedAt: new Date() })
      .where(and(
        eq(attachments.tenantId, request.user!.tenantId),
        inArray(attachments.id, ids),
      ));
    return { ok: true, deleted: ids.length };
  });

  app.patch('/admin/attachments/retention/override/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { retentionDays } = request.body as { retentionDays: number | null };
    const expiresAt = retentionDays
      ? new Date(Date.now() + retentionDays * 86400000)
      : null;
    const [row] = await db.update(attachments)
      .set({ expiresAt })
      .where(and(eq(attachments.id, id), eq(attachments.tenantId, request.user!.tenantId)))
      .returning();
    if (!row) return reply.code(404).send({ error: 'Not found' });
    return { ok: true, expiresAt };
  });
}

// ─── Shared utility: check mandatory attachments for a status transition ───────
// Called by work-orders.ts, service-requests.ts etc. before saving
export async function checkMandatoryAttachments(
  tenantId: string,
  entityType: string,
  entityId: string,
  toStatus: string,
): Promise<{ valid: boolean; missing: string[] }> {
  // Find document types that are mandatory for this status
  const mandatoryTypes = await db
    .select({ id: documentTypes.id, label: documentTypes.label })
    .from(documentTypes)
    .where(and(
      eq(documentTypes.tenantId, tenantId),
      eq(documentTypes.isActive, true),
    ));

  const required = mandatoryTypes.filter((dt) => {
    const statuses = ((dt as unknown as { mandatoryForStatus?: string[] }).mandatoryForStatus ?? []);
    return statuses.includes(toStatus);
  });

  if (required.length === 0) return { valid: true, missing: [] };

  // Check which have been uploaded for this entity
  const uploaded = await db
    .select({ documentTypeId: attachments.documentTypeId })
    .from(attachments)
    .where(and(
      eq(attachments.tenantId, tenantId),
      eq(attachments.entityType, entityType),
      eq(attachments.entityId, entityId),
      isNull(attachments.deletedAt),
      eq(attachments.scanStatus, 'CLEAN'),
    ));

  const uploadedTypeIds = new Set(uploaded.map((u) => u.documentTypeId));
  const missing = required
    .filter((r) => !uploadedTypeIds.has(r.id))
    .map((r) => r.label);

  return { valid: missing.length === 0, missing };
}
