import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 16;
const ENCRYPTED_PREFIX = 'enc:v1:';
function getKey(): Buffer | null {
  const hex = process.env.SMTP_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) return null;
  return Buffer.from(hex, 'hex');
}
export function encryptSmtpPassword(plaintext: string): string {
  const key = getKey();
  if (!key) return plaintext;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}
export function decryptSmtpPassword(stored: string): string {
  if (!stored) return '';
  if (!stored.startsWith(ENCRYPTED_PREFIX)) return stored;
  const key = getKey();
  if (!key) throw new Error('SMTP_ENCRYPTION_KEY is required to decrypt stored password');
  const parts = stored.slice(ENCRYPTED_PREFIX.length).split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted password format');
  const [ivHex, tagHex, ciphertextHex] = parts as [string, string, string];
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
}
export function isEncryptedPassword(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}
