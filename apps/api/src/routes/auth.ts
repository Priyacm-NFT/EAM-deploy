import type { FastifyInstance } from 'fastify';
import { eq, and, isNull } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import {
  hashPassword,
  verifyPassword,
  validatePasswordPolicy,
  shouldLockout,
  lockoutDurationMs,
  signMfaToken,
  hashToken,
  userRequiresMfa,
  DEFAULT_PASSWORD_POLICY,
  getSessionByTokenHash,
  validateStoredSession,
  touchSession,
  revokeSessionById,
} from '@eam/auth';
import { parseSessionPolicy } from '@eam/shared';
import { db, users, tenants, audit, passwordResetTokens } from '@eam/db';
import { issueTokens, getUserAgent } from '../lib/tokens.js';
import { sendEmail } from '../lib/email.js';

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

    const policy = {
      ...DEFAULT_PASSWORD_POLICY,
      ...(tenant.settings as { passwordPolicy?: object })?.passwordPolicy,
    };
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

    await db
      .update(users)
      .set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    await audit(db, {
      tenantId: tenant.id,
      userId: user.id,
      action: 'LOGIN_SUCCESS',
      resource: 'auth',
      resourceId: user.id,
      ipAddress: request.ip,
    });

    return issueTokens(reply, user, {
      ip: request.ip,
      userAgent: getUserAgent(request),
      mfaVerified: false,
    });
  });

  app.post('/auth/refresh', async (request, reply) => {
    const body = request.body as { refreshToken: string };
    const tokenHash = hashToken(body.refreshToken);
    const session = await getSessionByTokenHash(db, tokenHash);
    if (!session) return reply.status(401).send({ error: 'Session expired' });

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, session.tenantId)).limit(1);
    const policy = parseSessionPolicy((tenant?.settings ?? {}) as Record<string, unknown>);
    if (!validateStoredSession(session, policy)) {
      await revokeSessionById(db, session.id);
      return reply.status(401).send({ error: 'Session expired' });
    }

    await revokeSessionById(db, session.id);

    const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
    if (!user || !user.isActive) return reply.status(401).send({ error: 'User not found' });

    return issueTokens(reply, user, {
      ip: request.ip,
      userAgent: getUserAgent(request),
      mfaVerified: user.mfaEnabled,
    });
  });

  app.post('/auth/logout', async (request, reply) => {
    const body = request.body as { refreshToken?: string };
    if (body.refreshToken) {
      const tokenHash = hashToken(body.refreshToken);
      const session = await getSessionByTokenHash(db, tokenHash);
      if (session) {
        await revokeSessionById(db, session.id);
        await audit(db, {
          tenantId: session.tenantId,
          userId: session.userId,
          action: 'LOGOUT',
          resource: 'auth',
          resourceId: session.userId,
          ipAddress: request.ip,
        });
      }
    }
    return reply.send({ ok: true });
  });

  app.post('/auth/password/reset-request', async (request, reply) => {
    const body = request.body as { email: string; tenantSlug?: string };
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, body.tenantSlug ?? 'default'))
      .limit(1);
    if (!tenant) return reply.send({ ok: true });

    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.tenantId, tenant.id), eq(users.email, body.email)))
      .limit(1);

    if (user?.passwordHash) {
      const rawToken = randomBytes(32).toString('base64url');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      await db.insert(passwordResetTokens).values({
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      const baseUrl = process.env.WEB_URL ?? 'http://localhost:5173';
      await sendEmail(
        user.email,
        'Password reset',
        `Reset your password: ${baseUrl}/reset-password?token=${rawToken}`,
      );
      await audit(db, {
        tenantId: tenant.id,
        userId: user.id,
        action: 'PASSWORD_RESET_REQUESTED',
        resource: 'auth',
        resourceId: user.id,
      });
    }
    return reply.send({ ok: true });
  });

  app.post('/auth/password/reset', async (request, reply) => {
    const body = request.body as { token: string; password: string };
    const tokenHash = createHash('sha256').update(body.token).digest('hex');
    const [row] = await db
      .select()
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.tokenHash, tokenHash), isNull(passwordResetTokens.usedAt)))
      .limit(1);

    if (!row || row.expiresAt < new Date()) {
      return reply.status(400).send({ error: 'Invalid or expired token' });
    }

    const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
    if (!user) return reply.status(400).send({ error: 'Invalid token' });

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, user.tenantId)).limit(1);
    const policy = {
      ...DEFAULT_PASSWORD_POLICY,
      ...(tenant?.settings as { passwordPolicy?: object })?.passwordPolicy,
    };
    const validation = validatePasswordPolicy(body.password, policy as typeof DEFAULT_PASSWORD_POLICY);
    if (!validation.valid) return reply.status(400).send({ errors: validation.errors });

    const passwordHash = await hashPassword(body.password);
    await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, row.id));

    await audit(db, {
      tenantId: user.tenantId,
      userId: user.id,
      action: 'PASSWORD_RESET',
      resource: 'auth',
      resourceId: user.id,
    });

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
    if (sessionActive(request)) {
      await touchSession(db, request.user!.sessionId!);
    }
    return reply.send({
      id: user!.id,
      email: user!.email,
      displayName: user!.displayName,
      roles: request.user!.roles,
      permissions: request.user!.permissions,
      mfaVerified: request.user!.mfaVerified,
    });
  });
}

function sessionActive(request: { user?: { sessionId?: string } }): boolean {
  return Boolean(request.user?.sessionId);
}
