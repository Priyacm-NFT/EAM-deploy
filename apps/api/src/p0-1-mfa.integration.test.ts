import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { authenticator } from 'otplib';
import { initJwtKeys } from '@eam/auth';
import { groups, groupRoles, roles, userGroups, users, tenants } from '@eam/db';
import { eq, and } from 'drizzle-orm';
import { buildApp } from './index.js';
import { pushSchema, isDatabaseReachable } from './test/db-setup.js';
import { createAuthTestTenant, testDb } from './test/fixtures.js';
import type { FastifyInstance } from 'fastify';

const dbReachable = await isDatabaseReachable();
const describeDb = dbReachable ? describe : describe.skip;

describeDb('P0-1-B MFA (TOTP)', () => {
  let app: FastifyInstance;
  let db: ReturnType<typeof testDb>;
  let tenantSlug: string;

  beforeAll(async () => {
    process.env.AUTO_SEED = 'false';
    process.env.MFA_ENCRYPTION_KEY = '00000000000000000000000000000000';
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
    const { slug } = await createAuthTestTenant(db);
    tenantSlug = slug;
  });

  async function registerAndLogin(email: string) {
    await request(app.server).post('/auth/register').send({
      tenantSlug,
      email,
      username: email.split('@')[0],
      password: 'ValidPass1!',
      displayName: 'MFA User',
    });
    return request(app.server)
      .post('/auth/login')
      .send({ tenantSlug, email, password: 'ValidPass1!' });
  }

  it('sets up MFA and completes login challenge', async () => {
    const email = `mfa-${Date.now()}@test.local`;
    const login = await registerAndLogin(email);
    expect(login.status).toBe(200);
    const accessToken = login.body.accessToken as string;

    const setup = await request(app.server)
      .post('/auth/mfa/setup')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(setup.status).toBe(200);
    const secret = setup.body.secret as string;
    const code = authenticator.generate(secret);

    const verifySetup = await request(app.server)
      .post('/auth/mfa/verify-setup')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ secret, code });
    expect(verifySetup.status).toBe(200);
    expect(verifySetup.body.recoveryCodes).toHaveLength(10);

    const login2 = await request(app.server)
      .post('/auth/login')
      .send({ tenantSlug, email, password: 'ValidPass1!' });
    expect(login2.status).toBe(200);
    expect(login2.body.mfa_required).toBe(true);
    const mfaToken = login2.body.mfa_session_token as string;

    const totp = authenticator.generate(secret);
    const challenge = await request(app.server)
      .post('/auth/mfa/challenge')
      .send({ mfa_session_token: mfaToken, totp_code: totp });
    expect(challenge.status).toBe(200);
    expect(challenge.body.accessToken).toBeTruthy();

    const me = await request(app.server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${challenge.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.mfaEnabled).toBe(true);
    expect(me.body.mfaVerified).toBe(true);
    expect(me.body.mfaRequired).toBe(false);
  });

  it('disables MFA with valid TOTP code', async () => {
    const email = `mfa-off-${Date.now()}@test.local`;
    const login = await registerAndLogin(email);
    const accessToken = login.body.accessToken as string;

    const setup = await request(app.server)
      .post('/auth/mfa/setup')
      .set('Authorization', `Bearer ${accessToken}`);
    const secret = setup.body.secret as string;
    const code = authenticator.generate(secret);

    await request(app.server)
      .post('/auth/mfa/verify-setup')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ secret, code });

    const disableCode = authenticator.generate(secret);
    const disabled = await request(app.server)
      .post('/auth/mfa/disable')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: disableCode });
    expect(disabled.status).toBe(200);

    const loginAfter = await request(app.server)
      .post('/auth/login')
      .send({ tenantSlug, email, password: 'ValidPass1!' });
    expect(loginAfter.status).toBe(200);
    expect(loginAfter.body.mfa_required).toBeUndefined();
    expect(loginAfter.body.accessToken).toBeTruthy();
  });

  it('accepts recovery code at challenge', async () => {
    const email = `mfa-rc-${Date.now()}@test.local`;
    const login = await registerAndLogin(email);
    const accessToken = login.body.accessToken as string;

    const setup = await request(app.server)
      .post('/auth/mfa/setup')
      .set('Authorization', `Bearer ${accessToken}`);
    const secret = setup.body.secret as string;
    const verifySetup = await request(app.server)
      .post('/auth/mfa/verify-setup')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ secret, code: authenticator.generate(secret) });
    const recoveryCode = verifySetup.body.recoveryCodes[0] as string;

    const login2 = await request(app.server)
      .post('/auth/login')
      .send({ tenantSlug, email, password: 'ValidPass1!' });
    const mfaToken = login2.body.mfa_session_token as string;

    const challenge = await request(app.server)
      .post('/auth/mfa/challenge')
      .send({ mfa_session_token: mfaToken, recovery_code: recoveryCode });
    expect(challenge.status).toBe(200);
    expect(challenge.body.accessToken).toBeTruthy();
  });

  it('requires MFA setup when role has require_mfa', async () => {
    const email = `mfa-role-${Date.now()}@test.local`;
    await request(app.server).post('/auth/register').send({
      tenantSlug,
      email,
      username: email.split('@')[0],
      password: 'ValidPass1!',
      displayName: 'Role MFA User',
    });

    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, tenantSlug)).limit(1);
    const [registered] = await db
      .select()
      .from(users)
      .where(and(eq(users.tenantId, tenant!.id), eq(users.email, email)))
      .limit(1);

    const [group] = await db
      .insert(groups)
      .values({ tenantId: tenant!.id, name: `mfa-group-${Date.now()}`, source: 'LOCAL' })
      .returning();
    const [role] = await db
      .insert(roles)
      .values({ tenantId: tenant!.id, name: `mfa-role-${Date.now()}`, requireMfa: true })
      .returning();

    await db.insert(userGroups).values({ userId: registered!.id, groupId: group!.id });
    await db.insert(groupRoles).values({ groupId: group!.id, roleId: role!.id });

    const login = await request(app.server)
      .post('/auth/login')
      .send({ tenantSlug, email, password: 'ValidPass1!' });
    expect(login.status).toBe(200);
    expect(login.body.mfa_setup_required).toBe(true);
    expect(login.body.accessToken).toBeUndefined();
    const mfaSetupToken = login.body.mfa_session_token as string;

    const setup = await request(app.server)
      .post('/auth/mfa/setup')
      .set('Authorization', `Bearer ${mfaSetupToken}`);
    expect(setup.status).toBe(200);
    const secret = setup.body.secret as string;

    const verifySetup = await request(app.server)
      .post('/auth/mfa/verify-setup')
      .set('Authorization', `Bearer ${mfaSetupToken}`)
      .send({ secret, code: authenticator.generate(secret) });
    expect(verifySetup.status).toBe(200);

    const login2 = await request(app.server)
      .post('/auth/login')
      .send({ tenantSlug, email, password: 'ValidPass1!' });
    expect(login2.status).toBe(200);
    expect(login2.body.mfa_required).toBe(true);

    const challenge = await request(app.server)
      .post('/auth/mfa/challenge')
      .send({
        mfa_session_token: login2.body.mfa_session_token,
        totp_code: authenticator.generate(secret),
      });
    expect(challenge.status).toBe(200);
    expect(challenge.body.accessToken).toBeTruthy();

    const me = await request(app.server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${challenge.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.mfaVerified).toBe(true);
    expect(me.body.mfaRequired).toBe(true);
  });
});
