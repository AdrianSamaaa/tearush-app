import crypto from 'node:crypto';
import { Router } from 'express';
import { config, emailEnabled } from '../config.js';
import { db, nowIso, transaction } from '../db.js';
import { hashPassword, rateLimit, requireAuth, signToken, toUserJson, verifyPassword } from '../auth.js';
import { ApiError, badRequest, conflict, optionalPhone, requireEmail, requireString, unauthorized } from '../errors.js';
import { sendVerificationEmail } from '../mailer.js';

export const authRouter = Router();

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
const findByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
const findById = db.prepare('SELECT * FROM users WHERE id = ?');

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

function requirePassword(value, field = 'Password') {
  const password = typeof value === 'string' ? value : '';
  if (password.length < 8) throw badRequest(`${field} must be at least 8 characters.`);
  if (password.length > 128) throw badRequest(`${field} is too long.`);
  return password;
}

const codeHash = (userId, code) => crypto.createHmac('sha256', config.jwtSecret).update(`${userId}:${code}`).digest('hex');

/**
 * Emails a fresh 6-digit code. Returns what the app should show:
 * `{ sentTo, devCode? , error? }` — devCode only when no SMTP is set up and demo mode is on.
 */
async function sendVerification(user, { enforceCooldown = false } = {}) {
  if (enforceCooldown && user.verify_sent_at) {
    const wait = RESEND_COOLDOWN_MS - (Date.now() - Date.parse(user.verify_sent_at));
    if (wait > 0) throw new ApiError(429, `Please wait ${Math.ceil(wait / 1000)} seconds before requesting another code.`);
  }
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  db.prepare('UPDATE users SET verify_code_hash = ?, verify_expires_at = ?, verify_sent_at = ?, verify_attempts = 0 WHERE id = ?').run(
    codeHash(user.id, code),
    new Date(Date.now() + CODE_TTL_MS).toISOString(),
    nowIso(),
    user.id
  );
  const result = { sentTo: user.email };
  if (!emailEnabled()) {
    if (config.emailDemoMode) {
      console.log(`[email] (demo) verification code for ${user.email}: ${code}`);
      return { ...result, devCode: code };
    }
    return { ...result, error: "Email sending isn't set up on the server yet. Please contact the shop." };
  }
  try {
    await sendVerificationEmail(user.email, user.name, code);
    return result;
  } catch (err) {
    console.error('[email] Could not send verification email:', err.message);
    return { ...result, error: "We couldn't send the email right now. Tap Resend to try again." };
  }
}

authRouter.post('/register', limiter, async (req, res) => {
  const name = requireString(req.body.name, 'Name', { max: 80 });
  const email = requireEmail(req.body.email);
  const phone = optionalPhone(req.body.phone);
  const password = requirePassword(req.body.password);
  if (findByEmail.get(email)) throw conflict('An account with this email already exists. Try logging in.');

  const passwordHash = await hashPassword(password);
  const { lastInsertRowid } = db
    .prepare('INSERT INTO users (name, email, phone, password_hash, role, email_verified, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)')
    .run(name, email, phone, passwordHash, 'customer', nowIso());
  const user = findById.get(Number(lastInsertRowid));
  const verification = await sendVerification(user);
  res.status(201).json({ token: signToken(user), user: toUserJson(findById.get(user.id)), verification });
});

authRouter.post('/login', limiter, async (req, res) => {
  const email = requireEmail(req.body.email);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const user = findByEmail.get(email);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    throw unauthorized('Incorrect email or password.');
  }
  res.json({ token: signToken(user), user: toUserJson(user) });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: toUserJson(req.user) });
});

authRouter.put('/me', requireAuth, async (req, res) => {
  const name = requireString(req.body.name, 'Name', { max: 80 });
  const email = requireEmail(req.body.email ?? req.user.email);
  const phone = optionalPhone(req.body.phone);
  const existing = findByEmail.get(email);
  if (existing && existing.id !== req.user.id) throw conflict('That email is already used by another account.');
  const emailChanged = email !== req.user.email;
  db.prepare('UPDATE users SET name = ?, email = ?, phone = ?, email_verified = ? WHERE id = ?').run(
    name,
    email,
    phone,
    emailChanged ? 0 : req.user.email_verified,
    req.user.id
  );
  const user = findById.get(req.user.id);
  // A new email address has to be verified again.
  const verification = emailChanged ? await sendVerification(user) : undefined;
  res.json({ user: toUserJson(findById.get(req.user.id)), verification });
});

authRouter.post('/verify-email', requireAuth, limiter, (req, res) => {
  const user = req.user;
  if (user.email_verified) return res.json({ user: toUserJson(user) });
  const code = String(req.body.code ?? '').replace(/\D/g, '');
  if (code.length !== 6) throw badRequest('Enter the 6-digit code from your email.');
  if (!user.verify_code_hash || !user.verify_expires_at || Date.parse(user.verify_expires_at) < Date.now()) {
    throw badRequest('This code has expired. Tap Resend to get a new one.');
  }
  if (user.verify_attempts >= MAX_CODE_ATTEMPTS) {
    throw new ApiError(429, 'Too many wrong attempts. Tap Resend to get a new code.');
  }
  const expected = Buffer.from(user.verify_code_hash, 'hex');
  const actual = Buffer.from(codeHash(user.id, code), 'hex');
  if (!crypto.timingSafeEqual(expected, actual)) {
    db.prepare('UPDATE users SET verify_attempts = verify_attempts + 1 WHERE id = ?').run(user.id);
    throw badRequest('That code is incorrect. Please check your email and try again.');
  }
  db.prepare(
    'UPDATE users SET email_verified = 1, verify_code_hash = NULL, verify_expires_at = NULL, verify_attempts = 0 WHERE id = ?'
  ).run(user.id);
  res.json({ user: toUserJson(findById.get(user.id)) });
});

authRouter.post('/resend-verification', requireAuth, async (req, res) => {
  if (req.user.email_verified) throw badRequest('Your email is already verified.');
  const verification = await sendVerification(req.user, { enforceCooldown: true });
  res.json({ verification });
});

/** Profile photo as a small data URL (the app resizes it to 256×256 JPEG first). `null` removes it. */
const MAX_AVATAR_LENGTH = 300_000;
authRouter.put('/me/avatar', requireAuth, (req, res) => {
  const avatar = req.body.avatar ?? '';
  if (avatar !== '' && !(typeof avatar === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar))) {
    throw badRequest('The photo must be a JPEG, PNG or WebP image.');
  }
  if (avatar.length > MAX_AVATAR_LENGTH) throw badRequest('That photo is too large. Please choose a smaller one.');
  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatar, req.user.id);
  res.json({ user: toUserJson(findById.get(req.user.id)) });
});

authRouter.put('/password', requireAuth, limiter, async (req, res) => {
  const current = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';
  if (!(await verifyPassword(current, req.user.password_hash))) throw badRequest('Your current password is incorrect.');
  const next = requirePassword(req.body.newPassword, 'New password');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(next), req.user.id);
  res.json({ ok: true });
});

/** Permanently deletes the account. Past orders are kept for the shop's records but anonymised. */
authRouter.delete('/me', requireAuth, limiter, async (req, res) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!(await verifyPassword(password, req.user.password_hash))) throw badRequest('Incorrect password.');
  if (req.user.role === 'admin' && db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin'`).get().n <= 1) {
    throw badRequest('You are the only admin, so this account cannot be deleted.');
  }
  transaction(() => {
    db.prepare(
      `UPDATE orders SET contact_name = 'Deleted user', contact_phone = '', contact_email = '', address_text = '', notes = ''
       WHERE user_id = ?`
    ).run(req.user.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
  });
  res.json({ ok: true });
});
