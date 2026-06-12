export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  if (process.env.NODE_ENV === 'test') {
    console.info(`[email:test] to=${to} subject=${subject}`);
    return true;
  }
  try {
    const nodemailer = await import('nodemailer');
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'localhost',
      port: Number(process.env.SMTP_PORT ?? 1025),
      secure: process.env.SMTP_SECURE === 'true',
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM ?? 'noreply@eam.local',
      to,
      subject,
      text,
    });
    if (process.env.NODE_ENV === 'development') {
      console.info(`[email] Sent to ${to} — view at http://localhost:8025 (Mailhog)`);
    }
    return true;
  } catch (err) {
    console.warn('[email] SMTP failed. Start Mailhog: docker compose -f docker/docker-compose.dev.yml up -d mailhog');
    console.warn('[email] Error:', err instanceof Error ? err.message : err);
    console.info('\n[email:dev-fallback] ───────────────────────────────────────');
    console.info(`  To:      ${to}`);
    console.info(`  Subject: ${subject}`);
    console.info(`  ${text}`);
    console.info('[email:dev-fallback] ───────────────────────────────────────\n');
    return false;
  }
}
 
// ─── SMS — reads provider config from tenant settings ─────────────────────────
const MASKED = '••••••••';
/** Strip masked placeholder — returns undefined so env var fallback kicks in */
function unmasked(val: unknown): string {
  const s = ((val as string) || '').trim();
  return s === MASKED ? '' : s;
}
 
export async function sendSms(phone: string, message: string): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    console.info(`[sms:test] to=${phone} body=${message}`);
    return;
  }
 
  // Load SMS config from tenant settings (default tenant = first tenant in DB)
  let cfg: Record<string, unknown> | undefined;
  try {
    const { db, tenants } = await import('@eam/db');
    const [row] = await db.select({ settings: tenants.settings }).from(tenants).limit(1);
    cfg = (row?.settings as Record<string, unknown>)?.smsConfig as Record<string, unknown> | undefined;
  } catch {
    cfg = undefined;
  }
 
  // Fall back to env vars if no DB config
  const provider = unmasked(cfg?.provider) || process.env.SMS_PROVIDER || '';
 
  if (!provider) {
    console.info(`[sms:stub] to=${phone} msg=${message}`);
    console.warn('[sms] No SMS provider configured. Set SMS_PROVIDER env or configure in Identity → SMS OTP Config.');
    return;
  }
 
  // ── Twilio ────────────────────────────────────────────────────────────────
  if (provider === 'twilio') {
    const sid   = unmasked(cfg?.accountSid) || process.env.TWILIO_ACCOUNT_SID || '';
    const token = unmasked(cfg?.authToken)  || process.env.TWILIO_AUTH_TOKEN  || '';
    const from  = unmasked(cfg?.fromNumber) || process.env.TWILIO_FROM_NUMBER || '';
    if (!sid || !token || !from) throw new Error('Twilio credentials not configured');
 
    const creds = Buffer.from(`${sid}:${token}`).toString('base64');
    const body  = new URLSearchParams({ To: phone, From: from, Body: message });
    const res   = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({})) as { message?: string };
      throw new Error(`Twilio ${res.status}: ${e.message ?? res.statusText}`);
    }
    console.info(`[sms:twilio] Sent to ${phone}`);
    return;
  }
 
  // ── AWS SNS ───────────────────────────────────────────────────────────────
  if (provider === 'aws_sns') {
    const region = unmasked(cfg?.awsRegion)      || process.env.AWS_REGION            || 'ap-south-1';
    const keyId  = unmasked(cfg?.awsAccessKeyId) || process.env.AWS_ACCESS_KEY_ID     || '';
    const secret = unmasked(cfg?.authToken)      || process.env.AWS_SECRET_ACCESS_KEY || '';
    if (!keyId || !secret) throw new Error('AWS credentials not configured');
    try {
      const { SNSClient, PublishCommand } = await import('@aws-sdk/client-sns');
      const sns = new SNSClient({ region, credentials: { accessKeyId: keyId, secretAccessKey: secret } });
      await sns.send(new PublishCommand({ PhoneNumber: phone, Message: message }));
      console.info(`[sms:aws_sns] Sent to ${phone}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('Cannot find module')) throw new Error('Run: pnpm add @aws-sdk/client-sns --filter api');
      throw e;
    }
    return;
  }
 
  // ── MSG91 ─────────────────────────────────────────────────────────────────
  if (provider === 'msg91') {
    const apiKey   = unmasked(cfg?.apiKey)   || process.env.MSG91_API_KEY    || '';
    const senderId = unmasked(cfg?.senderId) || unmasked(cfg?.fromNumber) || process.env.MSG91_SENDER_ID || 'EAMAPP';
    if (!apiKey) throw new Error('MSG91 API key not configured');
 
    const otpMatch = message.match(/\d{4,8}/);
    const otp      = otpMatch ? otpMatch[0] : '000000';
    const mobile   = phone.replace(/^\+/, '');
    const url      = `https://api.msg91.com/api/v5/otp?mobile=${encodeURIComponent(mobile)}&authkey=${encodeURIComponent(apiKey)}&otp=${otp}&sender=${encodeURIComponent(senderId)}&otp_expiry=5`;
 
    const res  = await fetch(url);
    const data = await res.json().catch(() => ({})) as { type?: string; message?: string };
    if (data.type === 'error') throw new Error(`MSG91: ${data.message ?? JSON.stringify(data)}`);
    if (!res.ok) throw new Error(`MSG91 HTTP ${res.status}`);
    console.info(`[sms:msg91] Sent to ${phone}, OTP: ${otp}`);
    return;
  }
 
  throw new Error(`Unknown SMS provider: "${provider}". Supported: twilio, aws_sns, msg91`);
}
 