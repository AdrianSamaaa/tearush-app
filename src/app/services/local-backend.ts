import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { CATEGORIES, PRODUCTS as SEED_PRODUCTS } from '../data/products.data';
import { PROMO_RULES, PromoRule } from '../data/promos.data';
import { Order, OrderItem, OrderStatus, PaymentMethod } from '../models/order.model';
import { CUSTOM_DRINK, DELIVERY_FEE, ICE_LEVELS, Product, ProductSize, SIZE_SURCHARGE, SUGAR_LEVELS, TOPPINGS } from '../models/product.model';
import { Address, User, VerificationInfo } from '../models/user.model';
import { sendEmailJs, verificationParams } from './emailjs';
import { IntegrationsService } from './integrations.service';
import {
  CheckoutLine,
  PaymongoDirectError,
  createCheckoutSession,
  createRefund,
  expireCheckoutSession,
  paidPaymentOf,
  retrieveCheckoutSession,
} from './paymongo-direct';
import { SessionStore } from './session.store';
import { StorageService } from './storage.service';

/**
 * On-device TeaRush backend.
 *
 * When no server URL is configured, ApiService sends every API call here
 * instead of over HTTP. It implements the same endpoints and JSON shapes as
 * server/src (accounts + email verification, menu, cart pricing, promos,
 * addresses, orders, PayMongo payments, admin, contact messages) and keeps
 * everything in Capacitor Preferences, so the APK works fully on its own.
 *
 * Online payments and verification emails use the keys an admin enters in
 * Shop Settings (IntegrationsService): a PayMongo *test* secret key and EmailJS.
 */

const DB_KEY = 'tearush_device_db';
const TIMEZONE = 'Asia/Manila';
const DEMO_ADMIN = { email: 'admin@tearush.app', password: 'admin12345' };
const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

interface LocalUser extends User {
  passwordHash: string;
  salt: string;
  verifyHash?: string | null;
  verifyExpiresAt?: string | null;
  verifySentAt?: string | null;
  verifyAttempts?: number;
}

interface LocalAddress extends Address {
  userId: number;
}

interface LocalOrder {
  id: number;
  orderNumber: string;
  userId: number | null;
  status: OrderStatus;
  fulfillment: 'delivery' | 'pickup';
  paymentMethod: PaymentMethod;
  paymentStatus: 'unpaid' | 'paid' | 'refunded';
  paidVia: string | null;
  paidAt: string | null;
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
  promoCode: string | null;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  address: string;
  notes: string;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  items: (Omit<OrderItem, 'unitPrice'> & { unitCents: number })[];
  events: { status: OrderStatus; note: string; createdAt: string }[];
  checkoutId?: string | null;
  checkoutUrl?: string | null;
  paymentId?: string | null;
  refundId?: string | null;
}

interface LocalMessage {
  id: number;
  userId: number | null;
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

interface LocalDb {
  version: 1;
  seq: { user: number; address: number; order: number; message: number };
  users: LocalUser[];
  sessions: Record<string, number>;
  addresses: LocalAddress[];
  products: Product[];
  orders: LocalOrder[];
  messages: LocalMessage[];
}

interface PricedItem {
  productId: string;
  name: string;
  image: string;
  size: string;
  sugar: string;
  ice: string;
  toppingIds: string[];
  toppings: string[];
  options: { teaBase?: string; milk?: string };
  unitCents: number;
  quantity: number;
}

type Body = Record<string, any>;

const STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting_payment: 'Awaiting payment',
  pending: 'Order placed',
  preparing: 'Preparing',
  out_for_delivery: 'On the way',
  ready_for_pickup: 'Ready for pickup',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ---------- helpers ----------

function fail(status: number, message: string): never {
  throw new HttpErrorResponse({ status, statusText: 'Error', url: 'device://tearush/api', error: { error: message } });
}

const nowIso = () => new Date().toISOString();
const peso = (cents: number) =>
  `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password: string, saltHex: string): Promise<string> {
  const salt = new Uint8Array(saltHex.match(/../g)!.map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100_000 }, key, 256);
  return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('');
}

function requireString(value: unknown, field: string, max = 200): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) fail(400, `${field} is required.`);
  if (text.length > max) fail(400, `${field} must be at most ${max} characters.`);
  return text;
}

function optionalString(value: unknown, field: string, max = 500): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') fail(400, `${field} must be text.`);
  const text = value.trim();
  if (text.length > max) fail(400, `${field} must be at most ${max} characters.`);
  return text;
}

function requireEmail(value: unknown): string {
  const email = requireString(value, 'Email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Please enter a valid email address.');
  return email;
}

function requirePhone(value: unknown, field = 'Phone number'): string {
  const digits = requireString(value, field, 20).replace(/[\s-]/g, '');
  if (!/^(\+639|09)\d{9}$/.test(digits)) fail(400, `${field} must be a valid PH mobile number (e.g. 0917 123 4567).`);
  return digits.startsWith('+63') ? `0${digits.slice(3)}` : digits;
}

function optionalPhone(value: unknown, field = 'Phone number'): string {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) return '';
  return requirePhone(value, field);
}

function optionalCoordinate(value: unknown, max: number, field: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || Math.abs(n) > max) fail(400, `${field} is invalid.`);
  return n;
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function requirePassword(value: unknown, field = 'Password'): string {
  const password = typeof value === 'string' ? value : '';
  if (password.length < 8) fail(400, `${field} must be at least 8 characters.`);
  return password;
}

const manilaDate = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const manilaWeekday = (d: Date) =>
  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, weekday: 'short' }).format(d));

function methodLabel(method: string, fulfillment: string): string {
  if (method === 'cod') return fulfillment === 'pickup' ? 'Cash on pickup' : 'Cash on Delivery';
  return ({ gcash: 'GCash', paymaya: 'Maya', card: 'Credit/Debit Card', grab_pay: 'GrabPay' } as Record<string, string>)[method] ?? method;
}

function nextStatuses(o: LocalOrder): OrderStatus[] {
  switch (o.status) {
    case 'awaiting_payment':
      return ['cancelled'];
    case 'pending':
      return ['preparing', 'cancelled'];
    case 'preparing':
      return [o.fulfillment === 'pickup' ? 'ready_for_pickup' : 'out_for_delivery', 'cancelled'];
    case 'out_for_delivery':
    case 'ready_for_pickup':
      return ['completed'];
    default:
      return [];
  }
}

function formatAddress(a: LocalAddress): string {
  return [a.line1, a.barangay, a.city, a.province || a.region, a.postalCode].filter(Boolean).join(', ');
}

const MIN_ONLINE_PAYMENT_CENTS = 2000; // PayMongo's minimum charge is ₱20

@Injectable({ providedIn: 'root' })
export class LocalBackend {
  private storage = inject(StorageService);
  private session = inject(SessionStore);
  private integrations = inject(IntegrationsService);
  private db: LocalDb | null = null;
  private loading: Promise<LocalDb> | null = null;

  /** Handles one API call, e.g. handle('POST', '/auth/login', { email, password }). */
  async handle(method: string, path: string, body?: unknown, query: Record<string, string> = {}): Promise<unknown> {
    await this.integrations.load();
    const db = await this.load();
    const segments = path.split('?')[0].split('/').filter(Boolean);
    const verb = method.toUpperCase();
    const result = await this.route(db, verb, segments, (body ?? {}) as Body, query);
    if (verb !== 'GET') await this.storage.set(DB_KEY, db);
    return JSON.parse(JSON.stringify(result ?? {}));
  }

  private async load(): Promise<LocalDb> {
    if (this.db) return this.db;
    this.loading ??= (async () => {
      const saved = await this.storage.get<LocalDb>(DB_KEY);
      if (saved?.version === 1) {
        this.db = saved;
      } else {
        this.db = await this.createDb();
        await this.storage.set(DB_KEY, this.db);
      }
      return this.db;
    })();
    return this.loading;
  }

  private async createDb(): Promise<LocalDb> {
    const salt = randomHex(16);
    return {
      version: 1,
      seq: { user: 1, address: 0, order: 0, message: 0 },
      users: [
        {
          id: 1,
          name: 'TeaRush Admin',
          email: DEMO_ADMIN.email,
          phone: '',
          role: 'admin',
          avatar: null,
          emailVerified: true,
          createdAt: nowIso(),
          salt,
          passwordHash: await hashPassword(DEMO_ADMIN.password, salt),
        },
      ],
      sessions: {},
      addresses: [],
      products: SEED_PRODUCTS.map((p) => ({ ...p, available: true })),
      orders: [],
      messages: [],
    };
  }

  private currentUser(db: LocalDb): LocalUser | null {
    const token = this.session.token();
    const id = token ? db.sessions[token] : undefined;
    return id ? db.users.find((u) => u.id === id) ?? null : null;
  }

  private userJson(u: LocalUser): User {
    const { passwordHash, salt, verifyHash, verifyExpiresAt, verifySentAt, verifyAttempts, ...user } = u;
    // Accounts created before email verification existed count as verified.
    return { ...user, emailVerified: u.emailVerified !== false };
  }

  /** Creates a 6-digit code and emails it via EmailJS (or returns it as a demo code if email isn't set up). */
  private async sendVerification(user: LocalUser, enforceCooldown = false): Promise<VerificationInfo> {
    if (enforceCooldown && user.verifySentAt) {
      const wait = RESEND_COOLDOWN_MS - (Date.now() - Date.parse(user.verifySentAt));
      if (wait > 0) fail(429, `Please wait ${Math.ceil(wait / 1000)} seconds before requesting another code.`);
    }
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
    user.verifyHash = await sha256(`${user.salt}:${code}`);
    user.verifyExpiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
    user.verifySentAt = nowIso();
    user.verifyAttempts = 0;

    const info: VerificationInfo = { sentTo: user.email };
    if (!this.integrations.emailEnabled()) return { ...info, devCode: code };
    try {
      await sendEmailJs(this.integrations.emailJsKeys(), verificationParams(user.email, user.name, code));
      return info;
    } catch (err) {
      console.warn('EmailJS failed', err);
      return { ...info, error: "We couldn't send the email right now. Tap Resend to try again." };
    }
  }

  private startSession(db: LocalDb, user: LocalUser) {
    const token = randomHex(32);
    db.sessions[token] = user.id;
    return { token, user: this.userJson(user) };
  }

  // ---------- router ----------

  private async route(db: LocalDb, m: string, seg: string[], body: Body, query: Record<string, string>): Promise<unknown> {
    const [a, b, c] = seg;
    const user = this.currentUser(db);
    const requireUser = (): LocalUser => user ?? fail(401, 'Your session has expired. Please log in again.');
    const requireAdmin = (): LocalUser => {
      const u = requireUser();
      if (u.role !== 'admin') fail(403, 'Admins only.');
      return u;
    };

    if (a === 'health') return { status: 'ok', paymentsEnabled: false, mode: 'device', time: nowIso() };
    if (a === 'config' && m === 'GET') return this.config();
    if (a === 'promos' && m === 'GET') return { promos: this.activePromos() };
    if (a === 'products') return this.products(db, m, b, body, query, user, requireAdmin);
    if (a === 'auth') return this.auth(db, m, b, c, body, requireUser);
    if (a === 'addresses') return this.addresses(db, m, b, body, requireUser());
    if (a === 'orders') return this.orders(db, m, b, c, body, requireUser());
    if (a === 'messages' && m === 'POST') return this.sendMessage(db, body, user);
    if (a === 'admin') {
      requireAdmin();
      return this.admin(db, m, b, c, body, query);
    }
    return fail(404, `No route for ${m} /${seg.join('/')}`);
  }

  private config() {
    const enabled = this.integrations.paymentsEnabled();
    return {
      paymentsEnabled: enabled,
      paymentMethods: enabled
        ? this.integrations.settings().paymongoMethods.map((m) => ({ value: m, label: methodLabel(m, 'delivery') }))
        : [],
      deliveryFee: DELIVERY_FEE,
      currency: 'PHP',
      categories: CATEGORIES,
      mode: 'device',
    };
  }

  private activePromos() {
    const today = manilaDate(new Date());
    return PROMO_RULES.filter((p) => !p.validUntil || p.validUntil >= today).map((p) => {
      const until = p.validUntil
        ? new Date(`${p.validUntil}T00:00:00+08:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: TIMEZONE })
        : null;
      const expiry = p.weekday !== undefined ? `Every ${WEEKDAYS[p.weekday]}${until ? ` · until ${until}` : ''}` : until ? `Valid until ${until}` : 'No expiry';
      return { code: p.code, title: p.title, description: p.description, expiry, accent: p.accent, validUntil: p.validUntil ?? null };
    });
  }

  // ---------- products ----------

  private products(db: LocalDb, m: string, id: string | undefined, body: Body, query: Record<string, string>, user: LocalUser | null, requireAdmin: () => LocalUser) {
    if (m === 'GET' && !id) {
      const includeHidden = user?.role === 'admin' && query['all'] === '1';
      return { products: db.products.filter((p) => includeHidden || p.available !== false) };
    }
    if (m === 'GET') return { product: db.products.find((p) => p.id === id) ?? fail(404, 'Product not found.') };

    requireAdmin();
    if (m === 'POST' && id === 'reset') {
      db.products = SEED_PRODUCTS.map((p) => ({ ...p, available: true }));
      return { products: db.products };
    }
    if (m === 'POST' && !id) {
      const data = this.readProduct(body);
      let newId = (typeof body['id'] === 'string' && body['id'].trim() ? body['id'] : data.name)
        .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `product-${Date.now()}`;
      if (newId === CUSTOM_DRINK.id || db.products.some((p) => p.id === newId)) newId = `${newId}-${Date.now()}`;
      const product: Product = { ...data, id: newId, image: data.image || `assets/products/${newId}.jpg` };
      db.products.push(product);
      return { product };
    }
    const index = db.products.findIndex((p) => p.id === id);
    if (index < 0) fail(404, 'Product not found.');
    if (m === 'PUT') {
      db.products[index] = { ...this.readProduct(body), id: id! };
      return { product: db.products[index] };
    }
    if (m === 'DELETE') {
      db.products.splice(index, 1);
      return { ok: true };
    }
    return fail(404, 'Not found.');
  }

  private readProduct(body: Body): Omit<Product, 'id'> {
    const price = Number(body['price']);
    if (!Number.isFinite(price) || price <= 0 || price > 10000) fail(400, 'Price must be between ₱1 and ₱10,000.');
    let rating: number | undefined;
    if (body['rating'] !== undefined && body['rating'] !== null && body['rating'] !== '') {
      rating = Number(body['rating']);
      if (!Number.isFinite(rating) || rating < 0 || rating > 5) fail(400, 'Rating must be between 0 and 5.');
    }
    if (!CATEGORIES.includes(body['category'])) fail(400, `Category must be one of: ${CATEGORIES.join(', ')}.`);
    return {
      name: requireString(body['name'], 'Product name', 80),
      category: body['category'],
      price: Math.round(price * 100) / 100,
      description: optionalString(body['description'], 'Description', 500),
      image: optionalString(body['image'], 'Image', 1000),
      popular: Boolean(body['popular']),
      rating,
      available: body['available'] !== false,
    };
  }

  // ---------- auth ----------

  private async auth(db: LocalDb, m: string, b: string | undefined, c: string | undefined, body: Body, requireUser: () => LocalUser) {
    if (b === 'register' && m === 'POST') {
      const name = requireString(body['name'], 'Name', 80);
      const email = requireEmail(body['email']);
      const phone = optionalPhone(body['phone']);
      const password = requirePassword(body['password']);
      if (db.users.some((u) => u.email === email)) fail(409, 'An account with this email already exists. Try logging in.');
      const salt = randomHex(16);
      const user: LocalUser = {
        id: ++db.seq.user, name, email, phone, role: 'customer', avatar: null, emailVerified: false, createdAt: nowIso(),
        salt, passwordHash: await hashPassword(password, salt),
      };
      db.users.push(user);
      const verification = await this.sendVerification(user);
      return { ...this.startSession(db, user), verification };
    }
    if (b === 'login' && m === 'POST') {
      const email = requireEmail(body['email']);
      const user = db.users.find((u) => u.email === email);
      if (!user || (await hashPassword(String(body['password'] ?? ''), user.salt)) !== user.passwordHash) {
        fail(401, 'Incorrect email or password.');
      }
      return this.startSession(db, user);
    }

    const user = requireUser();
    if (b === 'me' && c === 'avatar' && m === 'PUT') {
      const avatar = body['avatar'] ?? null;
      if (avatar !== null && !(typeof avatar === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(avatar))) {
        fail(400, 'The photo must be a JPEG, PNG or WebP image.');
      }
      if (avatar && avatar.length > 300_000) fail(400, 'That photo is too large. Please choose a smaller one.');
      user.avatar = avatar || null;
      return { user: this.userJson(user) };
    }
    if (b === 'me' && m === 'GET') return { user: this.userJson(user) };
    if (b === 'me' && m === 'PUT') {
      const email = requireEmail(body['email'] ?? user.email);
      if (db.users.some((u) => u.email === email && u.id !== user.id)) fail(409, 'That email is already used by another account.');
      user.name = requireString(body['name'], 'Name', 80);
      user.phone = optionalPhone(body['phone']);
      const emailChanged = email !== user.email;
      user.email = email;
      if (!emailChanged) return { user: this.userJson(user) };
      // A new address has to be verified again.
      user.emailVerified = false;
      const verification = await this.sendVerification(user);
      return { user: this.userJson(user), verification };
    }
    if (b === 'verify-email' && m === 'POST') {
      if (user.emailVerified !== false) return { user: this.userJson(user) };
      const code = String(body['code'] ?? '').replace(/\D/g, '');
      if (code.length !== 6) fail(400, 'Enter the 6-digit code from your email.');
      if (!user.verifyHash || !user.verifyExpiresAt || Date.parse(user.verifyExpiresAt) < Date.now()) {
        fail(400, 'This code has expired. Tap Resend to get a new one.');
      }
      if ((user.verifyAttempts ?? 0) >= 5) fail(429, 'Too many wrong attempts. Tap Resend to get a new code.');
      if ((await sha256(`${user.salt}:${code}`)) !== user.verifyHash) {
        user.verifyAttempts = (user.verifyAttempts ?? 0) + 1;
        await this.storage.set(DB_KEY, db); // keep the attempt count even though we throw
        fail(400, 'That code is incorrect. Please check your email and try again.');
      }
      Object.assign(user, { emailVerified: true, verifyHash: null, verifyExpiresAt: null, verifyAttempts: 0 });
      return { user: this.userJson(user) };
    }
    if (b === 'resend-verification' && m === 'POST') {
      if (user.emailVerified !== false) fail(400, 'Your email is already verified.');
      return { verification: await this.sendVerification(user, true) };
    }
    if (b === 'password' && m === 'PUT') {
      if ((await hashPassword(String(body['currentPassword'] ?? ''), user.salt)) !== user.passwordHash) {
        fail(400, 'Your current password is incorrect.');
      }
      const next = requirePassword(body['newPassword'], 'New password');
      user.salt = randomHex(16);
      user.passwordHash = await hashPassword(next, user.salt);
      return { ok: true };
    }
    if (b === 'me' && m === 'DELETE') {
      if ((await hashPassword(String(body['password'] ?? ''), user.salt)) !== user.passwordHash) fail(400, 'Incorrect password.');
      if (user.role === 'admin' && db.users.filter((u) => u.role === 'admin').length <= 1) {
        fail(400, 'You are the only admin, so this account cannot be deleted.');
      }
      for (const o of db.orders.filter((o) => o.userId === user.id)) {
        Object.assign(o, { userId: null, contactName: 'Deleted user', contactPhone: '', contactEmail: '', address: '', notes: '' });
      }
      for (const msg of db.messages.filter((x) => x.userId === user.id)) msg.userId = null;
      db.addresses = db.addresses.filter((a) => a.userId !== user.id);
      db.users = db.users.filter((u) => u.id !== user.id);
      for (const [token, id] of Object.entries(db.sessions)) if (id === user.id) delete db.sessions[token];
      return { ok: true };
    }
    return fail(404, 'Not found.');
  }

  // ---------- addresses ----------

  private addresses(db: LocalDb, m: string, id: string | undefined, body: Body, user: LocalUser) {
    const mine = () =>
      db.addresses.filter((a) => a.userId === user.id).sort((x, y) => Number(y.isDefault) - Number(x.isDefault) || x.id - y.id);
    const toJson = (a: LocalAddress): Address => {
      const { userId, ...rest } = a;
      return rest;
    };
    const read = () => ({
      region: optionalString(body['region'], 'Region', 100),
      latitude: optionalCoordinate(body['latitude'], 90, 'Latitude'),
      longitude: optionalCoordinate(body['longitude'], 180, 'Longitude'),
      label: requireString(body['label'] || 'Home', 'Label', 30),
      recipient: requireString(body['recipient'], 'Recipient name', 80),
      phone: requirePhone(body['phone']),
      line1: requireString(body['line1'], 'House no. / street', 200),
      barangay: optionalString(body['barangay'], 'Barangay', 100),
      city: requireString(body['city'], 'City / municipality', 100),
      province: optionalString(body['province'], 'Province', 100),
      postalCode: optionalString(body['postalCode'], 'Postal code', 10),
      notes: optionalString(body['notes'], 'Landmark / notes', 200),
    });
    const clearDefault = () => mine().forEach((a) => (a.isDefault = false));

    if (m === 'GET' && !id) return { addresses: mine().map(toJson) };
    if (m === 'POST' && !id) {
      const data = read();
      if (mine().length >= 10) fail(400, 'You can save up to 10 addresses.');
      const makeDefault = mine().length === 0 || Boolean(body['isDefault']);
      if (makeDefault) clearDefault();
      const address: LocalAddress = { ...data, id: ++db.seq.address, userId: user.id, isDefault: makeDefault };
      db.addresses.push(address);
      return { address: toJson(address) };
    }
    const address = db.addresses.find((a) => a.id === Number(id) && a.userId === user.id) ?? fail(404, 'Address not found.');
    if (m === 'PUT') {
      const data = read();
      if (body['isDefault']) clearDefault();
      Object.assign(address, data, { isDefault: body['isDefault'] ? true : address.isDefault });
      return { address: toJson(address) };
    }
    if (m === 'DELETE') {
      db.addresses = db.addresses.filter((a) => a.id !== address.id);
      if (address.isDefault && mine()[0]) mine()[0].isDefault = true;
      return { ok: true };
    }
    return fail(404, 'Not found.');
  }

  // ---------- pricing ----------

  private priceItems(db: LocalDb, raw: unknown): PricedItem[] {
    if (!Array.isArray(raw) || raw.length === 0) fail(400, 'Your cart is empty.');
    if (raw.length > 30) fail(400, 'An order can have at most 30 lines.');
    const pick = (value: unknown, allowed: readonly string[], label: string) => {
      if (!allowed.includes(value as string)) fail(400, `${label}: please choose one of ${allowed.join(', ')}.`);
      return value as string;
    };
    return raw.map((line: Body, index) => {
      const label = `Item ${index + 1}`;
      const quantity = Number(line?.['quantity']);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) fail(400, `${label}: quantity must be between 1 and 50.`);
      const size = pick(line['size'], Object.keys(SIZE_SURCHARGE), `${label} size`) as ProductSize;
      const sugar = pick(line['sugar'], SUGAR_LEVELS, `${label} sugar level`);
      const ice = pick(line['ice'], ICE_LEVELS, `${label} ice level`);
      const toppingIds: string[] = [...new Set<string>(Array.isArray(line['toppingIds']) ? line['toppingIds'] : [])];
      const toppings = toppingIds.map((id) => TOPPINGS.find((t) => t.id === id) ?? fail(400, `${label}: unknown add-on "${id}".`));

      let productId: string, name: string, image: string, base: number;
      let options: PricedItem['options'] = {};
      if (line['productId'] === CUSTOM_DRINK.id) {
        const teaBase = pick(line['options']?.teaBase, CUSTOM_DRINK.teaBases, `${label} tea base`);
        const milk = pick(line['options']?.milk, CUSTOM_DRINK.milks, `${label} milk`);
        productId = CUSTOM_DRINK.id;
        name = `Custom ${teaBase}`;
        image = CUSTOM_DRINK.image;
        base = CUSTOM_DRINK.basePrice;
        options = { teaBase, milk };
      } else {
        const product = db.products.find((p) => p.id === line['productId']) ?? fail(400, `${label}: this drink is no longer on the menu.`);
        if (product.available === false) fail(400, `${product.name} is currently unavailable.`);
        productId = product.id;
        name = product.name;
        image = product.image;
        base = product.price;
      }
      const unitCents = Math.max(0, Math.round((base + SIZE_SURCHARGE[size] + toppings.reduce((s, t) => s + t.price, 0)) * 100));
      return { productId, name, image, size, sugar, ice, toppingIds, toppings: toppings.map((t) => t.name), options, unitCents, quantity };
    });
  }

  private evaluatePromo(db: LocalDb, promo: PromoRule | undefined, items: PricedItem[], subtotal: number, deliveryFee: number, fulfillment: string, userId: number): number {
    if (!promo) fail(400, 'That promo code is not valid.');
    const now = new Date();
    if (promo.validUntil && manilaDate(now) > promo.validUntil) fail(400, `${promo.code} has expired.`);
    if (promo.weekday !== undefined && manilaWeekday(now) !== promo.weekday) fail(400, `${promo.code} is only valid on ${WEEKDAYS[promo.weekday]}s.`);
    const min = Math.round((promo.minSubtotal ?? 0) * 100);
    if (subtotal < min) fail(400, `${promo.code} needs a minimum order of ${peso(min)} (add ${peso(min - subtotal)} more).`);
    if (promo.firstOrderOnly && db.orders.some((o) => o.userId === userId && !['cancelled', 'awaiting_payment'].includes(o.status))) {
      fail(400, `${promo.code} is only valid on your first order.`);
    }
    if (promo.kind === 'percent') return Math.round((subtotal * (promo.percent ?? 0)) / 100);
    if (promo.kind === 'free_delivery') {
      if (fulfillment !== 'delivery') fail(400, `${promo.code} only applies to delivery orders.`);
      return deliveryFee;
    }
    const prices = items
      .filter((i) => i.productId === promo.productId)
      .flatMap((i) => Array<number>(i.quantity).fill(i.unitCents))
      .sort((x, y) => y - x);
    const free = prices.filter((_, i) => i % 2 === 1).reduce((s, x) => s + x, 0);
    if (!free) {
      const product = db.products.find((p) => p.id === promo.productId);
      fail(400, `Add 2 × ${product?.name ?? 'eligible drink'} to your cart to use ${promo.code}.`);
    }
    return free;
  }

  private quote(db: LocalDb, body: Body, userId: number, strict: boolean) {
    const fulfillment = body['fulfillment'];
    if (fulfillment !== 'delivery' && fulfillment !== 'pickup') fail(400, 'Choose delivery or pickup.');
    const items = this.priceItems(db, body['items']);
    const subtotalCents = items.reduce((s, i) => s + i.unitCents * i.quantity, 0);
    const deliveryFeeCents = fulfillment === 'delivery' ? Math.round(DELIVERY_FEE * 100) : 0;
    let discountCents = 0;
    let promo: { code: string; title: string } | null = null;
    let promoError: string | null = null;
    const code = typeof body['promoCode'] === 'string' ? body['promoCode'].trim().toUpperCase() : '';
    if (code) {
      const rule = PROMO_RULES.find((p) => p.code === code);
      try {
        discountCents = this.evaluatePromo(db, rule, items, subtotalCents, deliveryFeeCents, fulfillment, userId);
        promo = { code: rule!.code, title: rule!.title };
      } catch (err) {
        if (strict) throw err;
        promoError = (err as HttpErrorResponse).error?.error ?? 'That promo code is not valid.';
      }
    }
    discountCents = Math.min(discountCents, subtotalCents + deliveryFeeCents);
    return { items, subtotalCents, deliveryFeeCents, discountCents, totalCents: subtotalCents + deliveryFeeCents - discountCents, promo, promoError, fulfillment };
  }

  // ---------- orders ----------

  private orderJson(db: LocalDb, o: LocalOrder, includeCustomer = false): Order {
    const json: Order = {
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      statusLabel: STATUS_LABELS[o.status],
      fulfillment: o.fulfillment,
      paymentMethod: o.paymentMethod,
      paymentMethodLabel: methodLabel(o.paymentMethod, o.fulfillment),
      paymentStatus: o.paymentStatus,
      paidVia: o.paidVia ? methodLabel(o.paidVia, o.fulfillment) : null,
      paidAt: o.paidAt,
      subtotal: o.subtotalCents / 100,
      deliveryFee: o.deliveryFeeCents / 100,
      discount: o.discountCents / 100,
      total: o.totalCents / 100,
      promoCode: o.promoCode,
      contactName: o.contactName,
      contactPhone: o.contactPhone,
      address: o.address,
      notes: o.notes,
      cancelReason: o.cancelReason,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      canPay: o.status === 'awaiting_payment',
      canCancel: ['awaiting_payment', 'pending'].includes(o.status) && o.paymentStatus !== 'paid',
      items: o.items.map(({ unitCents, ...item }) => ({ ...item, unitPrice: unitCents / 100 })),
      events: o.events.map((e) => ({ ...e, label: STATUS_LABELS[e.status] })),
    };
    if (includeCustomer) {
      json.nextStatuses = nextStatuses(o).map((s) => ({ value: s, label: STATUS_LABELS[s] }));
      const u = db.users.find((x) => x.id === o.userId);
      json.customer = u ? { id: u.id, name: u.name, email: u.email, phone: u.phone } : null;
    }
    return json;
  }

  private setStatus(o: LocalOrder, status: OrderStatus, note = '') {
    o.status = status;
    o.updatedAt = nowIso();
    o.events.push({ status, note, createdAt: o.updatedAt });
  }

  private async orders(db: LocalDb, m: string, b: string | undefined, c: string | undefined, body: Body, user: LocalUser) {
    if (m === 'POST' && b === 'quote') {
      const q = this.quote(db, body, user.id, false);
      return {
        quote: {
          subtotal: q.subtotalCents / 100,
          deliveryFee: q.deliveryFeeCents / 100,
          discount: q.discountCents / 100,
          total: q.totalCents / 100,
          promo: q.promo,
          promoError: q.promoError,
        },
      };
    }
    if (m === 'POST' && !b) {
      if (user.emailVerified === false) fail(403, 'Please verify your email address before placing an order.');
      const method = String(body['paymentMethod'] ?? '') as PaymentMethod;
      const online = method !== 'cod';
      if (online) {
        if (!this.integrations.paymentsEnabled()) {
          fail(400, 'Online payments aren’t set up yet. Ask the shop admin to add a PayMongo key in Shop Settings, or choose cash.');
        }
        if (!this.integrations.settings().paymongoMethods.includes(method)) fail(400, 'Please choose a valid payment method.');
      }
      const q = this.quote(db, body, user.id, true);
      if (online && q.totalCents < MIN_ONLINE_PAYMENT_CENTS) fail(400, 'Online payments need a total of at least ₱20. Please choose cash instead.');
      let contactName: string, contactPhone: string, address = '';
      if (q.fulfillment === 'delivery') {
        const a = db.addresses.find((x) => x.id === Number(body['addressId']) && x.userId === user.id) ?? fail(400, 'Please choose a delivery address.');
        contactName = a.recipient;
        contactPhone = a.phone;
        address = formatAddress(a) + (a.notes ? ` (${a.notes})` : '');
      } else {
        contactName = requireString(body['contactName'] ?? user.name, 'Contact name', 80);
        contactPhone = optionalPhone(body['contactPhone'] || user.phone, 'Contact number');
      }
      const id = ++db.seq.order;
      const now = nowIso();
      const status: OrderStatus = online ? 'awaiting_payment' : 'pending';
      const order: LocalOrder = {
        id,
        orderNumber: `TR-${10000 + id}`,
        userId: user.id,
        status,
        fulfillment: q.fulfillment,
        paymentMethod: method,
        paymentStatus: 'unpaid',
        paidVia: null,
        paidAt: null,
        subtotalCents: q.subtotalCents,
        deliveryFeeCents: q.deliveryFeeCents,
        discountCents: q.discountCents,
        totalCents: q.totalCents,
        promoCode: q.promo?.code ?? null,
        contactName,
        contactPhone,
        contactEmail: user.email,
        address,
        notes: optionalString(body['notes'], 'Notes', 300),
        cancelReason: null,
        createdAt: now,
        updatedAt: now,
        items: q.items.map(({ unitCents, ...rest }) => ({ ...rest, unitCents })),
        events: [{ status, note: online ? `Waiting for ${methodLabel(method, q.fulfillment)} payment` : 'Pay with cash on delivery', createdAt: now }],
      };
      db.orders.push(order);
      let checkoutUrl: string | null = null;
      if (online) {
        try {
          checkoutUrl = await this.startCheckout(order);
        } catch (err) {
          db.orders = db.orders.filter((o) => o.id !== order.id); // don't keep an order that can't be paid
          this.rethrowPayment(err);
        }
      }
      return { order: this.orderJson(db, order), checkoutUrl };
    }
    if (m === 'GET' && !b) {
      const mine = db.orders.filter((o) => o.userId === user.id).sort((x, y) => y.id - x.id);
      // Refresh a few unpaid online orders so payments made a moment ago show up.
      for (const o of mine.filter((x) => x.status === 'awaiting_payment' && x.checkoutId).slice(0, 3)) await this.syncPayment(o);
      return { orders: mine.map((o) => this.orderJson(db, o)) };
    }
    const order = db.orders.find((o) => o.id === Number(b) && (o.userId === user.id || user.role === 'admin')) ?? fail(404, 'Order not found.');
    if (m === 'GET' && !c) {
      await this.syncPayment(order);
      return { order: this.orderJson(db, order) };
    }
    if (m === 'POST' && c === 'pay') {
      await this.syncPayment(order);
      if (order.paymentStatus === 'paid') return { order: this.orderJson(db, order), checkoutUrl: null };
      if (order.status !== 'awaiting_payment') fail(400, 'This order can no longer be paid online.');
      let checkoutUrl: string | null = null;
      if (order.checkoutId) {
        const session = await retrieveCheckoutSession(this.secretKey(), order.checkoutId).catch(() => null);
        if (session?.attributes?.status === 'active') checkoutUrl = session.attributes.checkout_url;
      }
      if (!checkoutUrl) checkoutUrl = await this.startCheckout(order).catch((err) => this.rethrowPayment(err));
      return { order: this.orderJson(db, order), checkoutUrl };
    }
    if (m === 'POST' && c === 'cancel') {
      if (!this.orderJson(db, order).canCancel) {
        fail(400, 'This order is already being prepared, so it can no longer be cancelled. Please contact the shop.');
      }
      if (order.checkoutId) {
        await this.syncPayment(order);
        if (order.paymentStatus === 'paid') {
          fail(400, 'This order was just paid, so it can no longer be cancelled here. Please contact the shop.');
        }
        await expireCheckoutSession(this.secretKey(), order.checkoutId).catch(() => undefined);
      }
      order.cancelReason = 'Cancelled by customer';
      this.setStatus(order, 'cancelled', 'Cancelled by customer');
      return { order: this.orderJson(db, order) };
    }
    return fail(404, 'Not found.');
  }

  // ---------- PayMongo (on-device) ----------

  private secretKey(): string {
    return this.integrations.settings().paymongoSecretKey.trim();
  }

  private rethrowPayment(err: unknown): never {
    if (err instanceof PaymongoDirectError) fail(502, err.message);
    throw err;
  }

  /** PayMongo has no discount line, so a discounted order is sent as one line for the total. */
  private checkoutLines(o: LocalOrder): CheckoutLine[] {
    if (o.discountCents > 0) {
      const summary = o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ');
      return [{ name: `TeaRush order ${o.orderNumber}`, amount: o.totalCents, quantity: 1, description: `${summary} (promo ${o.promoCode} applied)`.slice(0, 255) }];
    }
    const lines: CheckoutLine[] = o.items.map((i) => ({
      name: i.name,
      amount: i.unitCents,
      quantity: i.quantity,
      description: [i.size, `${i.sugar} sugar`, i.ice, ...i.toppings].join(', ').slice(0, 255),
    }));
    if (o.deliveryFeeCents > 0) lines.push({ name: 'Delivery fee', amount: o.deliveryFeeCents, quantity: 1 });
    return lines;
  }

  private async startCheckout(o: LocalOrder): Promise<string> {
    const session = await createCheckoutSession(this.secretKey(), {
      lines: this.checkoutLines(o),
      method: o.paymentMethod,
      description: `TeaRush order ${o.orderNumber}`,
      reference: o.orderNumber,
      orderId: o.id,
      billing: { name: o.contactName, email: o.contactEmail, phone: o.contactPhone },
    });
    o.checkoutId = session.id;
    o.checkoutUrl = session.checkoutUrl;
    o.updatedAt = nowIso();
    return session.checkoutUrl;
  }

  /** Asks PayMongo whether an unpaid online order's checkout has been paid. */
  private async syncPayment(o: LocalOrder): Promise<void> {
    if (o.paymentStatus === 'paid' || !o.checkoutId || !['awaiting_payment', 'cancelled'].includes(o.status)) return;
    if (!this.integrations.paymentsEnabled()) return;
    try {
      const payment = paidPaymentOf(await retrieveCheckoutSession(this.secretKey(), o.checkoutId));
      if (!payment) return;
      const via = payment.attributes?.source?.type ?? o.paymentMethod;
      o.paymentStatus = 'paid';
      o.paymentId = payment.id;
      o.paidVia = via;
      o.paidAt = payment.attributes?.paid_at ? new Date(payment.attributes.paid_at * 1000).toISOString() : nowIso();
      o.cancelReason = null;
      this.setStatus(o, o.status === 'awaiting_payment' || o.status === 'cancelled' ? 'pending' : o.status, `Paid via ${methodLabel(via, o.fulfillment)}`);
      await this.storage.set(DB_KEY, this.db);
    } catch (err) {
      console.warn(`Could not check payment for ${o.orderNumber}`, err);
    }
  }

  // ---------- messages + admin ----------

  private sendMessage(db: LocalDb, body: Body, user: LocalUser | null) {
    const message: LocalMessage = {
      id: ++db.seq.message,
      userId: user?.id ?? null,
      name: requireString(body['name'], 'Name', 80),
      email: requireEmail(body['email']),
      phone: optionalString(body['phone'], 'Phone', 20),
      subject: optionalString(body['subject'], 'Subject', 120),
      message: requireString(body['message'], 'Message', 2000),
      isRead: false,
      createdAt: nowIso(),
    };
    db.messages.push(message);
    const { userId, ...json } = message;
    return { message: json };
  }

  private async admin(db: LocalDb, m: string, b: string | undefined, c: string | undefined, body: Body, query: Record<string, string>) {
    if (b === 'orders' && m === 'GET') {
      const filters: Record<string, (o: LocalOrder) => boolean> = {
        active: (o) => ['pending', 'preparing', 'out_for_delivery', 'ready_for_pickup'].includes(o.status),
        unpaid: (o) => o.status === 'awaiting_payment',
        completed: (o) => o.status === 'completed',
        cancelled: (o) => o.status === 'cancelled',
        all: () => true,
      };
      const filter = filters[query['filter']] ?? filters['active'];
      return { orders: db.orders.filter(filter).sort((x, y) => y.id - x.id).map((o) => this.orderJson(db, o, true)) };
    }
    if (b === 'orders' && m === 'PATCH') {
      const order = db.orders.find((o) => o.id === Number(c)) ?? fail(404, 'Order not found.');
      const status = body['status'] as OrderStatus;
      if (!nextStatuses(order).includes(status)) {
        fail(400, `Can't change a "${STATUS_LABELS[order.status]}" order to "${STATUS_LABELS[status] ?? status}".`);
      }
      const note = optionalString(body['note'], 'Note', 200);
      if (status === 'cancelled') {
        const reason = note || 'Cancelled by the shop';
        order.cancelReason = reason;
        if (order.paymentStatus === 'paid' && order.paymentId && this.integrations.paymentsEnabled()) {
          try {
            const refund = await createRefund(this.secretKey(), order.paymentId, order.totalCents, `${order.orderNumber}: ${reason}`);
            order.paymentStatus = 'refunded';
            order.refundId = refund.id;
            this.setStatus(order, status, `${reason} — refund requested`);
          } catch (err) {
            this.setStatus(order, status, `${reason} — automatic refund failed (${(err as Error).message}); refund it in the PayMongo dashboard`);
          }
        } else {
          if (order.checkoutId && order.paymentStatus !== 'paid') {
            await expireCheckoutSession(this.secretKey(), order.checkoutId).catch(() => undefined);
          }
          this.setStatus(order, status, reason);
        }
      } else if (status === 'completed' && order.paymentMethod === 'cod') {
        order.paymentStatus = 'paid';
        order.paidVia = 'cod';
        order.paidAt = nowIso();
        this.setStatus(order, status, note || 'Cash payment received');
      } else {
        this.setStatus(order, status, note);
      }
      return { order: this.orderJson(db, order, true) };
    }
    if (b === 'stats' && m === 'GET') {
      const today = manilaDate(new Date());
      const todays = db.orders.filter((o) => manilaDate(new Date(o.createdAt)) === today && !['cancelled', 'awaiting_payment'].includes(o.status));
      const counts: Record<string, number> = {};
      for (const o of db.orders) counts[o.status] = (counts[o.status] ?? 0) + 1;
      return {
        today: { orders: todays.length, revenue: todays.reduce((s, o) => s + o.totalCents, 0) / 100 },
        counts,
        active: ['pending', 'preparing', 'out_for_delivery', 'ready_for_pickup'].reduce((s, k) => s + (counts[k] ?? 0), 0),
      };
    }
    if (b === 'messages') {
      if (m === 'GET' && !c) return { messages: [...db.messages].sort((x, y) => y.id - x.id).map(({ userId, ...msg }) => msg) };
      const message = db.messages.find((x) => x.id === Number(c)) ?? fail(404, 'Message not found.');
      if (m === 'PATCH') {
        message.isRead = true;
        return { ok: true };
      }
      if (m === 'DELETE') {
        db.messages = db.messages.filter((x) => x.id !== message.id);
        return { ok: true };
      }
    }
    return fail(404, 'Not found.');
  }
}
