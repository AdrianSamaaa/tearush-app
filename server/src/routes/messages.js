import { Router } from 'express';
import { db, nowIso } from '../db.js';
import { optionalAuth, rateLimit, requireAdmin, requireAuth } from '../auth.js';
import { notFound, optionalString, requireEmail, requireString } from '../errors.js';

/** "Contact Us" form: anyone can send a message; admins read them. */
export const messagesRouter = Router();

const limiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10 });

function toMessageJson(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    subject: row.subject,
    message: row.message,
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
  };
}

messagesRouter.post('/messages', limiter, optionalAuth, (req, res) => {
  const data = {
    name: requireString(req.body.name, 'Name', { max: 80 }),
    email: requireEmail(req.body.email),
    phone: optionalString(req.body.phone, 'Phone', 20),
    subject: optionalString(req.body.subject, 'Subject', 120),
    message: requireString(req.body.message, 'Message', { max: 2000 }),
  };
  const { lastInsertRowid } = db
    .prepare('INSERT INTO messages (user_id, name, email, phone, subject, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(req.user?.id ?? null, data.name, data.email, data.phone, data.subject, data.message, nowIso());
  res.status(201).json({ message: toMessageJson(db.prepare('SELECT * FROM messages WHERE id = ?').get(Number(lastInsertRowid))) });
});

messagesRouter.get('/admin/messages', requireAuth, requireAdmin, (_req, res) => {
  const rows = db.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT 200').all();
  res.json({ messages: rows.map(toMessageJson) });
});

messagesRouter.patch('/admin/messages/:id/read', requireAuth, requireAdmin, (req, res) => {
  const { changes } = db.prepare('UPDATE messages SET is_read = 1 WHERE id = ?').run(Number(req.params.id));
  if (!changes) throw notFound('Message not found.');
  res.json({ ok: true });
});

messagesRouter.delete('/admin/messages/:id', requireAuth, requireAdmin, (req, res) => {
  const { changes } = db.prepare('DELETE FROM messages WHERE id = ?').run(Number(req.params.id));
  if (!changes) throw notFound('Message not found.');
  res.json({ ok: true });
});
