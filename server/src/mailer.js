import nodemailer from 'nodemailer';
import { config, emailjsEnabled, smtpEnabled } from './config.js';

let transporter = null;

function getTransporter() {
  transporter ??= nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  return transporter;
}

const escapeHtml = (text) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * EmailJS REST API. Server-side calls need "Allow EmailJS API for non-browser
 * applications" enabled in EmailJS → Account → Security; the private key is sent
 * as `accessToken`. Both our variable names (to_email, code) and those of EmailJS's built-in
 * "One-Time Password" template (email, passcode, time) are filled — same as the app's emailjs.ts.
 */
async function sendWithEmailJs(to, name, code) {
  const { serviceId, templateId, publicKey, privateKey, apiUrl } = config.emailjs;
  const first = name.split(' ')[0];
  const expires = new Date(Date.now() + 10 * 60_000).toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: config.timezone,
  });
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      ...(privateKey ? { accessToken: privateKey } : {}),
      template_params: { to_email: to, email: to, to_name: first, name: first, code, passcode: code, time: expires, app_name: 'TeaRush' },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`EmailJS ${res.status}: ${await res.text()}`);
}

export async function sendVerificationEmail(to, name, code) {
  if (!smtpEnabled()) {
    if (emailjsEnabled()) return sendWithEmailJs(to, name, code);
    throw new Error('No email provider is configured');
  }
  const first = escapeHtml(name.split(' ')[0]);
  await getTransporter().sendMail({
    from: config.smtp.from,
    to,
    subject: `${code} is your TeaRush verification code`,
    text: `Hi ${first},\n\nYour TeaRush verification code is ${code}. It expires in 10 minutes.\n\nIf you didn't create a TeaRush account, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;color:#3C2415">
      <h2 style="margin:0 0 8px">Verify your email</h2>
      <p>Hi ${first}, enter this code in the TeaRush app:</p>
      <p style="font-size:32px;font-weight:bold;letter-spacing:8px;background:#FBF3E6;border-radius:12px;padding:14px;text-align:center">${code}</p>
      <p style="color:#8A7362;font-size:13px">The code expires in 10 minutes. If you didn't create a TeaRush account, ignore this email.</p>
    </div>`,
  });
}
