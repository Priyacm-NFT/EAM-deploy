import {
  generateKeyPair,
  importPKCS8,
  importSPKI,
  SignJWT,
  jwtVerify,
  type KeyLike,
} from 'jose';
import type { JwtPayload } from './types.js';

let privateKey: KeyLike | null = null;
let publicKey: KeyLike | null = null;

export async function initJwtKeys(): Promise<void> {
  const privPem = process.env.JWT_PRIVATE_KEY;
  const pubPem = process.env.JWT_PUBLIC_KEY;
  if (privPem && pubPem) {
    privateKey = await importPKCS8(Buffer.from(privPem, 'base64').toString('utf8'), 'RS256');
    publicKey = await importSPKI(Buffer.from(pubPem, 'base64').toString('utf8'), 'RS256');
    return;
  }
  const { publicKey: pub, privateKey: priv } = await generateKeyPair('RS256', {
    extractable: true,
  });
  privateKey = priv;
  publicKey = pub;
  if (process.env.NODE_ENV === 'development') {
    console.warn('[auth] Generated dev JWT keys for this process.');
  }
}

export async function signAccessToken(payload: Omit<JwtPayload, 'type'>): Promise<string> {
  if (!privateKey) await initJwtKeys();
  return new SignJWT({ ...payload, type: 'access' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(privateKey!);
}

export async function signRefreshToken(payload: Omit<JwtPayload, 'type'>): Promise<string> {
  if (!privateKey) await initJwtKeys();
  return new SignJWT({ ...payload, type: 'refresh' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(privateKey!);
}

export async function signMfaToken(payload: Omit<JwtPayload, 'type'>): Promise<string> {
  if (!privateKey) await initJwtKeys();
  return new SignJWT({ ...payload, type: 'mfa' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey!);
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  if (!publicKey) await initJwtKeys();
  const { payload } = await jwtVerify(token, publicKey!, { algorithms: ['RS256'] });
  return payload as unknown as JwtPayload;
}

export function getAlgorithm(): string {
  return 'RS256';
}
