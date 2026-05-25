import type { FastifyInstance } from 'fastify';
import { eq, and, isNull } from 'drizzle-orm';
import {
  hashPassword,
  verifyPassword,
  validatePasswordPolicy,
  shouldLockout,
  lockoutDurationMs,
  signAccessToken,
  signRefreshToken,
  signMfaToken,
  verifyToken,
  hashToken,
  generateRefreshToken,
  getEffectivePermissions,
  userRequiresMfa,
  DEFAULT_PASSWORD_POLICY,
} from '@eam/auth';
import { db, users, sessions, tenants, audit } from '@eam/db';

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/register', async (request, reply) => {
    const body = request.body as {
      tenantSlug?: string;
      email: string;
      username: string;
      password: string;
      displayName: string;
    };
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, body.tenantSlug ?? 'default'))
      .limit(1);
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });

    const policy = { ...DEFAULT_PASSWORD_POLICY, ...(tenant.settings as { passwordPolicy?: object })?.passwordPolicy };
    const validation = validatePasswordPolicy(body.password, policy as typeof DEFAULT_PASSWORD_POLICY);
    if (!validation.valid) return reply.status(400).send({ errors: validation.errors });

    const passwordHash = await hashPassword(body.password);
    const [user] = await db
      .insert(users)
      .values({
        tenantId: tenant.id,
        email: body.email,
        username: body.username,
        passwordHash,
        displayName: body.displayName,
        authSource: 'LOCAL',
      })
      .returning();

    await audit(db, {
      tenantId: tenant.id,
      userId: user!.id,
      action: 'USER_REGISTERED',
      resource: 'users',
      resourceId: user!.id,
    });

    return reply.status(201).send({ id: user!.id, email: user!.email });
  });

  app.post('/auth/login', async (request, reply) => {
    const body = request.body as { email: string; password: string; tenantSlug?: string };
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, body.tenantSlug ?? 'default'))
      .limit(1);
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });

    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.tenantId, tenant.id), eq(users.email, body.email)))
      .limit(1);

    if (!user || !user.isActive) return reply.status(401).send({ error: 'Invalid credentials' });
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return reply.status(429).send({ error: 'Account locked', lockedUntil: user.lockedUntil });
    }

    const valid = user.passwordHash && (await verifyPassword(user.passwordHash, body.password));
    if (!valid) {
      const attempts = (user.failedLoginAttempts ?? 0) + 1;
      const policy = DEFAULT_PASSWORD_POLICY;
      const updates: Partial<typeof users.$inferInsert> = { failedLoginAttempts: attempts };
      if (shouldLockout(attempts, policy)) {
        updates.lockedUntil = new Date(Date.now() + lockoutDurationMs());
      }
      await db.update(users).set(updates).where(eq(users.id, user.id));
      await audit(db, {
        tenantId: tenant.id,
        action: 'LOGIN_FAILED',
        resource: 'auth',
        resourceId: user.id,
      });
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    if (user.mfaEnabled) {
      const mfaToken = await signMfaToken({
        sub: user.id,
        tenantId: tenant.id,
        email: user.email,
        roles: [],
        permissions: [],
      });
      return reply.send({ mfa_required: true, mfa_session_token: mfaToken });
    }

    const requiresMfa = await userRequiresMfa(db, user.id);
    if (requiresMfa && !user.mfaEnabled) {
      return reply.status(401).send({ error: 'mfa_required', code: 'mfa_required' });
    }

    return issueTokens(reply, user, tenant.id, request.ip);
  });

  app.post('/auth/refresh', async (request, reply) => {
    const body = request.body as { refreshToken: string };
    let payload;
    try {
      payload = await verifyToken(body.refreshToken);
    } catch {
      return reply.status(401).send({ error: 'Invalid refresh token' });
    }
    if (payload.type !== 'refresh') return reply.status(401).send({ error: 'Invalid token type' });

    const tokenHash = hashToken(body.refreshToken);
    const [session] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)))
      .limit(1);

    if (!session || session.expiresAt < new Date()) {
      return reply.status(401).send({ error: 'Session expired' });
    }

    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, session.id));

    const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    if (!user) return reply.status(401).send({ error: 'User not found' });
    return issueTokens(reply, user, payload.tenantId, request.ip);
  });

  app.post('/auth/logout', async (request, reply) => {
    const body = request.body as { refreshToken?: string };
    if (body.refreshToken) {
      const tokenHash = hashToken(body.refreshToken);
      await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, tokenHash));
    }
    return reply.send({ ok: true });
  });

  app.get('/auth/me', async (request, reply) => {
    const { authenticate } = await import('../plugins/auth.js');
    try {
      await authenticate(request);
    } catch (e) {
      return reply.status(401).send(e);
    }
    const [user] = await db.select().from(users).where(eq(users.id, request.user!.id)).limit(1);
    return reply.send({
      id: user!.id,
      email: user!.email,
      displayName: user!.displayName,
      roles: request.user!.roles,
      permissions: request.user!.permissions,
    });
  });
}

async function issueTokens(
  reply: { send: (x: unknown) => unknown },
  user: typeof users.$inferSelect,
  tenantId: string,
  ip?: string,
) {
  const { roles, permissions } = await getEffectivePermissions(db, user.id);
  const accessToken = await signAccessToken({
    sub: user.id,
    tenantId,
    email: user.email,
    roles,
    permissions,
  });
  const refreshToken = generateRefreshToken();
  const refreshJwt = await signRefreshToken({
    sub: user.id,
    tenantId,
    email: user.email,
    roles,
    permissions,
  });

  await db.insert(sessions).values({
    userId: user.id,
    tenantId,
    tokenHash: hashToken(refreshToken),
    ipAddress: ip,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  await db
    .update(users)
    .set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(users.id, user.id));

  return reply.send({ accessToken, refreshToken: refreshJwt, tokenType: 'Bearer' });
}
