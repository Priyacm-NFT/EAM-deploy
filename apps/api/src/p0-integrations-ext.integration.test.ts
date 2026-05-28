/**
 * P0-4: Extended integration routes tests
 * Tests webhook CRUD, connection PUT/DELETE, job PUT/DELETE, global run-log
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { initJwtKeys, signAccessToken } from '@eam/auth';
import { eq } from 'drizzle-orm';
import { webhookSubscriptions, integrationConnections, integrationJobs } from '@eam/db';
import { buildApp } from './index.js';
import { pushSchema, isDatabaseReachable } from './test/db-setup.js';
import { createTestTenant, createTestUser, testDb } from './test/fixtures.js';
import type { FastifyInstance } from 'fastify';

const dbReachable = await isDatabaseReachable();
const describeDb = dbReachable ? describe : describe.skip;

process.env.AUTO_SEED = 'false';
process.env.DISABLE_NOTIFICATION_BRIDGE = 'true';

describeDb('Extended Integration Routes (P0-4)', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let tenantId: string;
  let connectionId: string;
  let jobId: string;
  let webhookId: string;

  beforeAll(async () => {
    await pushSchema();
    await initJwtKeys();

    const db = testDb();
    const tenant = await createTestTenant(db);
    tenantId = tenant.id;

    const admin = await createTestUser(db, tenantId, 'integ-admin@test.com', 'Integration Admin');
    adminToken = await signAccessToken({
      sub: admin.id,
      tenantId,
      email: admin.email,
      roles: [],
      permissions: ['admin:integrations:manage'],
      mfa_verified: true,
    });

    app = await buildApp();
    await app.ready();

    // Pre-create a connection and job for update/delete tests
    const connRes = await request(app.server)
      .post('/admin/integrations/connections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test REST Connection', adapterType: 'REST', config: { baseUrl: 'https://api.example.com' } });
    connectionId = connRes.body.id;

    const jobRes = await request(app.server)
      .post('/admin/integrations/jobs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ connectionId, jobType: 'SYNC_ASSETS', scheduleCron: '0 * * * *' });
    jobId = jobRes.body.id;
  });

  afterAll(async () => {
    await app.close();
    const db = testDb();
    await db.delete(webhookSubscriptions).where(eq(webhookSubscriptions.tenantId, tenantId));
    await db.delete(integrationJobs).where(eq(integrationJobs.tenantId, tenantId));
    await db.delete(integrationConnections).where(eq(integrationConnections.tenantId, tenantId));
  });

  // ─── Connection PUT/DELETE ─────────────────────────────────────────────────────

  describe('PUT /admin/integrations/connections/:id', () => {
    it('updates connection name', async () => {
      const res = await request(app.server)
        .put(`/admin/integrations/connections/${connectionId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated REST Connection', isActive: false });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated REST Connection');
      expect(res.body.isActive).toBe(false);
    });
  });

  // ─── Job PUT/DELETE ─────────────────────────────────────────────────────────────

  describe('PUT /admin/integrations/jobs/:id', () => {
    it('updates job schedule', async () => {
      const res = await request(app.server)
        .put(`/admin/integrations/jobs/${jobId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ scheduleCron: '0 2 * * *', isActive: false });
      expect(res.status).toBe(200);
      expect(res.body.scheduleCron).toBe('0 2 * * *');
    });
  });

  describe('PATCH /admin/integrations/jobs/:id', () => {
    it('partial updates job active status', async () => {
      const res = await request(app.server)
        .patch(`/admin/integrations/jobs/${jobId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: true });
      expect(res.status).toBe(200);
      expect(res.body.isActive).toBe(true);
    });
  });

  // ─── Global Run Log ─────────────────────────────────────────────────────────────

  describe('GET /admin/integrations/run-log', () => {
    it('returns paginated global run log', async () => {
      const res = await request(app.server)
        .get('/admin/integrations/run-log')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(typeof res.body.total).toBe('number');
    });
  });

  // ─── Webhooks CRUD ─────────────────────────────────────────────────────────────

  describe('POST /admin/integrations/webhooks', () => {
    it('creates a webhook subscription', async () => {
      const res = await request(app.server)
        .post('/admin/integrations/webhooks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          url: 'https://example.com/hook',
          secret: 'supersecret123',
          events: ['work_order.created', 'work_order.completed'],
          isActive: true,
        });
      expect(res.status).toBe(201);
      expect(res.body.url).toBe('https://example.com/hook');
      expect(res.body.events).toContain('work_order.created');
      webhookId = res.body.id;
    });
  });

  describe('GET /admin/integrations/webhooks', () => {
    it('lists webhooks including created one', async () => {
      const res = await request(app.server)
        .get('/admin/integrations/webhooks')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((w: { id: string }) => w.id === webhookId)).toBe(true);
    });
  });

  describe('PUT /admin/integrations/webhooks/:id', () => {
    it('updates webhook events', async () => {
      const res = await request(app.server)
        .put(`/admin/integrations/webhooks/${webhookId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ events: ['work_order.created', 'asset.status_changed'], isActive: false });
      expect(res.status).toBe(200);
      expect(res.body.events).toContain('asset.status_changed');
      expect(res.body.isActive).toBe(false);
    });
  });

  describe('DELETE /admin/integrations/webhooks/:id', () => {
    it('deletes the webhook', async () => {
      const res = await request(app.server)
        .delete(`/admin/integrations/webhooks/${webhookId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(204);
    });

    it('no longer in list after delete', async () => {
      const res = await request(app.server)
        .get('/admin/integrations/webhooks')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.body.some((w: { id: string }) => w.id === webhookId)).toBe(false);
    });
  });

  // ─── Job DELETE ────────────────────────────────────────────────────────────────

  describe('DELETE /admin/integrations/jobs/:id', () => {
    it('deletes the job', async () => {
      const res = await request(app.server)
        .delete(`/admin/integrations/jobs/${jobId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(204);
    });
  });

  // ─── Connection DELETE ─────────────────────────────────────────────────────────

  describe('DELETE /admin/integrations/connections/:id', () => {
    it('deletes the connection', async () => {
      const res = await request(app.server)
        .delete(`/admin/integrations/connections/${connectionId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(204);
    });
  });
});
