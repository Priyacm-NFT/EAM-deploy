import type { FastifyInstance, FastifyRequest } from 'fastify';
import { eq, and, isNull } from 'drizzle-orm';
import {
  generateTotpSecret,
  getTotpUri,
  verifyTotp,
  encryptSecret,
  decryptSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyToken,
  hashToken,
} from '@eam/auth';
import { db, users, mfaRecoveryCodes, audit } from '@eam/db';
import { authenticate } from '../plugins/auth.js';
import { issueTokens, getUserAgent } from '../lib/tokens.js';
import { redisSetex, redisGet, redisDel } from '../lib/redis.js';
import { sendSms } from '../lib/email.js';
import { clearLoginLockout, clearMfaPhone, getMfaPhone, storeMfaPhone } from '../lib/auth-state.js';
import QRCode from 'qrcode';

const SMS_OTP_TTL = 300;
const PUSH_CHALLENGE_TTL = 120;

interface MfaSetupActor {
  id: string;
  tenantId: string;
  email: string;
}

/** Accepts a normal access token or a short-lived MFA setup session token. */
async function authenticateForMfaSetup(request: FastifyRequest): Promise<MfaSetupActor> {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw { statusCode: 401, message: 'Unauthorized' };
  }
  try {
    const payload = await verifyToken(header.slice(7));
    if (payload.type !== 'access' && payload.type !== 'mfa') {
      throw new Error('invalid token type');
    }
    const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    if (!user || !user.isActive) throw new Error('invalid user');
    return { id: user.id, tenantId: user.tenantId, email: user.email };
  } catch (e) {
    if (typeof e === 'object' && e !== null && 'statusCode' in e) throw e;
    throw { statusCode: 401, message: 'Unauthorized' };
  }
}

export async function mfaRoutes(app: FastifyInstance) {
  app.post('/auth/mfa/setup', async (request, reply) => {
    let actor: MfaSetupActor;
    try {
      actor = await authenticateForMfaSetup(request);
    } catch (e) {
      return reply.status(401).send(e);
    }
    const secret = generateTotpSecret();
    const uri = getTotpUri(secret, actor.email);
    const qrDataUri = await QRCode.toDataURL(uri);
    return reply.send({ secret, qrDataUri, otpauthUri: uri });
  });

  app.post('/auth/mfa/verify-setup', async (request, reply) => {
    let actor: MfaSetupActor;
    try {
      actor = await authenticateForMfaSetup(request);
    } catch (e) {
      return reply.status(401).send(e);
    }
    const body = request.body as { secret: string; code: string };
    if (!verifyTotp(body.secret, body.code)) {
      return reply.status(400).send({ error: 'Invalid TOTP code' });
    }

    const encrypted = encryptSecret(body.secret);
    await db
      .update(users)
      .set({ mfaSecret: encrypted, mfaEnabled: true })
      .where(eq(users.id, actor.id));

    await db.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, actor.id));
    const codes = generateRecoveryCodes(10);
    await db.insert(mfaRecoveryCodes).values(
      codes.map((code) => ({
        userId: actor.id,
        codeHash: hashRecoveryCode(code),
      })),
    );

    await audit(db, {
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'MFA_ENABLED',
      resource: 'auth',
      resourceId: actor.id,
    });

    return reply.send({ recoveryCodes: codes });
  });

  app.post('/auth/mfa/challenge', async (request, reply) => {
    const body = request.body as {
      mfa_session_token: string;
      totp_code?: string;
      recovery_code?: string;
    };

    let payload;
    try {
      payload = await verifyToken(body.mfa_session_token);
    } catch {
      return reply.status(401).send({ error: 'Invalid MFA session' });
    }
    if (payload.type !== 'mfa') return reply.status(401).send({ error: 'Invalid token type' });

    const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    if (!user || !user.isActive || !user.mfaSecret) {
      return reply.status(401).send({ error: 'Invalid MFA session' });
    }

    let valid = false;
    if (body.totp_code) {
      const secret = decryptSecret(user.mfaSecret);
      valid = verifyTotp(secret, body.totp_code);
    } else if (body.recovery_code) {
      const codeHash = hashRecoveryCode(body.recovery_code.replace(/\s/g, '').toUpperCase());
      const [row] = await db
        .select()
        .from(mfaRecoveryCodes)
        .where(
          and(
            eq(mfaRecoveryCodes.userId, user.id),
            eq(mfaRecoveryCodes.codeHash, codeHash),
            isNull(mfaRecoveryCodes.usedAt),
          ),
        )
        .limit(1);
      if (row) {
        valid = true;
        await db
          .update(mfaRecoveryCodes)
          .set({ usedAt: new Date() })
          .where(eq(mfaRecoveryCodes.id, row.id));
      }
    }

    if (!valid) return reply.status(401).send({ error: 'Invalid MFA code' });

    await clearLoginLockout(user.id);
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

    return issueTokens(user, {
      ip: request.ip,
      userAgent: getUserAgent(request),
      mfaVerified: true,
    });
  });

  app.post('/auth/mfa/disable', async (request, reply) => {
    try {
      await authenticate(request);
    } catch (e) {
      return reply.status(401).send(e);
    }
    const body = request.body as { code: string };
    const [user] = await db.select().from(users).where(eq(users.id, request.user!.id)).limit(1);
    if (!user?.mfaSecret) return reply.status(400).send({ error: 'MFA not enabled' });

    const secret = decryptSecret(user.mfaSecret);
    if (!verifyTotp(secret, body.code)) {
      return reply.status(400).send({ error: 'Invalid TOTP code' });
    }

    await db
      .update(users)
      .set({ mfaEnabled: false, mfaSecret: null })
      .where(eq(users.id, user.id));
    await db.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, user.id));
    await clearMfaPhone(user.id);

    await audit(db, {
      tenantId: user.tenantId,
      userId: user.id,
      action: 'MFA_DISABLED',
      resource: 'auth',
      resourceId: user.id,
    });

    return reply.send({ ok: true });
  });

  app.post('/auth/mfa/sms/send', async (request, reply) => {
    const body = request.body as { mfa_session_token: string };
    let payload;
    try {
      payload = await verifyToken(body.mfa_session_token);
    } catch {
      return reply.status(401).send({ error: 'Invalid MFA session' });
    }
    if (payload.type !== 'mfa') return reply.status(401).send({ error: 'Invalid token type' });

    const phone = await getMfaPhone(payload.sub);
    if (!phone) return reply.status(400).send({ error: 'Phone not configured' });

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    await redisSetex(`mfa:otp:${payload.sub}`, SMS_OTP_TTL, otp);
    await sendSms(phone, `Your EAM verification code is ${otp}`);
    return reply.send({ sent: true });
  });

  app.post('/auth/mfa/sms/verify', async (request, reply) => {
    const body = request.body as { mfa_session_token: string; code: string };
    let payload;
    try {
      payload = await verifyToken(body.mfa_session_token);
    } catch {
      return reply.status(401).send({ error: 'Invalid MFA session' });
    }
    if (payload.type !== 'mfa') return reply.status(401).send({ error: 'Invalid token type' });

    const stored = await redisGet(`mfa:otp:${payload.sub}`);
    if (!stored || stored !== body.code) {
      return reply.status(401).send({ error: 'Invalid OTP' });
    }
    await redisDel(`mfa:otp:${payload.sub}`);

    const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    if (!user || !user.isActive) return reply.status(401).send({ error: 'User not found' });

    return issueTokens(user, {
      ip: request.ip,
      userAgent: getUserAgent(request),
      mfaVerified: true,
    });
  });

  app.post('/auth/mfa/push/send', async (request, reply) => {
    const body = request.body as { mfa_session_token: string };
    let payload;
    try {
      payload = await verifyToken(body.mfa_session_token);
    } catch {
      return reply.status(401).send({ error: 'Invalid MFA session' });
    }
    if (payload.type !== 'mfa') return reply.status(401).send({ error: 'Invalid token type' });

    const challengeId = hashToken(`${payload.sub}:${Date.now()}`);
    await redisSetex(`mfa:push:${challengeId}`, PUSH_CHALLENGE_TTL, JSON.stringify({ userId: payload.sub, status: 'pending' }));

    if (process.env.MFA_PUSH_AUTO_APPROVE === 'true') {
      await redisSetex(
        `mfa:push:${challengeId}`,
        PUSH_CHALLENGE_TTL,
        JSON.stringify({ userId: payload.sub, status: 'approved' }),
      );
    }

    return reply.send({ challengeId, pollUrl: `/auth/mfa/push/poll` });
  });

  app.post('/auth/mfa/push/poll', async (request, reply) => {
    const body = request.body as { challengeId: string; mfa_session_token: string };
    let payload;
    try {
      payload = await verifyToken(body.mfa_session_token);
    } catch {
      return reply.status(401).send({ error: 'Invalid MFA session' });
    }

    const raw = await redisGet(`mfa:push:${body.challengeId}`);
    if (!raw) return reply.status(401).send({ error: 'Challenge expired' });

    const challenge = JSON.parse(raw) as { userId: string; status: string };
    if (challenge.userId !== payload.sub) {
      return reply.status(401).send({ error: 'Invalid challenge' });
    }
    if (challenge.status === 'pending') {
      return reply.send({ status: 'pending' });
    }
    if (challenge.status !== 'approved') {
      return reply.status(401).send({ error: 'Push denied' });
    }

    await redisDel(`mfa:push:${body.challengeId}`);
    const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    if (!user || !user.isActive) return reply.status(401).send({ error: 'User not found' });

    return issueTokens(user, {
      ip: request.ip,
      userAgent: getUserAgent(request),
      mfaVerified: true,
    });
  });

  app.post('/auth/mfa/sms/enroll', async (request, reply) => {
    try {
      await authenticate(request);
    } catch (e) {
      return reply.status(401).send(e);
    }
    const body = request.body as { phone: string };
    await storeMfaPhone(request.user!.id, body.phone);
    await db
      .update(users)
      .set({ mfaEnabled: true, phone: body.phone })
      .where(eq(users.id, request.user!.id));
    return reply.send({ ok: true });
  });
}
