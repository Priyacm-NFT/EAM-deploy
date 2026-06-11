import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import {
  hashPassword,
  verifyPassword,
  validatePasswordPolicy,
  lockoutDurationMs,
  isPasswordExpired,
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
import { db, users, tenants, audit, groups, userGroups } from '@eam/db';
import { issueTokens, getUserAgent } from '../lib/tokens.js';
import { sendEmail } from '../lib/email.js';
import {
  isAccountLocked,
  recordFailedLogin,
  clearLoginLockout,
  storePasswordResetToken,
  consumePasswordResetToken,
} from '../lib/auth-state.js';

const PASSWORD_RESET_TTL = 60 * 60;

/** Finds the "All Users" default group for a tenant and adds the user to it. */
async function assignDefaultGroup(tenantId: string, userId: string, email?: string): Promise<void> {
  // Always add to "All Users" group — gives basic read permissions
  const [defaultGroup] = await db
    .select()
    .from(groups)
    .where(and(eq(groups.tenantId, tenantId), eq(groups.name, 'All Users')))
    .limit(1);

  if (defaultGroup) {
    await db
      .insert(userGroups)
      .values({ userId, groupId: defaultGroup.id })
      .onConflictDoNothing();
  }

  // If this is the admin user, also add to Admins group
  if (email === 'admin@eam.local') {
    const [adminsGroup] = await db
      .select()
      .from(groups)
      .where(and(eq(groups.tenantId, tenantId), eq(groups.name, 'Admins')))
      .limit(1);

    if (adminsGroup) {
      await db
        .insert(userGroups)
        .values({ userId, groupId: adminsGroup.id })
        .onConflictDoNothing();
    }
  }
}

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
    const now = new Date();
    try {
      const [user] = await db
        .insert(users)
        .values({
          tenantId: tenant.id,
          email: body.email,
          username: body.username,
          passwordHash,
          displayName: body.displayName,
          authSource: 'LOCAL',
          passwordChangedAt: now,
        })
        .returning();

      // Auto-assign every new user to the "All Users" group so they get
      // the default permissions and the sidebar sections are visible.
      await assignDefaultGroup(tenant.id, user!.id, body.email);

      await audit(db, {
        tenantId: tenant.id,
        userId: user!.id,
        action: 'USER_REGISTERED',
        resource: 'users',
        resourceId: user!.id,
      });

      return reply.status(201).send({ id: user!.id, email: user!.email });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('unique') || message.includes('duplicate')) {
        return reply.status(409).send({ error: 'Email or username already registered' });
      }
      throw err;
    }
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
    if (await isAccountLocked(user.id)) {
      return reply.status(429).send({ error: 'Account locked' });
    }

    const valid = user.passwordHash && (await verifyPassword(user.passwordHash, body.password));
    if (!valid) {
      const policy = DEFAULT_PASSWORD_POLICY;
      await recordFailedLogin(
        user.id,
        policy.lockoutAfterFailures,
        Math.ceil(lockoutDurationMs() / 1000),
      );
      await audit(db, {
        tenantId: tenant.id,
        action: 'LOGIN_FAILED',
        resource: 'auth',
        resourceId: user.id,
      });
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const loginPolicy = {
      ...DEFAULT_PASSWORD_POLICY,
      ...(tenant.settings as { passwordPolicy?: object })?.passwordPolicy,
    };
    if (
      isPasswordExpired(
        user.passwordChangedAt,
        user.createdAt,
        loginPolicy.maxAgeDays,
      )
    ) {
      return reply.status(401).send({
        error: 'Password expired',
        code: 'password_expired',
      });
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
      const mfaToken = await signMfaToken({
        sub: user.id,
        tenantId: tenant.id,
        email: user.email,
        roles: [],
        permissions: [],
      });
      return reply.send({ mfa_setup_required: true, mfa_session_token: mfaToken });
    }

    await clearLoginLockout(user.id);
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

    await audit(db, {
      tenantId: tenant.id,
      userId: user.id,
      action: 'LOGIN_SUCCESS',
      resource: 'auth',
      resourceId: user.id,
      ipAddress: request.ip,
    });

    return issueTokens(user, {
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

    return issueTokens(user, {
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
      await storePasswordResetToken(tokenHash, user.id, PASSWORD_RESET_TTL);
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
    const userId = await consumePasswordResetToken(tokenHash);
    if (!userId) {
      return reply.status(400).send({ error: 'Invalid or expired token' });
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return reply.status(400).send({ error: 'Invalid token' });

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, user.tenantId)).limit(1);
    const policy = {
      ...DEFAULT_PASSWORD_POLICY,
      ...(tenant?.settings as { passwordPolicy?: object })?.passwordPolicy,
    };
    const validation = validatePasswordPolicy(body.password, policy as typeof DEFAULT_PASSWORD_POLICY);
    if (!validation.valid) return reply.status(400).send({ errors: validation.errors });

    const passwordHash = await hashPassword(body.password);
    await db
      .update(users)
      .set({ passwordHash, passwordChangedAt: new Date() })
      .where(eq(users.id, user.id));

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
    try {
      await request.server.authenticate(request);
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
      mfaEnabled: user!.mfaEnabled,
      mfaVerified: request.user!.mfaVerified,
      mfaRequired: await userRequiresMfa(db, user!.id),
    });
  });
}

function sessionActive(request: { user?: { sessionId?: string } }): boolean {
  return Boolean(request.user?.sessionId);
}
