import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { io as ioClient, type Socket } from 'socket.io-client';
import { initJwtKeys, signAccessToken } from '@eam/auth';
import { eq } from 'drizzle-orm';
import { chatMessages, userPresence } from '@eam/db';
import { buildApp, setupSocketIO } from './index.js';
import { getDashboardWidgets } from './lib/dashboard-data.js';
import { pushSchema, isDatabaseReachable, isRedisReachable } from './test/db-setup.js';
import {
  createTestTenant,
  createTestUser,
  seedOpenEntities,
  testDb,
} from './test/fixtures.js';
import type { FastifyInstance } from 'fastify';

// ─── Guard: skip entire suite if infrastructure is not available ─────────────

const dbReachable = await isDatabaseReachable();
const redisReachable = await isRedisReachable();

// Dashboard widget tests only need DB; socket tests also need Redis.
const describeDb = dbReachable ? describe : describe.skip;
const describeSocket = dbReachable && redisReachable ? describe : describe.skip;

// Tell buildApp not to set up the Redis notification bridge during tests —
// the bridge uses maxRetriesPerRequest:null which blocks if Redis is slow.
// Socket.IO itself is set up separately below and does not use this bridge.
process.env.DISABLE_NOTIFICATION_BRIDGE = 'true';
// Suppress auto-seeding so tests control their own data
process.env.AUTO_SEED = 'false';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Connect a Socket.IO client and wait for the 'connect' event. */
function connectSocket(baseUrl: string, token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(`${baseUrl}/eam`, {
      path: '/eam/socket.io',
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Socket connection timed out after 8 s'));
    }, 8000);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** Wait for a named socket event, with a timeout. */
function waitForEvent<T>(
  socket: Socket,
  event: string,
  timeoutMs = 5000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for socket event "${event}" after ${timeoutMs} ms`));
    }, timeoutMs);
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

// ─── Shared state ─────────────────────────────────────────────────────────────

let app: FastifyInstance;
let baseUrl: string;
let db: ReturnType<typeof testDb>;
let tenantId: string;
let userAId: string;
let userBId: string;
let tokenA: string;
let tokenB: string;

// Build the app once for all P0-7 suites
beforeAll(async () => {
  if (!dbReachable) return;

  pushSchema();
  await initJwtKeys();
  db = testDb();
  app = await buildApp();

  // Only attach Socket.IO when Redis is reachable (needed for socket tests)
  if (redisReachable) {
    setupSocketIO(app.server);
  }

  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 3000;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  if (app) await app.close();
});

beforeEach(async () => {
  if (!dbReachable) return;

  const tenant = await createTestTenant(db);
  tenantId = tenant.id;

  const userA = await createTestUser(db, tenantId, `a-${Date.now()}@test.local`, 'User A');
  const userB = await createTestUser(db, tenantId, `b-${Date.now()}@test.local`, 'User B');
  userAId = userA.id;
  userBId = userB.id;

  // Seed dashboard data (1 open SR for userA, 2 open WOs assigned to userA)
  await seedOpenEntities(db, tenantId, userAId, userAId);

  // Sign tokens — no session ID so authenticate() skips session validation
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

// ─── Dashboard widget tests (DB only) ─────────────────────────────────────────

describeDb('P0-7 Dashboard widgets', () => {
  // P0-7-W-001 — KPI tile shows correct aggregate value
  it('P0-7-W-001 KPI tile aggregation — open SR and WO counts match seeded data', async () => {
    const widgets = await getDashboardWidgets(db, tenantId, userAId);

    const openSr = widgets.find((w) => w.id === 'kpi-open-sr');
    const openWo = widgets.find((w) => w.id === 'kpi-open-wo');

    // seedOpenEntities inserts 1 SR and 2 WOs for userAId
    expect(openSr).toBeDefined();
    expect(openSr!.type).toBe('kpi');
    expect((openSr as { value: number }).value).toBe(1);

    expect(openWo).toBeDefined();
    expect(openWo!.type).toBe('kpi');
    // seedOpenEntities inserts 2 WOs but only WO-TEST-001 has assignedToUserId=userAId.
    // WO-TEST-002 has no assignee, so the dashboard query (WHERE assignedToUserId = userId)
    // correctly returns 1 — matching the real dashboard-data.ts logic.
    expect((openWo as { value: number }).value).toBe(1);
  });

  // P0-7-W-002 — list widget returns top-N rows via HTTP
  it('P0-7-W-002 Top-N widget — /dashboard returns list widget with rows', async () => {
    const res = await request(baseUrl)
      .get('/dashboard')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(res.body).toHaveProperty('widgets');
    const list = (res.body.widgets as Array<{ id: string; rows?: unknown[] }>)
      .find((w) => w.id === 'list-recent-wo');

    expect(list).toBeDefined();
    expect(Array.isArray(list!.rows)).toBe(true);
    expect(list!.rows!.length).toBeGreaterThanOrEqual(1);

    // Each row has the expected shape
    const row = list!.rows![0] as { id: string; label: string; status: string };
    expect(typeof row.id).toBe('string');
    expect(typeof row.label).toBe('string');
    expect(typeof row.status).toBe('string');
  });
});

// ─── Collaboration / Socket tests (DB + Redis) ───────────────────────────────

describeSocket('P0-7 Collaboration (Socket.IO)', () => {
  // P0-7-C-001 — direct message persisted in DB and delivered via socket
  it('P0-7-C-001 Direct message socket delivery — message arrives at recipient and is persisted', async () => {
    // Connect user B first so they are online and joined to their room
    const socketB = await connectSocket(baseUrl, tokenB);

    // Register listener before A sends
    const msgPromise = waitForEvent<Record<string, unknown>>(socketB, 'chat:message', 6000);

    // Connect user A and send the message
    const socketA = await connectSocket(baseUrl, tokenA);
    socketA.emit('chat:send', { toUserId: userBId, content: 'Hello from A' });

    // Verify real-time delivery
    const msg = await msgPromise;
    expect(msg.content).toBe('Hello from A');
    expect(msg.fromUserId).toBe(userAId);
    expect(msg.toUserId).toBe(userBId);
    expect(msg.id).toBeTruthy();

    // Verify persistence in DB
    const rows = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.toUserId, userBId));
    expect(rows.some((r) => r.content === 'Hello from A')).toBe(true);

    socketA.disconnect();
    socketB.disconnect();
  });

  // P0-7-C-004 — user goes offline after disconnect, presence updated in DB
  it('P0-7-C-004 Offline detection — presence row changes to OFFLINE after disconnect', async () => {
    const socketA = await connectSocket(baseUrl, tokenA);

    // Give the server a moment to write ONLINE presence
    await new Promise((r) => setTimeout(r, 300));

    const [onlineRow] = await db
      .select()
      .from(userPresence)
      .where(eq(userPresence.userId, userAId));
    expect(onlineRow?.status).toBe('ONLINE');

    // Connect B so they are in the tenant room and can receive user:offline
    const socketB = await connectSocket(baseUrl, tokenB);
    const offlinePromise = waitForEvent<{ userId: string }>(socketB, 'user:offline', 6000);

    socketA.disconnect();

    const offlineEvent = await offlinePromise;
    expect(offlineEvent.userId).toBe(userAId);

    // Allow the async DB write to complete
    await new Promise((r) => setTimeout(r, 300));

    const [afterRow] = await db
      .select()
      .from(userPresence)
      .where(eq(userPresence.userId, userAId));
    expect(afterRow?.status).toBe('OFFLINE');

    socketB.disconnect();
  });

  // P0-7-C-005 — DND status persisted and visible via presence DB row
  it('P0-7-C-005 DND persistence — presence:status DND event is saved to DB', async () => {
    const socketA = await connectSocket(baseUrl, tokenA);

    // Emit DND status change
    socketA.emit('presence:status', { status: 'DND' });

    // Allow the async DB write to complete
    await new Promise((r) => setTimeout(r, 400));

    const [row] = await db
      .select()
      .from(userPresence)
      .where(eq(userPresence.userId, userAId));
    expect(row?.status).toBe('DND');

    socketA.disconnect();
  });
});
