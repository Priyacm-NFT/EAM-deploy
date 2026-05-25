export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    console.info(`[email:test] to=${to} subject=${subject}`);
    return;
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
  } catch (err) {
    console.warn('[email] send failed, logging body:', err);
    console.info(`[email:fallback] to=${to}\n${text}`);
  }
}

export async function sendSms(phone: string, message: string): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    console.info(`[sms:test] to=${phone} body=${message}`);
    return;
  }
  console.info(`[sms] to=${phone} body=${message}`);
}
