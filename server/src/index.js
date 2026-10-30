import express from 'express';
import cors from 'cors';
import { config, emailjsEnabled, paymentsEnabled, smtpEnabled } from './config.js';
import { db, nowIso, seedIfEmpty } from './db.js';
import { hashPassword } from './auth.js';
import { ApiError } from './errors.js';
import { authRouter } from './routes/auth.js';
import { addressesRouter } from './routes/addresses.js';
import { catalogRouter } from './routes/catalog.js';
import { ordersRouter } from './routes/orders.js';
import { adminRouter } from './routes/admin.js';
import { messagesRouter } from './routes/messages.js';
import { paymentReturnPage, paymongoWebhook } from './routes/payments.js';

async function ensureAdmin() {
  const { email, password, name } = config.admin;
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return;
  if (!password) {
    console.warn('[setup] ADMIN_PASSWORD is not set — no admin account was created.');
    return;
  }
  db.prepare('INSERT INTO users (name, email, phone, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    name,
    email,
    '',
    await hashPassword(password),
    'admin',
    nowIso()
  );
  console.log(`[setup] Created admin account ${email}${config.isProduction ? '' : ` (password: ${password})`}`);
}

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
// The app authenticates with a bearer token (no cookies), so any origin may call the API.
app.use(cors());

// Must be registered before express.json(): signature verification needs the raw body.
app.post('/api/webhooks/paymongo', express.raw({ type: '*/*', limit: '1mb' }), paymongoWebhook);
app.use(express.json({ limit: '400kb' })); // room for a profile photo

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path !== '/api/health') console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

app.get('/', (_req, res) => res.json({ name: 'TeaRush API', status: 'ok', docs: '/api/health' }));
app.get('/api/health', (_req, res) => res.json({ status: 'ok', paymentsEnabled: paymentsEnabled(), time: nowIso() }));
app.get('/payments/return', paymentReturnPage);

app.use('/api/auth', authRouter);
app.use('/api/addresses', addressesRouter);
app.use('/api/orders', ordersRouter);
app.use('/api', messagesRouter);
app.use('/api/admin', adminRouter);
app.use('/api', catalogRouter);

app.use((req, _res, next) => next(new ApiError(404, `No route for ${req.method} ${req.path}`)));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') err = new ApiError(400, 'Invalid JSON body.');
  const status = err instanceof ApiError ? err.status : 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Something went wrong on our side. Please try again.' : err.message });
});

seedIfEmpty();
await ensureAdmin();

app.listen(config.port, () => {
  console.log(`TeaRush API listening on port ${config.port}`);
  console.log(`  Public URL: ${config.publicUrl}`);
  console.log(`  PayMongo:   ${paymentsEnabled() ? `enabled (${config.paymongo.methods.join(', ')})` : 'not configured — Cash on Delivery only'}`);
  console.log(
    `  Email:      ${smtpEnabled() ? `SMTP (${config.smtp.host})` : emailjsEnabled() ? 'EmailJS' : 'not configured — codes shown in the app (demo mode)'}`
  );
  if (paymentsEnabled() && !config.paymongo.webhookSecret) {
    console.log('  Webhook:    PAYMONGO_WEBHOOK_SECRET not set — payments are confirmed by polling PayMongo instead.');
  }
});
