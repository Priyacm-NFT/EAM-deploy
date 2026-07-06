import type { FastifyRequest } from 'fastify';
import {
  verifyToken,
  hasPermission,
  type AuthUser,
  userRequiresMfa,
  getSessionById,
  validateStoredSession,
  touchSession,
} from '@eam/auth';
import { parseSessionPolicy } from '@eam/shared';
import { db, users, tenants } from '@eam/db';
import { eq } from 'drizzle-orm';

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export async function authenticate(request: FastifyRequest): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw { statusCode: 401, message: 'Unauthorized' };
  }
  const token = header.slice(7);
  try {
    const payload = await verifyToken(token);
    if (payload.type !== 'access') throw new Error('invalid token type');

    const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    if (!user || !user.isActive) {
      throw { statusCode: 401, message: 'Unauthorized' };
    }

    if (payload.sid) {
      const session = await getSessionById(db, payload.sid);
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, user.tenantId)).limit(1);
      const policy = parseSessionPolicy((tenant?.settings ?? {}) as Record<string, unknown>);
      if (!session || !validateStoredSession(session, policy)) {
        throw { statusCode: 401, message: 'Session revoked or expired' };
      }
      await touchSession(db, payload.sid);
    }

    const requiresMfa = await userRequiresMfa(db, user.id);
    if (requiresMfa && !payload.mfa_verified) {
      throw { statusCode: 401, message: 'mfa_required', code: 'mfa_required' };
    }

    request.user = {
      id: payload.sub,
      tenantId: payload.tenantId,
      email: payload.email,
      displayName: user.displayName,
      roles: payload.roles,
      permissions: payload.permissions,
      // FIX: PRD §8.1 data scoping — carry the org/site/location
      // restriction from the JWT onto request.user, so every route
      // handler can read request.user!.scope without an extra DB call.
      // Falls back to fully unrestricted if an older token (signed before
      // this field existed) is still in use, so existing sessions don't
      // break on deploy — they'll pick up real scope on their next
      // refresh.
      scope: payload.scope ?? { unrestricted: true, organisationIds: [], siteIds: [], locationIds: [] },
      sessionId: payload.sid,
      mfaVerified: payload.mfa_verified ?? false,
    };
  } catch (e) {
    if (typeof e === 'object' && e !== null && 'statusCode' in e) throw e;
    throw { statusCode: 401, message: 'Unauthorized' };
  }
}

export function requirePermission(permission: string) {
  return async function (request: FastifyRequest): Promise<void> {
    await authenticate(request);
    if (!request.user || !hasPermission(request.user.permissions, permission)) {
      throw { statusCode: 403, message: 'Forbidden' };
    }
  };
}
