import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { io as ioClient } from 'socket.io-client';
import { initJwtKeys, signAccessToken } from '@eam/auth';
import { eq } from 'drizzle-orm';
import { chatMessages, userPresence } from '@eam/db';
import { buildApp, setupSocketIO } from './index.js';
import { getDashboardWidgets } from './lib/dashboard-data.js';
import { pushSchema, isDatabaseReachable } from './test/db-setup.js';
import {
  createTestTenant,
  createTestUser,
  seedOpenEntities,
  testDb,
} from './test/fixtures.js';
import type { FastifyInstance } from 'fastify';

const dbReachable = await isDatabaseReachable();
const describeDb = dbReachable ? describe : describe.skip;

describeDb('P0-7 dashboard & collaboration', () => {
  let app: FastifyInstance;
  let baseUrl: string;
  let db: ReturnType<typeof testDb>;
  let tenantId: string;
  let userAId: string;
  let userBId: string;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    pushSchema();
    await initJwtKeys();
    db = testDb();
    app = await buildApp();
    setupSocketIO(app.server);
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 3000;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    const tenant = await createTestTenant(db);
    tenantId = tenant.id;
    const userA = await createTestUser(db, tenantId, `a-${Date.now()}@test.local`, 'User A');
    const userB = await createTestUser(db, tenantId, `b-${Date.now()}@test.local`, 'User B');
    userAId = userA.id;
    userBId = userB.id;
    await seedOpenEntities(db, tenantId, userAId, userAId);
    tokenA = await signAccessToken({
      sub: userAId,
      tenantId,
      email: userA.email,
      roles: [],
      permissions: [],
      mfa_verified: true,
    });
    tokenB = await signAccessToken({
      sub: userBId,
      tenantId,
      email: userB.email,
      roles: [],
      permissions: [],
      mfa_verified: true,
    });
  });

  it('P0-7-W-001 KPI tile shows correct aggregate value', async () => {
    const widgets = await getDashboardWidgets(db, tenantId, userAId);
    const openSr = widgets.find((w) => w.id === 'kpi-open-sr');
    const openWo = widgets.find((w) => w.id === 'kpi-open-wo');
    expect(openSr?.type === 'kpi' && openSr.value).toBe(1);
    expect(openWo?.type === 'kpi' && openWo.value).toBe(1);
  });

  it('P0-7-W-002 list widget shows top-N records', async () => {
    const res = await request(baseUrl)
      .get('/dashboard')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    const list = res.body.widgets.find((w: { id: string }) => w.id === 'list-recent-wo');
    expect(list.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('P0-7-C-001 direct message persisted and delivered via socket', async () => {
    const socketB = ioClient(`${baseUrl}/eam`, {
      path: '/eam/socket.io',
      auth: { token: tokenB },
      transports: ['websocket'],
    });

    await new Promise<void>((resolve, reject) => {
      socketB.on('connect', () => resolve());
      socketB.on('connect_error', reject);
      setTimeout(() => reject(new Error('socket B timeout')), 5000);
    });

    const msgPromise = new Promise<Record<string, unknown>>((resolve) => {
      socketB.on('chat:message', (msg) => resolve(msg as Record<string, unknown>));
    });

    const socketA = ioClient(`${baseUrl}/eam`, {
      path: '/eam/socket.io',
      auth: { token: tokenA },
      transports: ['websocket'],
    });
    await new Promise<void>((resolve, reject) => {
      socketA.on('connect', () => resolve());
      socketA.on('connect_error', reject);
      setTimeout(() => reject(new Error('socket A timeout')), 5000);
    });

    socketA.emit('chat:send', { toUserId: userBId, content: 'Hello from A' });
    const msg = await Promise.race([
      msgPromise,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('message timeout')), 5000)),
    ]);

    expect(msg.content).toBe('Hello from A');
    expect(msg.fromUserId).toBe(userAId);

    const rows = await db.select().from(chatMessages).where(eq(chatMessages.toUserId, userBId));
    expect(rows.some((r) => r.content === 'Hello from A')).toBe(true);

    socketA.disconnect();
    socketB.disconnect();
  });

  it('P0-7-C-004 user goes offline after disconnect', async () => {
    const socketA = ioClient(`${baseUrl}/eam`, {
      path: '/eam/socket.io',
      auth: { token: tokenA },
      transports: ['websocket'],
    });
    await new Promise<void>((resolve, reject) => {
      socketA.on('connect', () => resolve());
      socketA.on('connect_error', reject);
      setTimeout(() => reject(new Error('connect timeout')), 5000);
    });

    const [online] = await db
      .select()
      .from(userPresence)
      .where(eq(userPresence.userId, userAId));
    expect(online?.status).toBe('ONLINE');

    const offlinePromise = new Promise<void>((resolve) => {
      const socketB = ioClient(`${baseUrl}/eam`, {
        path: '/eam/socket.io',
        auth: { token: tokenB },
        transports: ['websocket'],
      });
      socketB.on('connect', () => {
        socketB.on('user:offline', (payload: { userId: string }) => {
          if (payload.userId === userAId) {
            socketB.disconnect();
            resolve();
          }
        });
        socketA.disconnect();
      });
      setTimeout(() => resolve(), 5000);
    });

    await offlinePromise;

    const [after] = await db
      .select()
      .from(userPresence)
      .where(eq(userPresence.userId, userAId));
    expect(after?.status).toBe('OFFLINE');
  });

  it('P0-7-C-005 DND status persisted and visible via presence API', async () => {
    const socketA = ioClient(`${baseUrl}/eam`, {
      path: '/eam/socket.io',
      auth: { token: tokenA },
      transports: ['websocket'],
    });
    await new Promise<void>((resolve, reject) => {
      socketA.on('connect', () => resolve());
      socketA.on('connect_error', reject);
      setTimeout(() => reject(new Error('connect timeout')), 5000);
    });

    socketA.emit('presence:status', { status: 'DND' });
    await new Promise((r) => setTimeout(r, 200));

    const [row] = await db
      .select()
      .from(userPresence)
      .where(eq(userPresence.userId, userAId));
    expect(row?.status).toBe('DND');

    socketA.disconnect();
  });
});
