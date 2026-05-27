import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { initJwtKeys } from '@eam/auth';
import { buildApp } from './index.js';
import { pushSchema, isDatabaseReachable } from './test/db-setup.js';
import {
  createAuthTestTenant,
  createPasswordResetToken,
  createTestUser,
  testDb,
} from './test/fixtures.js';
import { clearLoginLockout } from './lib/auth-state.js';
import type { FastifyInstance } from 'fastify';

const dbReachable = await isDatabaseReachable();
const describeDb = dbReachable ? describe : describe.skip;

describeDb('P0-1-A local auth', () => {
  let app: FastifyInstance;
  let db: ReturnType<typeof testDb>;
  let tenantSlug: string;
  let tenantId: string;

  beforeAll(async () => {
    process.env.AUTO_SEED = 'false';
    pushSchema();
    await initJwtKeys();
    db = testDb();
    app = await buildApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    const { tenant, slug } = await createAuthTestTenant(db);
    tenantSlug = slug;
    tenantId = tenant.id;
  });

  it('registers and logs in a local user', async () => {
    const email = `user-${Date.now()}@test.local`;
    const register = await request(app.server)
      .post('/auth/register')
      .send({
        tenantSlug,
        email,
        username: 'testuser',
        password: 'ValidPass1!',
        displayName: 'Test User',
      });
    expect(register.status).toBe(201);

    const login = await request(app.server)
      .post('/auth/login')
      .send({ tenantSlug, email, password: 'ValidPass1!' });
    expect(login.status).toBe(200);
    expect(login.body.accessToken).toBeTruthy();
    expect(login.body.refreshToken).toBeTruthy();
  });

  it('returns profile from GET /auth/me', async () => {
    const email = `me-${Date.now()}@test.local`;
    await request(app.server).post('/auth/register').send({
      tenantSlug,
      email,
      username: 'meuser',
      password: 'ValidPass1!',
      displayName: 'Me User',
    });
    const login = await request(app.server)
      .post('/auth/login')
      .send({ tenantSlug, email, password: 'ValidPass1!' });

    const me = await request(app.server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(email);
    expect(me.body.displayName).toBe('Me User');
  });

  it('rotates refresh tokens', async () => {
    const email = `refresh-${Date.now()}@test.local`;
    await request(app.server).post('/auth/register').send({
      tenantSlug,
      email,
      username: 'refreshuser',
      password: 'ValidPass1!',
      displayName: 'Refresh User',
    });
    const login = await request(app.server)
      .post('/auth/login')
      .send({ tenantSlug, email, password: 'ValidPass1!' });

    const oldRefresh = login.body.refreshToken as string;
    const refreshed = await request(app.server)
      .post('/auth/refresh')
      .send({ refreshToken: oldRefresh });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.refreshToken).not.toBe(oldRefresh);

    const stale = await request(app.server)
      .post('/auth/refresh')
      .send({ refreshToken: oldRefresh });
    expect(stale.status).toBe(401);
  });

  it('logs out and revokes refresh token', async () => {
    const email = `logout-${Date.now()}@test.local`;
    await request(app.server).post('/auth/register').send({
      tenantSlug,
      email,
      username: 'logoutuser',
      password: 'ValidPass1!',
      displayName: 'Logout User',
    });
    const login = await request(app.server)
      .post('/auth/login')
      .send({ tenantSlug, email, password: 'ValidPass1!' });

    const refreshToken = login.body.refreshToken as string;
    const logout = await request(app.server)
      .post('/auth/logout')
      .send({ refreshToken });
    expect(logout.status).toBe(200);

    const refresh = await request(app.server)
      .post('/auth/refresh')
      .send({ refreshToken });
    expect(refresh.status).toBe(401);
  });

  it('resets password with a one-time token', async () => {
    const email = `reset-${Date.now()}@test.local`;
    const register = await request(app.server).post('/auth/register').send({
      tenantSlug,
      email,
      username: 'resetuser',
      password: 'ValidPass1!',
      displayName: 'Reset User',
    });
    const userId = register.body.id as string;
    const token = await createPasswordResetToken(userId);

    const reset = await request(app.server)
      .post('/auth/password/reset')
      .send({ token, password: 'NewValidPass2!' });
    expect(reset.status).toBe(200);

    const oldLogin = await request(app.server)
      .post('/auth/login')
      .send({ tenantSlug, email, password: 'ValidPass1!' });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app.server)
      .post('/auth/login')
      .send({ tenantSlug, email, password: 'NewValidPass2!' });
    expect(newLogin.status).toBe(200);
  });

  it('locks out after repeated failed logins', async () => {
    const user = await createTestUser(db, tenantId, `lock-${Date.now()}@test.local`, 'Lock User');
    await clearLoginLockout(user.id);

    for (let i = 0; i < 5; i++) {
      const attempt = await request(app.server)
        .post('/auth/login')
        .send({ tenantSlug, email: user.email, password: 'WrongPass1!' });
      expect(attempt.status).toBe(401);
    }

    const locked = await request(app.server)
      .post('/auth/login')
      .send({ tenantSlug, email: user.email, password: 'TestPass123!' });
    expect(locked.status).toBe(429);
  });

  it('accepts password reset request without revealing account existence', async () => {
    const res = await request(app.server)
      .post('/auth/password/reset-request')
      .send({ tenantSlug, email: 'missing@test.local' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
