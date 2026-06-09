import type { FastifyInstance } from 'fastify';
import { and, eq, desc } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, attachments, documentTypes } from '@eam/db';
import {
  presignUpload,
  presignDownload,
  buildAutoTags,
  scanBuffer,
  type MobileCaptureMetadata,
} from '@eam/attachment-service';
import { authenticate } from '../plugins/auth.js';

const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB ?? 50);

type PresignBody = {
  documentTypeId: string;
  entityType: string;
  entityId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  description?: string;
  manualTags?: string[];
  capture?: MobileCaptureMetadata;
  versionOf?: string; // upload as new version of existing attachment
};

export async function attachmentRoutes(app: FastifyInstance) {
  // ─── Pre-sign upload URL ───────────────────────────────────────────────────
  app.post('/attachments/presign', { preHandler: authenticate }, async (request, reply) => {
    const body = request.body as PresignBody;

    if (body.sizeBytes > MAX_UPLOAD_MB * 1024 * 1024) {
      return reply.status(413).send({ error: 'File too large' });
    }

    const [docType] = await db
      .select()
      .from(documentTypes)
      .where(eq(documentTypes.id, body.documentTypeId))
      .limit(1);
    if (!docType) return reply.status(404).send({ error: 'Document type not found' });

    const ext = body.filename.split('.').pop()?.toLowerCase() ?? '';
    if (!docType.allowedExtensions.map((e) => e.toLowerCase()).includes(ext)) {
      return reply.status(422).send({ error: `Extension .${ext} not allowed for this document type` });
    }
    if (body.sizeBytes > docType.maxSizeBytes) {
      return reply.status(422).send({ error: 'File exceeds document type size limit' });
    }

    // Compute version number if this is a new version
    let versionNum = 1;
    if (body.versionOf) {
      const versions = await db
        .select({ versionNum: attachments.versionNum })
        .from(attachments)
        .where(eq(attachments.versionOf, body.versionOf))
        .orderBy(desc(attachments.versionNum))
        .limit(1);
      versionNum = (versions[0]?.versionNum ?? 1) + 1;
    }

    const attachmentId = randomUUID();
    const storageKey = `${request.user!.tenantId}/${attachmentId}/${body.filename}`;
    const uploadUrl = await presignUpload(storageKey, body.mimeType);
    const tags = buildAutoTags({
      entityType: body.entityType,
      entityId: body.entityId,
      uploadedBy: request.user!.id,
      capture: body.capture,
      manualTags: body.manualTags,
    });

    await db.insert(attachments).values({
      id: attachmentId,
      tenantId: request.user!.tenantId,
      documentTypeId: body.documentTypeId,
      entityType: body.entityType,
      entityId: body.entityId,
      storageKey,
      originalFilename: body.filename,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
      uploadedBy: request.user!.id,
      scanStatus: docType.virusScanEnabled ? 'PENDING' : 'CLEAN',
      tags,
      description: body.description,
      versionOf: body.versionOf ?? null,
      versionNum,
    });

    return { uploadUrl, attachmentId, storageKey, tags, versionNum };
  });

  // ─── Scan uploaded file (called by client after S3 upload completes) ────────
  app.post('/attachments/:id/scan', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { fileBuffer?: string }; // base64 encoded for direct scan

    const [row] = await db
      .select()
      .from(attachments)
      .where(and(eq(attachments.id, id), eq(attachments.tenantId, request.user!.tenantId)))
      .limit(1);
    if (!row) return reply.status(404).send({ error: 'Attachment not found' });

    const [docType] = await db
      .select()
      .from(documentTypes)
      .where(eq(documentTypes.id, row.documentTypeId))
      .limit(1);

    if (!docType?.virusScanEnabled) {
      await db.update(attachments).set({ scanStatus: 'CLEAN' }).where(eq(attachments.id, id));
      return { scanStatus: 'CLEAN' };
    }

    // If no buffer provided, just mark as needing scan (async scan would pull from S3)
    if (!body?.fileBuffer) {
      return { scanStatus: 'PENDING', message: 'Async scan will run shortly' };
    }

    const buffer = Buffer.from(body.fileBuffer, 'base64');
    const scanResult = await scanBuffer(buffer);

    // Determine action on infected file
    let scanStatus: 'CLEAN' | 'INFECTED' | 'FAILED' = scanResult.status;
    if (scanResult.status === 'INFECTED') {
      const action = docType.virusScanAction ?? 'QUARANTINE';
      if (action === 'QUARANTINE') {
        scanStatus = 'INFECTED'; // stays in DB, marked infected, not downloadable
      } else if (action === 'REJECT') {
        await db.update(attachments).set({ deletedAt: new Date(), scanStatus: 'INFECTED' }).where(eq(attachments.id, id));
        return reply.status(422).send({ error: 'File rejected: virus detected', signature: scanResult.signature });
      }
      // ALERT: accept file but mark it
    }

    await db.update(attachments).set({
      scanStatus,
      scanResult: { status: scanResult.status, signature: scanResult.signature, engine: scanResult.engine },
      scanEngineVersion: scanResult.engine,
    }).where(eq(attachments.id, id));

    return { scanStatus, signature: scanResult.signature };
  });

  // ─── Download ──────────────────────────────────────────────────────────────
  app.get('/attachments/:id/download', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [row] = await db
      .select()
      .from(attachments)
      .where(and(eq(attachments.id, id), eq(attachments.tenantId, request.user!.tenantId)))
      .limit(1);

    if (!row || row.deletedAt) return reply.status(404).send({ error: 'Attachment not found' });
    if (row.scanStatus === 'INFECTED') return reply.status(409).send({ error: 'File is quarantined — virus detected' });
    if (row.scanStatus === 'PENDING') return reply.status(409).send({ error: 'File is pending virus scan' });

    const downloadUrl = await presignDownload(row.storageKey);
    return { downloadUrl, expiresIn: 300, filename: row.originalFilename, mimeType: row.mimeType };
  });

  // ─── List attachments for an entity ──────────────────────────────────────
  app.get('/attachments', { preHandler: authenticate }, async (request) => {
    const q = request.query as { entityType: string; entityId: string };
    return db
      .select()
      .from(attachments)
      .where(
        and(
          eq(attachments.tenantId, request.user!.tenantId),
          eq(attachments.entityType, q.entityType),
          eq(attachments.entityId, q.entityId),
        ),
      )
      .orderBy(desc(attachments.uploadedAt));
  });

  // ─── Version history for an attachment ────────────────────────────────────
  app.get('/attachments/:id/versions', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;

    // The id might be the root or any version — find the root
    const [root] = await db.select().from(attachments)
      .where(and(eq(attachments.id, id), eq(attachments.tenantId, tid))).limit(1);
    if (!root) return reply.status(404).send({ error: 'Not found' });

    const rootId = root.versionOf ?? root.id;

    // Get all versions: the original + all versionOf=rootId
    const allVersions = await db.select().from(attachments)
      .where(
        and(
          eq(attachments.tenantId, tid),
          eq(attachments.versionOf, rootId),
        ),
      )
      .orderBy(desc(attachments.versionNum));

    // Include the original
    const [original] = await db.select().from(attachments)
      .where(and(eq(attachments.id, rootId), eq(attachments.tenantId, tid))).limit(1);

    const versions = original ? [original, ...allVersions] : allVersions;
    return versions.map((v) => ({
      id: v.id,
      versionNum: v.versionNum,
      filename: v.originalFilename,
      sizeBytes: v.sizeBytes,
      uploadedBy: v.uploadedBy,
      uploadedAt: v.uploadedAt,
      scanStatus: v.scanStatus,
      mimeType: v.mimeType,
    }));
  });

  // ─── Delete / soft-delete attachment ──────────────────────────────────────
  app.delete('/attachments/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;
    await db.update(attachments)
      .set({ deletedAt: new Date() })
      .where(and(eq(attachments.id, id), eq(attachments.tenantId, tid)));
    return reply.status(204).send();
  });
}
