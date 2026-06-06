/**
 * Phase 1 — EAM Core MVP integration tests (PRD §12.1 / §9.1–9.6, 9.9–9.10)
 *
 * Covers the golden-path flows:
 *   Asset & Location → Service Request → Work Order → Job Plan / PM
 *   Permit to Work, Inventory, Labour crafts, Report subjects
 *
 * Prerequisites: Postgres running (docker compose up), DATABASE_URL in .env
 *
 * Run:  pnpm --filter @eam/api test phase1-eam
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { initJwtKeys } from '@eam/auth';
import { buildApp } from './index.js';
import { pushSchema, isDatabaseReachable } from './test/db-setup.js';
import {
  createTestTenant,
  createPhase1AccessToken,
  seedPhase1ReferenceData,
  testDb,
} from './test/fixtures.js';
import type { FastifyInstance } from 'fastify';

const dbReachable = await isDatabaseReachable();
const describeDb = dbReachable ? describe : describe.skip;

process.env.AUTO_SEED = 'false';
process.env.DISABLE_NOTIFICATION_BRIDGE = 'true';

describeDb('Phase 1 — EAM Core MVP', () => {
  let app: FastifyInstance;
  let token: string;
  let tenantId: string;
  let orgId: string;
  let siteId: string;
  let locationId: string;
  let assetId: string;
  let srId: string;
  let woId: string;
  let jobPlanId: string;
  let pmId: string;
  let permitId: string;
  let itemId: string;
  let storeroomId: string;

  beforeAll(async () => {
    pushSchema();
    await initJwtKeys();

    const db = testDb();
    const tenant = await createTestTenant(db);
    tenantId = tenant.id;

    const ref = await seedPhase1ReferenceData(db, tenantId);
    orgId = ref.org.id;
    siteId = ref.site.id;
    locationId = ref.location.id;

    const auth = await createPhase1AccessToken(db, tenantId);
    token = auth.token;

    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  // ─── P1-1  Asset & Location (PRD §9.1) ─────────────────────────────────────

  describe('P1-1 Asset & Location', () => {
    it('creates a location under the site', async () => {
      const res = await request(app.server)
        .post('/locations')
        .set(auth())
        .send({
          code: 'LOC-SUB',
          name: 'Sub Location',
          siteId,
          orgId,
          type: 'OPERATING',
        });
      expect(res.status).toBe(201);
      expect(res.body.code).toBe('LOC-SUB');
    });

    it('creates an asset at the location', async () => {
      const res = await request(app.server)
        .post('/assets')
        .set(auth())
        .send({
          assetNum: 'PUMP-001',
          description: 'Test centrifugal pump',
          siteId,
          locationId,
          status: 'OPERATING',
          criticality: 'HIGH',
        });
      expect(res.status).toBe(201);
      expect(res.body.assetNum).toBe('PUMP-001');
      assetId = res.body.id;
    });

    it('returns asset detail with location context', async () => {
      const res = await request(app.server).get(`/assets/${assetId}`).set(auth());
      expect(res.status).toBe(200);
      expect(res.body.assetNum).toBe('PUMP-001');
      expect(res.body.locationName).toBeTruthy();
    });

    it('creates and lists failure codes', async () => {
      const created = await request(app.server)
        .post('/failure-codes')
        .set(auth())
        .send({ type: 'PROBLEM', code: 'P-TEST', description: 'Test problem code' });
      expect(created.status).toBe(201);

      const res = await request(app.server).get('/failure-codes').set(auth()).query({ type: 'PROBLEM' });
      expect(res.status).toBe(200);
      expect(res.body.some((c: { code: string }) => c.code === 'P-TEST')).toBe(true);
    });
  });

  // ─── P1-2  Service Request (PRD §9.2) ───────────────────────────────────────

  describe('P1-2 Service Request', () => {
    it('creates an SR with SLA due date', async () => {
      const res = await request(app.server)
        .post('/service-requests')
        .set(auth())
        .send({
          description: 'Pump making unusual noise',
          priority: 'HIGH',
          channel: 'WEB',
          assetId,
          locationId,
          siteId,
        });
      expect(res.status).toBe(201);
      expect(res.body.srNum).toMatch(/^SR-/);
      expect(res.body.slaDueAt).toBeTruthy();
      expect(res.body.status).toBe('NEW');
      srId = res.body.id;
    });

    it('transitions SR through triage statuses', async () => {
      const queued = await request(app.server)
        .post(`/service-requests/${srId}/transition`)
        .set(auth())
        .send({ toStatus: 'QUEUED' });
      expect(queued.status).toBe(200);
      expect(queued.body.status).toBe('QUEUED');

      const inProgress = await request(app.server)
        .post(`/service-requests/${srId}/transition`)
        .set(auth())
        .send({ toStatus: 'IN_PROGRESS' });
      expect(inProgress.status).toBe(200);
      expect(inProgress.body.status).toBe('IN_PROGRESS');
    });

    it('returns SLA status for open SR', async () => {
      const res = await request(app.server).get(`/service-requests/${srId}/sla`).set(auth());
      expect(res.status).toBe(200);
      expect(['OK', 'WARNING', 'CRITICAL', 'BREACHED']).toContain(res.body.status);
      expect(res.body.targetHours).toBe(8);
    });

    it('converts SR to a work order', async () => {
      const res = await request(app.server)
        .post(`/service-requests/${srId}/convert`)
        .set(auth())
        .send({ type: 'CM', priority: 'HIGH' });
      expect(res.status).toBe(201);
      expect(res.body.woNum).toMatch(/^WO-/);
      expect(res.body.srId).toBe(srId);
      woId = res.body.id;

      const sr = await request(app.server).get(`/service-requests/${srId}`).set(auth());
      expect(sr.body.status).toBe('CONVERTED');
      expect(sr.body.convertedWo).toBeTruthy();
    });
  });

  // ─── P1-3  Work Order (PRD §9.3) ────────────────────────────────────────────

  describe('P1-3 Work Order', () => {
    it('creates a standalone WO', async () => {
      const res = await request(app.server)
        .post('/work-orders')
        .set(auth())
        .send({
          description: 'Replace pump seal',
          type: 'CM',
          priority: 'MEDIUM',
          assetId,
          siteId,
        });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('WAPPR');
    });

    it('transitions WO through lifecycle to COMP', async () => {
      const approve = await request(app.server)
        .post(`/work-orders/${woId}/transition`)
        .set(auth())
        .send({ toStatus: 'APPR' });
      expect(approve.status).toBe(200);

      const start = await request(app.server)
        .post(`/work-orders/${woId}/transition`)
        .set(auth())
        .send({ toStatus: 'INPRG' });
      expect(start.status).toBe(200);
      expect(start.body.actualStartDate).toBeTruthy();

      const complete = await request(app.server)
        .post(`/work-orders/${woId}/transition`)
        .set(auth())
        .send({ toStatus: 'COMP' });
      expect(complete.status).toBe(200);
      expect(complete.body.status).toBe('COMP');
    });

    it('closes WO with cost roll-up', async () => {
      const res = await request(app.server)
        .post(`/work-orders/${woId}/close`)
        .set(auth())
        .send({ closureNotes: 'Pump seal replaced successfully' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CLOSE');
    });
  });

  // ─── P1-4  Job Plan & PM (PRD §9.4) ─────────────────────────────────────────

  describe('P1-4 Job Plan & Preventive Maintenance', () => {
    it('creates a job plan with a task', async () => {
      const jp = await request(app.server)
        .post('/job-plans')
        .set(auth())
        .send({ description: 'Pump inspection job plan', estimatedDurationHours: '2' });
      expect(jp.status).toBe(201);
      jobPlanId = jp.body.id;

      const task = await request(app.server)
        .post(`/job-plans/${jobPlanId}/tasks`)
        .set(auth())
        .send({ sequence: 1, description: 'Inspect pump bearings', estimatedHours: '1' });
      expect(task.status).toBe(201);
    });

    it('creates a PM master linked to asset and job plan', async () => {
      const res = await request(app.server)
        .post('/pm-masters')
        .set(auth())
        .send({
          description: 'Monthly pump inspection',
          assetId,
          siteId,
          jobPlanId,
          frequencyType: 'CALENDAR',
          interval: 1,
          intervalUnit: 'MONTH',
          leadDays: 7,
        });
      expect(res.status).toBe(201);
      expect(res.body.pmNum).toMatch(/^PM-/);
      expect(res.body.nextDueDate).toBeTruthy();
      pmId = res.body.id;
    });

    it('returns PM forecast projection', async () => {
      const res = await request(app.server)
        .get(`/pm-masters/${pmId}/forecast`)
        .set(auth())
        .query({ horizon: '90' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('projected');
    });

    it('generates a PM work order from the job plan', async () => {
      const res = await request(app.server)
        .post(`/pm-masters/${pmId}/generate-now`)
        .set(auth());
      expect(res.status).toBe(201);
      expect(res.body.type).toBe('PM');
      expect(res.body.jobPlanId).toBe(jobPlanId);
    });
  });

  // ─── P1-5  Permit to Work (PRD §9.5) ────────────────────────────────────────

  describe('P1-5 Permit to Work', () => {
    it('creates a hot-work permit linked to the WO', async () => {
      const res = await request(app.server)
        .post('/permits')
        .set(auth())
        .send({
          type: 'HOT_WORK',
          description: 'Welding on pump housing',
          woId,
          assetId,
          locationId,
          notes: 'Fire watch assigned',
        });
      expect(res.status).toBe(201);
      expect(res.body.permitNum).toMatch(/^PTW-/);
      expect(res.body.status).toBe('DRAFT');
      permitId = res.body.id;
    });

    it('completes checklist, submits, and approves permit', async () => {
      const checklist = await request(app.server).get(`/permits/${permitId}/checklist`).set(auth());
      expect(checklist.status).toBe(200);
      expect(checklist.body.length).toBeGreaterThan(0);

      for (const item of checklist.body) {
        if (item.isRequired) {
          await request(app.server)
            .put(`/permits/${permitId}/checklist/${item.id}`)
            .set(auth())
            .send({ checked: true });
        }
      }

      const submit = await request(app.server).post(`/permits/${permitId}/submit`).set(auth());
      expect(submit.status).toBe(200);
      expect(submit.body.status).toBe('PENDING_APPROVAL');

      const approve = await request(app.server)
        .post(`/permits/${permitId}/approve`)
        .set(auth())
        .send({ comments: 'Safe to proceed' });
      expect(approve.status).toBe(200);
      expect(approve.body.status).toBe('ACTIVE');
    });
  });

  // ─── P1-6  Inventory (PRD §9.6) ─────────────────────────────────────────────

  describe('P1-6 Inventory', () => {
    it('creates item master and storeroom', async () => {
      const item = await request(app.server)
        .post('/items')
        .set(auth())
        .send({ itemNum: 'SEAL-001', description: 'Pump mechanical seal kit' });
      expect(item.status).toBe(201);
      itemId = item.body.id;

      const storeroom = await request(app.server)
        .post('/storerooms')
        .set(auth())
        .send({ storeroomNum: 'STR-01', name: 'Main Storeroom', siteId });
      expect(storeroom.status).toBe(201);
      storeroomId = storeroom.body.id;
    });

    it('receives stock and issues to work order', async () => {
      const receipt = await request(app.server)
        .post('/inventory/receipt')
        .set(auth())
        .send({ itemId, storeroomId, qty: '10', unitCost: '25.00' });
      expect(receipt.status).toBe(201);

      const issue = await request(app.server)
        .post('/inventory/issue')
        .set(auth())
        .send({ itemId, storeroomId, qty: '2', woId });
      expect(issue.status).toBe(201);
    });

    it('lists inventory transactions', async () => {
      const res = await request(app.server)
        .get('/inventory/transactions')
        .set(auth())
        .query({ itemId });
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── P1-7  Labour (PRD §9.9) ────────────────────────────────────────────────

  describe('P1-7 Labour', () => {
    it('lists labour crafts', async () => {
      const res = await request(app.server).get('/labour-crafts').set(auth());
      expect(res.status).toBe(200);
      expect(res.body.some((c: { craftCode: string }) => c.craftCode === 'MECH')).toBe(true);
    });
  });

  // ─── P1-8  Reporting (PRD §9.10) ────────────────────────────────────────────

  describe('P1-8 Reporting', () => {
    it('lists report subjects', async () => {
      const res = await request(app.server).get('/reports/subjects').set(auth());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      if (res.body.length > 0) {
        expect(res.body[0]).toHaveProperty('name');
        expect(res.body[0]).toHaveProperty('label');
      }
    });
  });
});
