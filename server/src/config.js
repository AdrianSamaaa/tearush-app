import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  process.loadEnvFile(path.join(serverRoot, '.env'));
} catch {
  /* no .env file — rely on real environment variables */
}

const env = process.env;
const isProduction = env.NODE_ENV === 'production';
const port = Number(env.PORT) || 3000;

let jwtSecret = env.JWT_SECRET;
if (!jwtSecret) {
  if (isProduction) {
    throw new Error('JWT_SECRET must be set in production.');
  }
  jwtSecret = crypto.randomBytes(48).toString('hex');
  console.warn('[config] JWT_SECRET not set — using a random one. Logins will reset when the server restarts.');
}

const ALL_METHODS = ['gcash', 'paymaya', 'card', 'grab_pay', 'qrph', 'shopee_pay', 'billease', 'dob'];

export const config = {
  isProduction,
  port,
  // Render sets RENDER_EXTERNAL_URL automatically.
  publicUrl: (env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || `http://localhost:${port}`).replace(/\/+$/, ''),
  dataDir: path.resolve(serverRoot, env.DATA_DIR || 'data'),
  jwtSecret,
  jwtExpiresIn: '30d',
  appScheme: env.APP_SCHEME || 'tearush',
  appPackage: env.APP_PACKAGE || 'com.tearush.app',
  admin: {
    email: (env.ADMIN_EMAIL || 'admin@tearush.app').trim().toLowerCase(),
    password: env.ADMIN_PASSWORD || (isProduction ? '' : 'admin12345'),
    name: env.ADMIN_NAME || 'TeaRush Admin',
  },
  paymongo: {
    secretKey: env.PAYMONGO_SECRET_KEY || '',
    webhookSecret: env.PAYMONGO_WEBHOOK_SECRET || '',
    apiBase: (env.PAYMONGO_API_BASE || 'https://api.paymongo.com/v1').replace(/\/+$/, ''),
    methods: (env.PAYMONGO_METHODS || 'gcash,paymaya,card,grab_pay')
      .split(',')
      .map((m) => m.trim())
      .filter((m) => ALL_METHODS.includes(m)),
  },
  timezone: 'Asia/Manila',
  /** Outgoing email (verification codes). Any SMTP works: Gmail app password, Brevo, Mailtrap… */
  smtp: {
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT) || 587,
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.MAIL_FROM || (env.SMTP_USER ? `TeaRush <${env.SMTP_USER}>` : 'TeaRush <no-reply@tearush.app>'),
  },
  /**
   * When no SMTP is configured, return verification codes in the API response so the
   * app can show them (always on in development; opt-in in production for demos).
   */
  emailDemoMode: !isProduction || env.EMAIL_DEMO_MODE === 'true',
};

export const emailEnabled = () => Boolean(config.smtp.host);

export const paymentsEnabled = () => Boolean(config.paymongo.secretKey);
