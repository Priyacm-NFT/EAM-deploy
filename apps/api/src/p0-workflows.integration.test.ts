/**
 * P0-3: Workflow admin routes integration tests
 * Tests CRUD for workflow definitions, designer save, publish, simulate, version history
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { initJwtKeys, signAccessToken } from '@eam/auth';
import { eq } from 'drizzle-orm';
import { workflowDefinitions } from '@eam/db';
import { buildApp } from './index.js';
import { pushSchema, isDatabaseReachable } from './test/db-setup.js';
import { createTestTenant, createTestUser, testDb } from './test/fixtures.js';
import type { FastifyInstance } from 'fastify';

const dbReachable = await isDatabaseReachable();
const describeDb = dbReachable ? describe : describe.skip;

process.env.AUTO_SEED = 'false';
process.env.DISABLE_NOTIFICATION_BRIDGE = 'true';

describeDb('Workflow Admin Routes (P0-3)', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let tenantId: string;
  let createdWorkflowId: string;

  beforeAll(async () => {
    await pushSchema();
    await initJwtKeys();

    const db = testDb();
    const tenant = await createTestTenant(db);
    tenantId = tenant.id;

    const admin = await createTestUser(db, tenantId, 'wf-admin@test.com', 'WF Admin');
    adminToken = await signAccessToken({
      sub: admin.id,
      tenantId,
      email: admin.email,
      roles: [],
      permissions: ['admin:workflows:manage'],
      mfa_verified: true,
    });

    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    const db = testDb();
    await db.delete(workflowDefinitions).where(eq(workflowDefinitions.tenantId, tenantId));
  });

  describe('GET /admin/workflows', () => {
    it('returns empty array when no workflows exist', async () => {
      const res = await request(app.server)
        .get('/admin/workflows')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('requires authentication', async () => {
      const res = await request(app.server).get('/admin/workflows');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /admin/workflows', () => {
    it('creates a new workflow', async () => {
      const res = await request(app.server)
        .post('/admin/workflows')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Approval Flow', entityType: 'work_order', triggerCondition: 'DRAFT → WAPPR' });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Test Approval Flow');
      expect(res.body.entityType).toBe('work_order');
      expect(res.body.isActive).toBe(false);
      expect(res.body.currentVersion).toBe(1);
      createdWorkflowId = res.body.id;
    });

    it('returns the workflow in the list', async () => {
      const res = await request(app.server)
        .get('/admin/workflows')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.some((w: { id: string }) => w.id === createdWorkflowId)).toBe(true);
    });
  });

  describe('GET /admin/workflows/:id', () => {
    it('returns workflow detail with definition', async () => {
      const res = await request(app.server)
        .get(`/admin/workflows/${createdWorkflowId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(createdWorkflowId);
      expect(res.body.definition).toBeDefined();
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app.server)
        .get('/admin/workflows/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /admin/workflows/:id', () => {
    it('updates workflow name', async () => {
      const res = await request(app.server)
        .patch(`/admin/workflows/${createdWorkflowId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated Approval Flow' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Approval Flow');
    });

    it('toggles isActive', async () => {
      const res = await request(app.server)
        .patch(`/admin/workflows/${createdWorkflowId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: true });
      expect(res.status).toBe(200);
      expect(res.body.isActive).toBe(true);
    });
  });

  describe('PUT /admin/workflows/:id/designer', () => {
    it('saves the designer canvas definition', async () => {
      const definition = {
        nodes: [
          { id: 'n1', type: 'START', data: { label: 'Start' }, position: { x: 100, y: 100 } },
          { id: 'n2', type: 'APPROVAL', data: { label: 'Manager Approval' }, position: { x: 300, y: 100 } },
          { id: 'n3', type: 'END', data: { label: 'End' }, position: { x: 500, y: 100 } },
        ],
        edges: [
          { id: 'e1', source: 'n1', target: 'n2' },
          { id: 'e2', source: 'n2', target: 'n3' },
        ],
      };
      const res = await request(app.server)
        .put(`/admin/workflows/${createdWorkflowId}/designer`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ definition });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('POST /admin/workflows/:id/publish', () => {
    it('publishes the workflow and increments version', async () => {
      const res = await request(app.server)
        .post(`/admin/workflows/${createdWorkflowId}/publish`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.currentVersion).toBe(2);
      expect(res.body.isActive).toBe(true);
      expect(res.body.publishedAt).toBeDefined();
    });
  });

  describe('POST /admin/workflows/:id/simulate', () => {
    it('simulates workflow traversal', async () => {
      const res = await request(app.server)
        .post(`/admin/workflows/${createdWorkflowId}/simulate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ entityId: '00000000-0000-0000-0000-000000000001' });
      expect(res.status).toBe(200);
      expect(res.body.simulationId).toBeDefined();
      expect(Array.isArray(res.body.trace)).toBe(true);
    });
  });

  describe('GET /admin/workflows/:id/history', () => {
    it('returns workflow version history', async () => {
      const res = await request(app.server)
        .get(`/admin/workflows/${createdWorkflowId}/history`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.workflowId).toBe(createdWorkflowId);
      expect(Array.isArray(res.body.instances)).toBe(true);
    });
  });

  describe('DELETE /admin/workflows/:id', () => {
    it('deletes the workflow', async () => {
      const res = await request(app.server)
        .delete(`/admin/workflows/${createdWorkflowId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(204);
    });

    it('workflow no longer in list after delete', async () => {
      const res = await request(app.server)
        .get('/admin/workflows')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.body.some((w: { id: string }) => w.id === createdWorkflowId)).toBe(false);
    });
  });
});
