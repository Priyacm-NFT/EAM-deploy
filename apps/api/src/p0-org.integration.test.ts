/**
 * P0-Org: Organisation structure & status model admin routes integration tests
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { initJwtKeys, signAccessToken } from '@eam/auth';
import { eq } from 'drizzle-orm';
import { organisations, sites, statusSets } from '@eam/db';
import { buildApp } from './index.js';
import { pushSchema, isDatabaseReachable } from './test/db-setup.js';
import { createTestTenant, createTestUser, testDb } from './test/fixtures.js';
import type { FastifyInstance } from 'fastify';

const dbReachable = await isDatabaseReachable();
const describeDb = dbReachable ? describe : describe.skip;

process.env.AUTO_SEED = 'false';
process.env.DISABLE_NOTIFICATION_BRIDGE = 'true';

describeDb('Org Structure & Status Model Routes', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let tenantId: string;
  let orgId: string;
  let siteId: string;
  let statusSetId: string;

  beforeAll(async () => {
    await pushSchema();
    await initJwtKeys();

    const db = testDb();
    const tenant = await createTestTenant(db);
    tenantId = tenant.id;

    const admin = await createTestUser(db, tenantId, 'org-admin@test.com', 'Org Admin');
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
    await db.delete(sites).where(eq(sites.tenantId, tenantId));
    await db.delete(organisations).where(eq(organisations.tenantId, tenantId));
    await db.delete(statusSets).where(eq(statusSets.tenantId, tenantId));
  });

  // ─── Organisations ────────────────────────────────────────────────────────────

  describe('GET /admin/org/organisations', () => {
    it('returns empty array initially', async () => {
      const res = await request(app.server)
        .get('/admin/org/organisations')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /admin/org/organisations', () => {
    it('creates an organisation', async () => {
      const res = await request(app.server)
        .post('/admin/org/organisations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Corp', code: 'TESTCORP', description: 'A test org' });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Test Corp');
      expect(res.body.code).toBe('TESTCORP');
      orgId = res.body.id;
    });
  });

  describe('PUT /admin/org/organisations/:id', () => {
    it('updates the organisation', async () => {
      const res = await request(app.server)
        .put(`/admin/org/organisations/${orgId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated Corp', description: 'Updated' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Corp');
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app.server)
        .put('/admin/org/organisations/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'X' });
      expect(res.status).toBe(404);
    });
  });

  // ─── Sites ─────────────────────────────────────────────────────────────────────

  describe('POST /admin/org/sites', () => {
    it('creates a site linked to an org', async () => {
      const res = await request(app.server)
        .post('/admin/org/sites')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Main Facility', siteNum: 'SITE01', orgId, timezone: 'America/Chicago' });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Main Facility');
      expect(res.body.orgId).toBe(orgId);
      siteId = res.body.id;
    });

    it('appears in sites list', async () => {
      const res = await request(app.server)
        .get('/admin/org/sites')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.some((s: { id: string }) => s.id === siteId)).toBe(true);
    });
  });

  describe('DELETE /admin/org/organisations/:id (with sites)', () => {
    it('returns 409 when org has sites', async () => {
      const res = await request(app.server)
        .delete(`/admin/org/organisations/${orgId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(409);
    });
  });

  describe('DELETE /admin/org/sites/:id', () => {
    it('deletes the site', async () => {
      const res = await request(app.server)
        .delete(`/admin/org/sites/${siteId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(204);
    });
  });

  describe('DELETE /admin/org/organisations/:id (no sites)', () => {
    it('deletes org after removing sites', async () => {
      const res = await request(app.server)
        .delete(`/admin/org/organisations/${orgId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(204);
    });
  });

  // ─── Status Sets & Transitions ────────────────────────────────────────────────

  describe('POST /admin/org/status-sets', () => {
    it('creates a status set', async () => {
      const res = await request(app.server)
        .post('/admin/org/status-sets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'wo_statuses', label: 'Work Order Statuses', entityType: 'work_order' });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('wo_statuses');
      statusSetId = res.body.id;
    });
  });

  describe('GET /admin/org/status-sets', () => {
    it('returns list with the created set', async () => {
      const res = await request(app.server)
        .get('/admin/org/status-sets')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.some((s: { id: string }) => s.id === statusSetId)).toBe(true);
    });
  });

  describe('POST /admin/org/status-sets/:id/transitions', () => {
    let transId: string;

    it('adds a transition', async () => {
      const res = await request(app.server)
        .post(`/admin/org/status-sets/${statusSetId}/transitions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fromStatus: 'WAPPR', toStatus: 'APPR', label: 'Approve', requiresComment: false });
      expect(res.status).toBe(201);
      expect(res.body.fromStatus).toBe('WAPPR');
      expect(res.body.toStatus).toBe('APPR');
      transId = res.body.id;
    });

    it('lists transitions', async () => {
      const res = await request(app.server)
        .get(`/admin/org/status-sets/${statusSetId}/transitions`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.some((t: { id: string }) => t.id === transId)).toBe(true);
    });

    it('updates a transition', async () => {
      const res = await request(app.server)
        .put(`/admin/org/status-sets/${statusSetId}/transitions/${transId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ requiresComment: true, label: 'Approve (with comment)' });
      expect(res.status).toBe(200);
      expect(res.body.requiresComment).toBe(true);
    });

    it('deletes a transition', async () => {
      const res = await request(app.server)
        .delete(`/admin/org/status-sets/${statusSetId}/transitions/${transId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(204);
    });
  });

  describe('DELETE /admin/org/status-sets/:id', () => {
    it('deletes the status set', async () => {
      const res = await request(app.server)
        .delete(`/admin/org/status-sets/${statusSetId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(204);
    });
  });
});
