import { Router } from 'express';
import { config } from '../config.js';
import { db, nowIso } from '../db.js';
import { requireAdmin, requireAuth } from '../auth.js';
import { badRequest, notFound, optionalString } from '../errors.js';
import { createRefund } from '../paymongo.js';
import { cancelOrder, getOrderRow, nextStatuses, setStatus, STATUS_LABELS, toOrderJson } from '../orders.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

const FILTERS = {
  active: `status IN ('pending', 'preparing', 'out_for_delivery', 'ready_for_pickup')`,
  unpaid: `status = 'awaiting_payment'`,
  completed: `status = 'completed'`,
  cancelled: `status = 'cancelled'`,
  all: '1 = 1',
};

adminRouter.get('/orders', (req, res) => {
  const where = FILTERS[req.query.filter] ?? FILTERS.active;
  const rows = db.prepare(`SELECT * FROM orders WHERE ${where} ORDER BY id DESC LIMIT 200`).all();
  res.json({ orders: rows.map((o) => toOrderJson(o, { includeCustomer: true })) });
});

adminRouter.get('/stats', (_req, res) => {
  // "Today" in Philippine time.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone }).format(new Date());
  const startUtc = new Date(`${today}T00:00:00+08:00`).toISOString();
  const todayStats = db
    .prepare(
      `SELECT COUNT(*) AS orders, COALESCE(SUM(total_cents), 0) AS revenue FROM orders
       WHERE created_at >= ? AND status NOT IN ('cancelled', 'awaiting_payment')`
    )
    .get(startUtc);
  const counts = Object.fromEntries(
    db.prepare('SELECT status, COUNT(*) AS n FROM orders GROUP BY status').all().map((r) => [r.status, r.n])
  );
  res.json({
    today: { orders: todayStats.orders, revenue: todayStats.revenue / 100 },
    counts,
    active: (counts.pending ?? 0) + (counts.preparing ?? 0) + (counts.out_for_delivery ?? 0) + (counts.ready_for_pickup ?? 0),
  });
});

adminRouter.patch('/orders/:id/status', async (req, res) => {
  let order = getOrderRow(req.params.id);
  if (!order) throw notFound('Order not found.');
  const status = req.body.status;
  if (!nextStatuses(order).includes(status)) {
    throw badRequest(`Can't change a "${STATUS_LABELS[order.status]}" order to "${STATUS_LABELS[status] ?? status}".`);
  }
  const note = optionalString(req.body.note, 'Note', 200);

  if (status === 'cancelled') {
    const reason = note || 'Cancelled by the shop';
    if (order.payment_status === 'paid' && order.paymongo_payment_id) {
      try {
        const refund = await createRefund({
          paymentId: order.paymongo_payment_id,
          amountCents: order.total_cents,
          notes: `${order.order_number}: ${reason}`,
        });
        order = setStatus(order, 'cancelled', `${reason} — refund requested`, {
          cancel_reason: reason,
          payment_status: 'refunded',
          paymongo_refund_id: refund.id,
        });
      } catch (err) {
        order = setStatus(order, 'cancelled', `${reason} — automatic refund failed (${err.message}); refund it in the PayMongo dashboard`, {
          cancel_reason: reason,
        });
      }
    } else {
      order = await cancelOrder(order, reason);
    }
  } else if (status === 'completed' && order.payment_method === 'cod' && order.payment_status !== 'paid') {
    order = setStatus(order, status, note || 'Cash payment received', { payment_status: 'paid', paid_via: 'cod', paid_at: nowIso() });
  } else {
    order = setStatus(order, status, note);
  }
  res.json({ order: toOrderJson(order, { includeCustomer: true }) });
});
