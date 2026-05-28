/**
 * P0-5: Attachment admin routes integration tests
 * Tests document types CRUD, attachment library, scan config, retention
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { initJwtKeys, signAccessToken } from '@eam/auth';
import { eq } from 'drizzle-orm';
import { documentTypes } from '@eam/db';
import { buildApp } from './index.js';
import { pushSchema, isDatabaseReachable } from './test/db-setup.js';
import { createTestTenant, createTestUser, testDb } from './test/fixtures.js';
import type { FastifyInstance } from 'fastify';

const dbReachable = await isDatabaseReachable();
const describeDb = dbReachable ? describe : describe.skip;

process.env.AUTO_SEED = 'false';
process.env.DISABLE_NOTIFICATION_BRIDGE = 'true';

describeDb('Attachment Admin Routes (P0-5)', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let tenantId: string;
  let createdDocTypeId: string;

  beforeAll(async () => {
    await pushSchema();
    await initJwtKeys();

    const db = testDb();
    const tenant = await createTestTenant(db);
    tenantId = tenant.id;

    const admin = await createTestUser(db, tenantId, 'att-admin@test.com', 'Attachment Admin');
    adminToken = await signAccessToken({
      sub: admin.id,
      tenantId,
      email: admin.email,
      roles: [],
      permissions: ['admin:attachments:manage'],
      mfa_verified: true,
    });

    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    const db = testDb();
    await db.delete(documentTypes).where(eq(documentTypes.tenantId, tenantId));
  });

  // ─── Document Types ───────────────────────────────────────────────────────────

  describe('GET /admin/attachments/document-types', () => {
    it('returns empty array initially', async () => {
      const res = await request(app.server)
        .get('/admin/attachments/document-types')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('requires authentication', async () => {
      const res = await request(app.server).get('/admin/attachments/document-types');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /admin/attachments/document-types', () => {
    it('creates a new document type', async () => {
      const res = await request(app.server)
        .post('/admin/attachments/document-types')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'test_pdf',
          label: 'Test PDF',
          description: 'Test document type',
          allowedExtensions: ['.pdf', '.PDF'],
          maxSizeBytes: 10485760,
          retentionDays: 365,
          visibility: 'PUBLIC',
          virusScanEnabled: true,
          virusScanAction: 'QUARANTINE',
        });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('test_pdf');
      expect(res.body.label).toBe('Test PDF');
      expect(res.body.allowedExtensions).toContain('.pdf');
      createdDocTypeId = res.body.id;
    });

    it('appears in document types list', async () => {
      const res = await request(app.server)
        .get('/admin/attachments/document-types')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.some((dt: { id: string }) => dt.id === createdDocTypeId)).toBe(true);
    });
  });

  describe('PUT /admin/attachments/document-types/:id', () => {
    it('updates document type', async () => {
      const res = await request(app.server)
        .put(`/admin/attachments/document-types/${createdDocTypeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ label: 'Updated PDF Label', retentionDays: 730 });
      expect(res.status).toBe(200);
      expect(res.body.label).toBe('Updated PDF Label');
      expect(res.body.retentionDays).toBe(730);
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app.server)
        .put('/admin/attachments/document-types/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ label: 'X' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /admin/attachments/document-types/:id', () => {
    it('deletes the document type', async () => {
      const res = await request(app.server)
        .delete(`/admin/attachments/document-types/${createdDocTypeId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(204);
    });
  });

  // ─── Attachment Library ────────────────────────────────────────────────────────

  describe('GET /admin/attachments/library', () => {
    it('returns paginated attachment list', async () => {
      const res = await request(app.server)
        .get('/admin/attachments/library')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(typeof res.body.total).toBe('number');
    });

    it('accepts pagination params', async () => {
      const res = await request(app.server)
        .get('/admin/attachments/library?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(10);
    });
  });

  // ─── Scan Config ─────────────────────────────────────────────────────────────

  describe('GET /admin/attachments/scan-config', () => {
    it('returns current scan config', async () => {
      const res = await request(app.server)
        .get('/admin/attachments/scan-config')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.engine).toBeDefined();
      expect(typeof res.body.enabled).toBe('boolean');
    });
  });

  describe('PUT /admin/attachments/scan-config', () => {
    it('updates scan config', async () => {
      const res = await request(app.server)
        .put('/admin/attachments/scan-config')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ engine: 'clamav', enabled: true, maxFileSizeBytes: 104857600 });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('POST /admin/attachments/scan-config/test', () => {
    it('runs EICAR test and returns result', async () => {
      const res = await request(app.server)
        .post('/admin/attachments/scan-config/test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.result.detected).toBe(true);
    });
  });

  // ─── Retention ────────────────────────────────────────────────────────────────

  describe('GET /admin/attachments/retention', () => {
    it('returns expired attachments list', async () => {
      const res = await request(app.server)
        .get('/admin/attachments/retention')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /admin/attachments/retention/purge', () => {
    it('purges with empty ids list', async () => {
      const res = await request(app.server)
        .post('/admin/attachments/retention/purge')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [] });
      expect(res.status).toBe(200);
      expect(res.body.purged).toBe(0);
    });
  });
});
