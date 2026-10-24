import nodemailer from 'nodemailer';
import { config, emailEnabled } from './config.js';

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

export async function sendVerificationEmail(to, name, code) {
  if (!emailEnabled()) throw new Error('SMTP is not configured');
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
