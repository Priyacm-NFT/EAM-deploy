import { decryptSmtpPassword } from './smtp-crypto.js';

export interface SmtpConfigLike {
  host: string;
  port: number;
  secure?: boolean | null;
  username?: string | null;
  password?: string | null;
  fromEmail: string;
  fromName?: string | null;
}

export function normalizeSmtpHost(host: string): string {
  return host.trim();
}

export function smtpAuth(
  username?: string | null,
  password?: string | null,
): { user: string; pass: string } | undefined {
  const user = username?.trim();
  if (!user) return undefined;
  const pass = password ? decryptSmtpPassword(password) : '';
  if (!pass) return undefined;
  return { user, pass };
}

export function smtpFromAddress(cfg: SmtpConfigLike): string {
  const email = cfg.fromEmail.trim();
  const name = cfg.fromName?.trim();
  return name ? `"${name}" <${email}>` : email;
}

export async function createSmtpTransport(cfg: SmtpConfigLike) {
  const nodemailer = await import('nodemailer');
  return nodemailer.createTransport({
    host: normalizeSmtpHost(cfg.host),
    port: cfg.port,
    secure: cfg.secure ?? false,
    auth: smtpAuth(cfg.username, cfg.password),
  });
}
