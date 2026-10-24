import { Router } from 'express';
import { db, nowIso, transaction } from '../db.js';
import { requireAuth } from '../auth.js';
import { badRequest, notFound, optionalString, requirePhone, requireString } from '../errors.js';

export const addressesRouter = Router();
addressesRouter.use(requireAuth);

const MAX_ADDRESSES = 10;

export function toAddressJson(row) {
  return {
    id: row.id,
    label: row.label,
    recipient: row.recipient,
    phone: row.phone,
    line1: row.line1,
    barangay: row.barangay,
    city: row.city,
    province: row.province,
    postalCode: row.postal_code,
    region: row.region,
    latitude: row.latitude,
    longitude: row.longitude,
    notes: row.notes,
    isDefault: Boolean(row.is_default),
  };
}

/** One-line address used on orders and receipts. */
export function formatAddress(a) {
  return [a.line1, a.barangay, a.city, a.province || a.region, a.postal_code ?? a.postalCode].filter(Boolean).join(', ');
}

function optionalCoordinate(value, max, field) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || Math.abs(n) > max) throw badRequest(`${field} is invalid.`);
  return n;
}

function readBody(body) {
  return {
    region: optionalString(body.region, 'Region', 100),
    latitude: optionalCoordinate(body.latitude, 90, 'Latitude'),
    longitude: optionalCoordinate(body.longitude, 180, 'Longitude'),
    label: requireString(body.label || 'Home', 'Label', { max: 30 }),
    recipient: requireString(body.recipient, 'Recipient name', { max: 80 }),
    phone: requirePhone(body.phone),
    line1: requireString(body.line1, 'House no. / street', { max: 200 }),
    barangay: optionalString(body.barangay, 'Barangay', 100),
    city: requireString(body.city, 'City / municipality', { max: 100 }),
    province: optionalString(body.province, 'Province', 100),
    postal_code: optionalString(body.postalCode, 'Postal code', 10),
    notes: optionalString(body.notes, 'Landmark / notes', 200),
  };
}

const listForUser = db.prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id');
const findOwn = db.prepare('SELECT * FROM addresses WHERE id = ? AND user_id = ?');
const clearDefault = db.prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?');

export const getOwnAddress = (id, userId) => findOwn.get(Number(id), userId);

addressesRouter.get('/', (req, res) => {
  res.json({ addresses: listForUser.all(req.user.id).map(toAddressJson) });
});

addressesRouter.post('/', (req, res) => {
  const data = readBody(req.body);
  const existing = listForUser.all(req.user.id);
  if (existing.length >= MAX_ADDRESSES) throw badRequest(`You can save up to ${MAX_ADDRESSES} addresses.`);
  const makeDefault = existing.length === 0 || Boolean(req.body.isDefault);
  const id = transaction(() => {
    if (makeDefault) clearDefault.run(req.user.id);
    return Number(
      db
        .prepare(
          `INSERT INTO addresses (user_id, label, recipient, phone, line1, barangay, city, province, region, postal_code,
             latitude, longitude, notes, is_default, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(req.user.id, data.label, data.recipient, data.phone, data.line1, data.barangay, data.city, data.province,
          data.region, data.postal_code, data.latitude, data.longitude, data.notes, makeDefault ? 1 : 0, nowIso()).lastInsertRowid
    );
  });
  res.status(201).json({ address: toAddressJson(findOwn.get(id, req.user.id)) });
});

addressesRouter.put('/:id', (req, res) => {
  const current = findOwn.get(Number(req.params.id), req.user.id);
  if (!current) throw notFound('Address not found.');
  const data = readBody(req.body);
  transaction(() => {
    if (req.body.isDefault) clearDefault.run(req.user.id);
    db.prepare(
      `UPDATE addresses SET label = ?, recipient = ?, phone = ?, line1 = ?, barangay = ?, city = ?, province = ?,
         region = ?, postal_code = ?, latitude = ?, longitude = ?, notes = ?, is_default = ? WHERE id = ?`
    ).run(data.label, data.recipient, data.phone, data.line1, data.barangay, data.city, data.province, data.region,
      data.postal_code, data.latitude, data.longitude, data.notes, req.body.isDefault ? 1 : current.is_default, current.id);
  });
  res.json({ address: toAddressJson(findOwn.get(current.id, req.user.id)) });
});

addressesRouter.delete('/:id', (req, res) => {
  const current = findOwn.get(Number(req.params.id), req.user.id);
  if (!current) throw notFound('Address not found.');
  transaction(() => {
    db.prepare('DELETE FROM addresses WHERE id = ?').run(current.id);
    if (current.is_default) {
      const next = listForUser.all(req.user.id)[0];
      if (next) db.prepare('UPDATE addresses SET is_default = 1 WHERE id = ?').run(next.id);
    }
  });
  res.json({ ok: true });
});
