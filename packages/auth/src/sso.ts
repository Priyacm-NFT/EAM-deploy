import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

const ALGO = 'aes-256-gcm';

function getKey(): Buffer {
  const key = process.env.INTEGRATION_SECRET_KEY ?? '00000000000000000000000000000000';
  return createHash('sha256').update(key).digest();
}

export function encryptIdpConfig(config: Record<string, unknown>): string {
  const plaintext = JSON.stringify(config);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptIdpConfig(ciphertext: string | Record<string, unknown>): Record<string, unknown> {
  if (typeof ciphertext === 'object') {
    const enc = ciphertext._encrypted;
    if (typeof enc === 'string') return decryptIdpConfig(enc);
    if (!('_encrypted' in ciphertext)) return ciphertext;
  }
  if (typeof ciphertext !== 'string') return {};
  const buf = Buffer.from(ciphertext, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  const json = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  return JSON.parse(json) as Record<string, unknown>;
}

export interface ClaimsMap {
  email?: string;
  name?: string;
  groups?: string;
  externalId?: string;
}

export function mapClaims(
  attributes: Record<string, unknown>,
  claimsMap: ClaimsMap,
): {
  email: string;
  displayName: string;
  externalId: string;
  groupNames: string[];
} {
  const emailKey = claimsMap.email ?? 'email';
  const nameKey = claimsMap.name ?? 'displayName';
  const groupsKey = claimsMap.groups ?? 'groups';
  const extKey = claimsMap.externalId ?? 'nameID';

  const email = String(attributes[emailKey] ?? attributes.email ?? '');
  const displayName = String(attributes[nameKey] ?? attributes.displayName ?? email);
  const externalId = String(attributes[extKey] ?? attributes.nameID ?? email);
  const rawGroups = attributes[groupsKey];
  const groupNames = Array.isArray(rawGroups)
    ? rawGroups.map(String)
    : typeof rawGroups === 'string'
      ? [rawGroups]
      : [];

  return { email, displayName, externalId, groupNames };
}
