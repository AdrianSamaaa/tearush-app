import crypto from 'node:crypto';
import { promisify } from 'node:util';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { db } from './db.js';
import { forbidden, unauthorized, ApiError } from './errors.js';

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

export function signToken(user) {
  return jwt.sign({ sub: String(user.id), role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

export function toUserJson(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    avatar: row.avatar || null,
    emailVerified: Boolean(row.email_verified),
    createdAt: row.created_at,
  };
}

const findUser = db.prepare('SELECT * FROM users WHERE id = ?');

function userFromRequest(req) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    return findUser.get(Number(payload.sub)) ?? null;
  } catch {
    return null;
  }
}

/** Rejects the request unless it carries a valid login token. Sets `req.user`. */
export function requireAuth(req, _res, next) {
  const user = userFromRequest(req);
  if (!user) return next(unauthorized('Your session has expired. Please log in again.'));
  req.user = user;
  next();
}

/** Sets `req.user` when a valid token is present, but never rejects. */
export function optionalAuth(req, _res, next) {
  req.user = userFromRequest(req);
  next();
}

export function requireAdmin(req, _res, next) {
  if (req.user?.role !== 'admin') return next(forbidden('Admins only.'));
  next();
}

/**
 * Tiny in-memory rate limiter (per IP + route) for login/register so the
 * endpoints can't be brute-forced. Good enough for a single server instance.
 */
export function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, _res, next) => {
    const key = `${req.ip}:${req.baseUrl}${req.path}`;
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt < now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
    } else if (++entry.count > max) {
      return next(new ApiError(429, 'Too many attempts. Please wait a few minutes and try again.'));
    }
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
    }
    next();
  };
}
