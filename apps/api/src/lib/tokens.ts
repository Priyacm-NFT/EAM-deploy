import type { FastifyRequest } from 'fastify';
import {
  signAccessToken,
  hashToken,
  generateRefreshToken,
  getEffectivePermissions,
  computeSessionExpiry,
  enforceConcurrentLimit,
} from '@eam/auth';
import { parseSessionPolicy } from '@eam/shared';
import { db, sessions, tenants } from '@eam/db';
import { eq } from 'drizzle-orm';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
}

export async function issueTokens(
  user: {
    id: string;
    email: string;
    tenantId: string;
    displayName: string;
  },
  opts: {
    ip?: string;
    userAgent?: string;
    mfaVerified?: boolean;
  } = {},
): Promise<IssuedTokens> {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, user.tenantId)).limit(1);
  const policy = parseSessionPolicy((tenant?.settings ?? {}) as Record<string, unknown>);

  const { roles, permissions } = await getEffectivePermissions(db, user.id);
  const refreshToken = generateRefreshToken();
  const now = new Date();
  const expiresAt = computeSessionExpiry(policy, now);

  const [session] = await db
    .insert(sessions)
    .values({
      userId: user.id,
      tenantId: user.tenantId,
      tokenHash: hashToken(refreshToken),
      ipAddress: opts.ip,
      userAgent: opts.userAgent,
      expiresAt,
    })
    .returning();

  await enforceConcurrentLimit(db, user.id, policy.maxConcurrentSessions);

  const accessToken = await signAccessToken({
    sub: user.id,
    tenantId: user.tenantId,
    email: user.email,
    roles,
    permissions,
    sid: session!.id,
    mfa_verified: opts.mfaVerified ?? false,
  });

  return { accessToken, refreshToken, tokenType: 'Bearer' as const };
}

export function getUserAgent(request: FastifyRequest): string | undefined {
  const ua = request.headers['user-agent'];
  return typeof ua === 'string' ? ua : undefined;
}
