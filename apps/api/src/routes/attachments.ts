import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, attachments, documentTypes } from '@eam/db';
import {
  presignUpload,
  presignDownload,
  buildAutoTags,
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
};

export async function attachmentRoutes(app: FastifyInstance) {
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
      return reply.status(422).send({ error: 'Extension not allowed' });
    }
    if (body.sizeBytes > docType.maxSizeBytes) {
      return reply.status(422).send({ error: 'Exceeds document type size limit' });
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
    });

    return { uploadUrl, attachmentId, storageKey, tags };
  });

  app.get(
    '/attachments/:id/download',
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const [row] = await db
        .select()
        .from(attachments)
        .where(
          and(eq(attachments.id, id), eq(attachments.tenantId, request.user!.tenantId)),
        )
        .limit(1);

      if (!row || row.deletedAt) {
        return reply.status(404).send({ error: 'Attachment not found' });
      }
      if (row.scanStatus !== 'CLEAN') {
        return reply.status(409).send({
          error: 'Attachment not available for download',
          scanStatus: row.scanStatus,
        });
      }

      const downloadUrl = await presignDownload(row.storageKey);
      return {
        downloadUrl,
        expiresIn: 300,
        filename: row.originalFilename,
        mimeType: row.mimeType,
      };
    },
  );

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
      );
  });
}
