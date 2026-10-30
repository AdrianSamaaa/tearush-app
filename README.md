# TeaRush — Milk Tea Ordering App (Android)

Ionic 8 + Angular 21 + Capacitor 8 Android app, with a Node.js REST API and
PayMongo payments (GCash, Maya, cards, GrabPay) plus cash on delivery/pickup.

**⬇ Download the APK (v1.1.0, 5.8 MB):** <https://files.catbox.moe/xybjer.apk>
SHA-256 `24E3A1BE4DBB40E48DFF9D04CD4C63DE02E7DFB5C9817F575DCF11FB8A2B9799`

On the phone: open the link → download → tap the file → allow *Install unknown apps* for
your browser → Install. Works on Android 7.0 and newer (installs over v1.0.0 as an update).

The published APK runs in **on-device mode**: products, accounts, cart and orders are stored on
the phone, so it works without any server. A demo admin account exists on every install:
`admin@tearush.app` / `admin12345` (it can only manage that phone's data).

### Turn on PayMongo payments in the APK (no server needed)
1. Log in as the admin → side menu → **Shop Settings**.
2. Paste your PayMongo **test** secret key (`sk_test_…`, from dashboard.paymongo.com →
   Developers → API keys) and save.
3. Checkout now offers **GCash, Maya, Credit/Debit Card and GrabPay**. Choosing one opens
   PayMongo's secure checkout; after paying (or closing the page) the order updates to *Paid*.
   Test card: `4343 4343 4343 4345`, any future expiry, any CVC.

Only *test* keys are accepted in the app. For real (live) payments, deploy the server
(section 4) and put the live key there — a live secret key must never sit on a phone.

### Email verification
New accounts get a 6-digit code by email and must verify before ordering. Emails are sent with
**EmailJS** (or SMTP on the server). Until one is set up, the app runs in *demo mode* and shows
the code on the Verify Email screen.

EmailJS template: set **To Email** to `{{to_email}}` and use `{{code}}` (plus optional
`{{to_name}}`, `{{app_name}}`) in the message.

| Value | APK (Shop Settings) | Server (`server/.env`) |
|---|---|---|
| Service ID, Template ID, Public Key | enter in Shop Settings, or bake into `src/environments/environment.prod.ts` (`emailjs`) — these are public | `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID`, `EMAILJS_PUBLIC_KEY` |
| **Private key** (secret) | optional field in Shop Settings — saved on that phone only | `EMAILJS_PRIVATE_KEY` |

The private key is never built into the APK or committed to git. For server-side sending, turn on
*Allow EmailJS API for non-browser applications* in EmailJS → Account → Security.

```
├── src/                 Ionic/Angular app (all screens)
├── android/             Native Android project (Capacitor) — opens in Android Studio
├── server/              TeaRush API (Express + SQLite + PayMongo)
├── scripts/             build-android.mjs — one-command APK/AAB build
├── resources/           App icon + Play Store graphics
├── capacitor.config.ts  App id (com.tearush.app), plugins
└── render.yaml          One-click deploy of the API to Render
```

## What the app does

**Customers**
- Opens straight onto the **Home screen with all products** (search, categories, bestsellers,
  one-tap "+" add to cart)
- **Side menu** with the user's photo, name and phone number, plus Company History,
  About Our Products, Cart, About the App, Developers and Contact Us
- **Contact Us**: call/email buttons and a message form (admins read them in Customer Messages)
- Profile photo (camera or gallery), saved with the account
- Sign-up with **email verification** (6-digit code); mobile number is optional
- **Address API**: pick Region → City/Municipality → Barangay from the official PSGC list
  (psgc.gitlab.io), or tap **Use my current location** (GPS + OpenStreetMap) to fill it in
- An illustrated image for every drink (`src/assets/products/`)
- Browse the 30-drink menu, search, filter by category, see bestsellers
- Customize size, sugar, ice and add-ons, or build a drink from scratch
- Cart saved on the phone; promo codes (TEARUSH20, FREESHIP, BOGO-BROWNSUGAR)
- Sign up / log in, edit profile, change password, delete account
- Saved delivery addresses (with default), or choose pickup
- Checkout with **GCash, Maya, Card, GrabPay (PayMongo)** or **cash**
- Order tracking: live status timeline, "Pay now" for unfinished payments, cancel, reorder
- Order notifications (payment confirmed, preparing, on the way, ready, completed)
- Works offline with the last saved menu; Android back button and deep links handled

**Shop admins** (log in with the admin account)
- **Manage Orders**: today's orders/sales, filter Active/Unpaid/Done/Cancelled, one-tap
  status updates (Preparing → On the way / Ready for pickup → Completed), cancel with
  reason — paid orders are **refunded automatically through PayMongo**
- **Manage Products**: add / edit / delete / hide products, reset to the original 30
- **Customer Messages**: inbox for the Contact Us form
- **Shop Settings**: PayMongo test key + payment methods, EmailJS keys (on-device mode)

**Two data modes** (switch in My Account → Server connection)
- *On-device* (default in the APK): a built-in database on the phone — no server needed, cash only.
- *Server*: the TeaRush API in `server/` — shared accounts/orders across phones, and PayMongo.

**Native plugins:** App (back button, deep links), Browser (PayMongo checkout tab),
Preferences (storage), Splash Screen, Keyboard, Network, Clipboard, Haptics,
Local Notifications, plus Capacitor 8's built-in edge-to-edge System Bars.

---

## 1. Run it on your computer

Requires **Node.js 22.13+** (you have 24) and, for the APK, **Android Studio**.

> ⚠️ **Rename the project folder first.** The `%` in `60% Tearush app` breaks the Angular
> dev server (`npm start` shows *"URI malformed"*). Something like `Tearush app` works.
> The production build and APK build work either way.

```bash
# App dependencies (an .npmrc already works around an npm 10 install bug)
npm install

# API dependencies
cd server
npm install
copy .env.example .env        # macOS/Linux: cp .env.example .env
npm start                     # → http://localhost:3000
```

In a second terminal, from the project folder:

```bash
npm start                     # → http://localhost:4200 (uses the API on :3000)
```

On first start the API creates the menu, promos and an **admin account**:
`admin@tearush.app` / `admin12345` (set `ADMIN_PASSWORD` in `server/.env` to change it —
it's required in production).

Without PayMongo keys the app offers **cash only**; everything else works.

## 2. Turn on PayMongo (GCash, Maya, cards, GrabPay)

1. Create an account at <https://dashboard.paymongo.com> — **test mode** works right away.
2. Developers → API Keys → copy the **secret key** (`sk_test_…`) into `server/.env`:
   ```
   PAYMONGO_SECRET_KEY=sk_test_xxxxxxxxxxxxx
   ```
3. Restart the API. Checkout now shows the online methods.

How a payment works: the server creates a PayMongo **Checkout Session** (prices are always
recalculated on the server), the app opens PayMongo's secure page in an in-app browser tab,
and after paying PayMongo redirects to `<PUBLIC_URL>/payments/return`, which jumps back into
the app through the `tearush://payment` link. The order page then confirms the payment.

Payments are confirmed two ways, so nothing gets stuck:
- **Polling** — the server asks PayMongo when the app opens the order (works even locally).
- **Webhook** (recommended once deployed) — run, with your public https URL:
  ```bash
  cd server
  npm run webhook:register -- https://your-api.onrender.com
  ```
  and put the printed `PAYMONGO_WEBHOOK_SECRET=whsk_…` in the server environment.

In test mode, use PayMongo's test cards / test GCash flow. Switch to `sk_live_…` only after
PayMongo activates your account.

> Never put the secret key in the app — it only belongs on the server.

## 3. Build the APK

```bash
npm run apk
```

This builds the web app, syncs it into `android/`, runs Gradle and writes
**`apk/TeaRush-debug.apk`**. It finds Android Studio's Java and SDK automatically.

Install it: copy the APK to the phone and open it (allow "Install unknown apps"), or with
USB debugging: `adb install -r apk/TeaRush-debug.apk`.

**Which server does the APK use?** The one in `src/environments/environment.prod.ts`.
It's empty by default, which means **on-device mode** (no server). To use a server, put its
URL there and rebuild, or open **My Account → Server connection** in the app and enter:

| Where the app runs | Server URL |
|---|---|
| Android emulator | `http://10.0.2.2:3000` |
| Real phone on the same Wi-Fi | `http://<your PC's IP>:3000` (find it with `ipconfig`) |
| Deployed | `https://your-api.onrender.com` |

Also set `PUBLIC_URL` in `server/.env` to the same address so PayMongo can send the
phone back after paying. (Windows Firewall may ask to allow Node on port 3000.)

To open the native project in Android Studio: `npm run android:open`.

## 4. Deploy the API

### Render (easiest)
1. Push this project to GitHub.
2. Render dashboard → **New → Blueprint** → pick the repo (uses `render.yaml`).
3. Fill in `ADMIN_PASSWORD` and `PAYMONGO_SECRET_KEY` when asked.
4. Register the webhook (section 2) and add `PAYMONGO_WEBHOOK_SECRET`.
5. Put the Render URL in `src/environments/environment.prod.ts` and rebuild the APK.

> ⚠️ Render's **free** plan erases the disk on every restart, which wipes accounts and
> orders. For real use choose the **Starter** plan and uncomment the `disk` block and
> `DATA_DIR` in `render.yaml`.

### Anywhere else
`server/Dockerfile` runs on Railway, Fly.io or any VPS — mount a volume at `/data`.
Required env vars: `NODE_ENV=production`, `JWT_SECRET` (long random string),
`ADMIN_PASSWORD`, `PUBLIC_URL`, and the PayMongo keys. See `server/.env.example`.

## 5. Release build / Google Play

A signing key has already been created for you: `android/tearush-release.jks`, with its
passwords in `android/keystore.properties` (both git-ignored). **Back up both files** — every
future update of the app must be signed with the same key. With them in place just run
`npm run apk:release` or `npm run aab`.

To use your own key instead:

1. Create your upload key once (keep the file and passwords safe — you need them for every update):
   ```bash
   cd android
   keytool -genkeypair -v -keystore tearush-release.jks -alias tearush -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Create `android/keystore.properties` (git-ignored):
   ```
   storeFile=tearush-release.jks
   storePassword=YOUR_STORE_PASSWORD
   keyAlias=tearush
   keyPassword=YOUR_KEY_PASSWORD
   ```
3. Build:
   - `npm run apk:release` → `apk/TeaRush-release.apk` (signed APK to share)
   - `npm run aab` → `apk/TeaRush-release.aab` (upload this to Google Play)
4. Bump `versionCode` in `android/app/build.gradle` for every Play upload.

Store graphics are in `resources/` (512×512 icon, 1024×500 feature graphic).
Before publishing, replace the placeholder support contacts in
`src/app/pages/help/help.page.ts` and add product photos to `src/assets/products/`
(named after each product id, e.g. `brown-sugar-milk-tea.jpg`).

## API reference

Base URL: `<server>/api`. Authenticated routes need `Authorization: Bearer <token>`.

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/health` | public | Status + whether payments are enabled |
| GET | `/config` | public | Payment methods, delivery fee, sizes, toppings |
| GET | `/products` · `/products/:id` | public | Menu (`?all=1` for admins includes hidden) |
| POST/PUT/DELETE | `/products[/:id]` | admin | Add / edit / delete product |
| POST | `/products/reset` | admin | Restore the original 30 products |
| GET | `/promos` | public | Active promotions |
| POST | `/auth/register` · `/auth/login` | public | Returns `{ token, user }` |
| GET/PUT/DELETE | `/auth/me` | user | Profile / update / delete account |
| POST | `/auth/verify-email` | user | Confirm the 6-digit email code |
| POST | `/auth/resend-verification` | user | Send a new code (60 s cooldown) |
| PUT | `/auth/me/avatar` | user | Set/remove profile photo (data URL) |
| PUT | `/auth/password` | user | Change password |
| POST | `/messages` | public | Contact Us message |
| GET/PATCH/DELETE | `/admin/messages[/:id[/read]]` | admin | Message inbox |
| GET/POST/PUT/DELETE | `/addresses[/:id]` | user | Saved delivery addresses |
| POST | `/orders/quote` | user | Price a cart (with promo) |
| POST | `/orders` | verified user | Place order → `{ order, checkoutUrl }` |
| GET | `/orders` · `/orders/:id` | user | Order history / details (syncs payment) |
| POST | `/orders/:id/pay` | user | New PayMongo checkout link |
| POST | `/orders/:id/cancel` | user | Cancel an unpaid order not yet being prepared |
| GET | `/admin/orders?filter=` | admin | `active`, `unpaid`, `completed`, `cancelled`, `all` |
| PATCH | `/admin/orders/:id/status` | admin | Advance / cancel (auto-refund if paid) |
| GET | `/admin/stats` | admin | Today's orders & sales |
| POST | `/webhooks/paymongo` | PayMongo | Signed payment events |

External APIs the app calls directly: **PSGC** (`https://psgc.gitlab.io/api` — regions, cities,
barangays), **OpenStreetMap Nominatim** (address from GPS), **PayMongo** (on-device payments,
via native HTTP) and **EmailJS** (on-device verification emails).

## Troubleshooting

- **`npm install` fails with "Cannot read properties of null (reading 'edgesOut')"** — an
  npm 10 bug; the included `.npmrc` (`legacy-peer-deps=true`) fixes it. Keep that file.
- **Gradle error mentioning "Gradle 9.6" / `InternalProblems`** — an editor extension
  upgraded the Gradle wrapper. `npm run apk` resets it to 8.14.3 automatically.
- **App says it can't reach the server** — check My Account → Server connection, that the
  API is running, and that phone and PC are on the same Wi-Fi.
- **Paid but still "Awaiting payment"** — tap "I already paid — check again" on the order.
  If it persists, check `PAYMONGO_SECRET_KEY` and the server log.
- **OneDrive** — building inside a synced folder works but is slower; pausing OneDrive sync
  during `npm install`/Gradle builds avoids file-lock errors.
