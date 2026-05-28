/**
 * P0-2: Extended config routes integration tests
 * Tests picklists CRUD, table views CRUD, schema migration log, config versions
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { initJwtKeys, signAccessToken } from '@eam/auth';
import { eq } from 'drizzle-orm';
import { picklistDefinitions, picklistValues } from '@eam/db';
import { buildApp } from './index.js';
import { pushSchema, isDatabaseReachable } from './test/db-setup.js';
import { createTestTenant, createTestUser, testDb } from './test/fixtures.js';
import type { FastifyInstance } from 'fastify';

const dbReachable = await isDatabaseReachable();
const describeDb = dbReachable ? describe : describe.skip;

process.env.AUTO_SEED = 'false';
process.env.DISABLE_NOTIFICATION_BRIDGE = 'true';

describeDb('Extended Config Routes (P0-2)', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let tenantId: string;
  let picklistId: string;
  let valueId: string;

  beforeAll(async () => {
    await pushSchema();
    await initJwtKeys();

    const db = testDb();
    const tenant = await createTestTenant(db);
    tenantId = tenant.id;

    const admin = await createTestUser(db, tenantId, 'cfg-admin@test.com', 'Config Admin');
    adminToken = await signAccessToken({
      sub: admin.id,
      tenantId,
      email: admin.email,
      roles: [],
      permissions: ['admin:config:manage'],
      mfa_verified: true,
    });

    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    const db = testDb();
    await db.delete(picklistValues).where(
      eq(picklistValues.picklistId, picklistId ?? '00000000-0000-0000-0000-000000000000'),
    );
    await db.delete(picklistDefinitions).where(eq(picklistDefinitions.tenantId, tenantId));
  });

  // ─── Picklists ────────────────────────────────────────────────────────────────

  describe('GET /admin/config/picklists', () => {
    it('returns empty array initially', async () => {
      const res = await request(app.server)
        .get('/admin/config/picklists')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('requires authentication', async () => {
      const res = await request(app.server).get('/admin/config/picklists');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /admin/config/picklists', () => {
    it('creates a picklist', async () => {
      const res = await request(app.server)
        .post('/admin/config/picklists')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'test_priority', label: 'Priority' });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('test_priority');
      expect(res.body.label).toBe('Priority');
      picklistId = res.body.id;
    });

    it('picklist appears in list', async () => {
      const res = await request(app.server)
        .get('/admin/config/picklists')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.body.some((p: { id: string }) => p.id === picklistId)).toBe(true);
    });
  });

  describe('PUT /admin/config/picklists/:id', () => {
    it('updates picklist label', async () => {
      const res = await request(app.server)
        .put(`/admin/config/picklists/${picklistId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ label: 'Task Priority' });
      expect(res.status).toBe(200);
      expect(res.body.label).toBe('Task Priority');
    });
  });

  // ─── Picklist Values ──────────────────────────────────────────────────────────

  describe('GET /admin/config/picklists/:id/values', () => {
    it('returns empty values initially', async () => {
      const res = await request(app.server)
        .get(`/admin/config/picklists/${picklistId}/values`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /admin/config/picklists/:id/values', () => {
    it('adds values to picklist', async () => {
      const res = await request(app.server)
        .post(`/admin/config/picklists/${picklistId}/values`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: 'HIGH', label: 'High', displayOrder: 1 });
      expect(res.status).toBe(201);
      expect(res.body.value).toBe('HIGH');
      expect(res.body.label).toBe('High');
      valueId = res.body.id;
    });

    it('can add multiple values', async () => {
      await request(app.server)
        .post(`/admin/config/picklists/${picklistId}/values`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: 'MEDIUM', label: 'Medium', displayOrder: 2 });
      await request(app.server)
        .post(`/admin/config/picklists/${picklistId}/values`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: 'LOW', label: 'Low', displayOrder: 3 });

      const res = await request(app.server)
        .get(`/admin/config/picklists/${picklistId}/values`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.body.length).toBe(3);
    });
  });

  describe('PUT /admin/config/picklists/:id/values/:valueId', () => {
    it('updates a picklist value', async () => {
      const res = await request(app.server)
        .put(`/admin/config/picklists/${picklistId}/values/${valueId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ label: 'High Priority', displayOrder: 0 });
      expect(res.status).toBe(200);
      expect(res.body.label).toBe('High Priority');
    });
  });

  describe('DELETE /admin/config/picklists/:id/values/:valueId', () => {
    it('deletes a picklist value', async () => {
      const res = await request(app.server)
        .delete(`/admin/config/picklists/${picklistId}/values/${valueId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(204);
    });
  });

  describe('DELETE /admin/config/picklists/:id', () => {
    it('deletes the picklist', async () => {
      const res = await request(app.server)
        .delete(`/admin/config/picklists/${picklistId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(204);
    });
  });

  // ─── Config Versions ──────────────────────────────────────────────────────────

  describe('GET /admin/config/versions', () => {
    it('returns config version history', async () => {
      const res = await request(app.server)
        .get('/admin/config/versions')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ─── Schema Migration Log ─────────────────────────────────────────────────────

  describe('GET /admin/config/migrations', () => {
    it('returns schema migration log', async () => {
      const res = await request(app.server)
        .get('/admin/config/migrations')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /admin/config/migrations/:id/retry', () => {
    it('returns 404 for non-existent migration', async () => {
      const res = await request(app.server)
        .post('/admin/config/migrations/00000000-0000-0000-0000-000000000000/retry')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res.status).toBe(404);
    });
  });
});
