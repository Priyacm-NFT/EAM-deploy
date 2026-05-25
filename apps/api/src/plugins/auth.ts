import type { FastifyRequest } from 'fastify';
import { verifyToken, hasPermission, type AuthUser } from '@eam/auth';

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
    request.user = {
      id: payload.sub,
      tenantId: payload.tenantId,
      email: payload.email,
      displayName: payload.email,
      roles: payload.roles,
      permissions: payload.permissions,
    };
  } catch {
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
