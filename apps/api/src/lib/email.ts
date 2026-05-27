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

export async function sendSms(phone: string, message: string): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    console.info(`[sms:test] to=${phone} body=${message}`);
    return;
  }
  console.info(`[sms] to=${phone} body=${message}`);
}
