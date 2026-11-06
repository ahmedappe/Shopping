# Kandhufathi

Kandhufathi — an online store built with **Next.js 15 (App Router)**, **Supabase** (Postgres, Auth, Storage) and **Tailwind CSS v4**, ready to deploy on **Vercel**.

## Features

**Storefront**
- Home page with categories, featured products and new arrivals
- Product listing with search, category filter, price range, in-stock filter, sorting and pagination
- Product pages with image gallery, option selectors (e.g. Size × Color), stock levels and related products
- Cart saved in the browser, refreshed against live prices and stock
- Checkout requiring an account; totals are calculated in the database, never trusted from the browser
- Bank-transfer payment: customers see your account details and upload their receipt
- Order tracking: **Pending → Slip uploaded → Approved → Delivered** (or **Rejected**)
- Mobile-first, accessible, SEO metadata, sitemap and robots.txt

**Admin panel** (`/admin`)
- Dashboard: revenue (30 days / all time), orders today, slips awaiting review, customers, 14-day revenue chart, orders by status, top products, low-stock alerts
- Products: create/edit, variants with price/stock/SKU, quick variant generator, up to 12 images per product (reorder, delete), visibility and featured flags
- Categories: add, edit, delete
- Orders: filter by status, search by order number/name/phone, view the payment slip, approve / reject / ask for a new slip / mark delivered, with a note to the customer and full history

**Image compression**
- Every image (product photos and payment slips) is compressed **twice**: first in the browser (WebP, max 1600–1800px) so uploads are small, then re-encoded on the server with `sharp`, which also checks the file is a real image and strips EXIF/GPS data. A typical phone photo ends up around 100–250 KB.

## Security

- **Row Level Security** on every table. Customers can only read their own orders; nobody can edit orders directly.
- Orders, payment slips and status changes go through **database functions** that lock stock rows, check stock, compute prices and enforce the allowed status changes.
- Stock is reserved when an order is placed and **returned automatically if the order is rejected**.
- A customer can have at most 3 unpaid orders (stops people reserving all your stock).
- Customers cannot make themselves admin (the `role` column cannot be updated by users).
- Payment slips live in a **private** bucket. Customers can only upload into their own folder and cannot delete slips; admins view them through short-lived signed links.
- Admin pages and actions check the admin role on the server, and the database checks it again.
- Input validation with Zod, safe redirects, security headers (HSTS, no framing, nosniff, referrer policy), no service-role key needed anywhere.

## Setup

### 1. Requirements
- [Node.js 20 or newer](https://nodejs.org)
- A free [Supabase](https://supabase.com) project
- A [Vercel](https://vercel.com) account (for deployment)

### 2. Create the database
1. Open your Supabase project → **SQL Editor**.
2. Paste the contents of `supabase/migrations/0001_init.sql` and click **Run**.
3. (Optional) Run `supabase/seed.sql` to add starter categories.

This creates the tables, security policies, functions and the two storage buckets (`product-images`, `payment-slips`).

### 3. Configure Auth
In Supabase → **Authentication → URL Configuration**:
- **Site URL**: `http://localhost:3000` (change to your Vercel URL later)
- **Redirect URLs**: add `http://localhost:3000/auth/confirm` and `https://YOUR-DOMAIN/auth/confirm`

### 4. Environment variables
Copy `.env.example` to `.env.local` and fill in:
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase → Project Settings → API
- `NEXT_PUBLIC_SITE_URL` — `http://localhost:3000` locally, your domain in production
- `NEXT_PUBLIC_CURRENCY` (default `MVR`). The store name is set in `src/config/store.ts`.
- `BANK_NAME`, `BANK_ACCOUNT_NAME`, `BANK_ACCOUNT_NUMBER` — shown to customers on their order page

### 5. Run locally
```bash
npm install
npm run dev
```
Open http://localhost:3000.

### 6. Make yourself an admin
1. Sign up on the site with your email and confirm it.
2. In the Supabase SQL Editor run:
   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'you@example.com');
   ```
3. Refresh — an admin icon appears in the header. Go to `/admin`.

### 7. Deploy to Vercel
1. Push this folder to a GitHub repository.
2. In Vercel: **Add New → Project**, import the repo.
3. Add the same environment variables (set `NEXT_PUBLIC_SITE_URL` to your Vercel URL).
4. Deploy, then add `https://YOUR-DOMAIN/auth/confirm` to Supabase redirect URLs and update the Site URL.

## Roles and users

| Role | Can do |
|---|---|
| Customer | Shop on the website |
| Staff | View, add and edit products and categories (can't delete them, can't see orders) |
| Manager | Everything except managing users: orders, payment slips, dashboard, products, categories |
| Admin | Everything, including the **Users** page (create users, change roles, reset passwords, disable accounts) |

Rules are enforced in the database (Row Level Security) as well as in the app.
Creating users, resetting passwords and disabling accounts need `SUPABASE_SERVICE_ROLE_KEY`
(Supabase → Project Settings → API keys → secret / service_role) set in Vercel.

Database updates to run in order: `0001_init.sql` to `0009_phase1_foundation.sql`.

**Receipt checks:** when a customer uploads a bank receipt, the browser reads its text (Tesseract OCR) and the server checks amount, our account, date and reference. Nothing is blocked: an image that isn't a receipt, a wrong amount or account, an odd date or a reused receipt is still accepted but flagged for you on the order page and orders list. It is only a first filter; always still compare the slip image. Run `0004_slip_validation.sql` in the Supabase SQL editor **before** deploying this version.

## Phase 1 foundation (migration `0009_phase1_foundation.sql`)

Run `0009_phase1_foundation.sql` in the Supabase SQL editor **before** deploying this version (after 0001–0008).

- **Company access** (Users → user): staff sign in with one company but can be given extra companies, then outlets in any of them.
- **Suppliers** (`/admin/suppliers`, managers): kept per company.
- **Purchasing & reorder** card on each product: brand, unit, main supplier and supplier code per company, barcode per variant, **cost price (managers and admins only — staff and customers can never read it)**, price levels 2–4, reorder level, reorder quantity and shelf per outlet. Price level names are in `store_settings.price_level_names`.
- **Reorder list** (`/admin/stock/reorder`): items at or below their reorder level (shop + godown), grouped by supplier, with editable quantities and a **Copy message** button for WhatsApp/Viber/SMS.
- **Multi-item transfers**: one request with many items; managers approve or reject the whole list at once.
- **Godown tablet** (`/godown`): full-screen page for a tablet at the godown — search by name, rough spelling or barcode, enter quantity, add more, confirm once. Bookmark `/godown?outlet=<slug>` on the tablet.
- **Audit log** (`/admin/audit`, admins): every insert, change and delete on products, prices, stock, costs, transfers, orders, suppliers, outlets, users and access. Nobody can edit or delete it.

## Store settings
Delivery fee and free-delivery threshold are in the `store_settings` table (defaults: 30 and free over 500). Change them in Supabase → Table Editor → `store_settings`.

## Project structure
```
src/
  app/
    (shop)/            storefront: home, products, cart, checkout, orders, login/signup
    admin/             admin dashboard, products, categories, orders
    auth/              email confirmation & sign-out routes
  components/          shared UI components
  lib/                 Supabase clients, auth helpers, catalog queries, validation, image processing
  store/cart.ts        cart state (saved in the browser)
  config/store.ts      store name, currency, bank details, status labels
supabase/
  migrations/0001_init.sql   database schema, security and functions
  seed.sql                   starter categories
```

## Ideas for later
- Plug in a payment gateway (e.g. BML Connect) — add a new status and keep the slip flow as a fallback
- Automatically cancel orders left unpaid for 48 hours (Supabase `pg_cron`) so reserved stock is released
- Email/SMS notifications when an order status changes
- Rate limiting on sign-up and checkout (e.g. Vercel Firewall or Upstash)
- Generate Supabase TypeScript types: `npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts`

## Phase 2A — Cafe POS, kitchen and bar, recipes

Run `supabase/migrations/0010_phase2a_cafe_pos.sql` in the Supabase SQL editor (after 0009).

Set up once (Admin → **POS setup**): add tables, set the service charge % (dine-in only, admin), receipt header/footer, and choose for each menu item whether it goes to the **Kitchen**, the **Bar**, or no screen (sold from stock).

- `/pos?outlet=<slug>` — tables board with live "seated for" timers, take-away and delivery orders, guest bell / waiter / bill requests.
- `/pos/order/<id>` — search or scan items, add notes, **Send** to kitchen/bar, mark served, void, split payment (cash / card / transfer; card and transfer need a reference), manager-only discount, receipt.
- `/kitchen?outlet=<slug>&station=kitchen|bar` — separate full-screen kitchen and bar boards (Start → Ready). Refreshes every few seconds.
- `/t/<token>` — public table menu from the table QR, with Ring bell / Call waiter / Ask for bill. Print each table's QR from POS setup.
- Admin → **Recipes**: ingredients (per company), stock per outlet, reorder level, and the recipe of each menu item. Each sale deducts the recipe from the outlet's ingredient stock (it may go below zero if counts lag; shown in red).
- `/pos/receipt/<id>` — 80 mm receipt. For printing with no dialog, start the POS browser with `--kiosk-printing` and set the receipt printer as the default printer.

Not in 2A yet: advance-production counts (e.g. "9 chicken curry made"), voice entry, retail barcode POS extras, gift cards, multi-currency.

## Phase 2B-1 – Made in advance & planner

Run `supabase/migrations/0011_phase2b1_production.sql` in the Supabase SQL editor.

- **POS setup → Where each item is made**: tick *Made in advance* per item and set "make more at".
- **/kitchen/production**: kitchen/bar log what was made (+1/+5/+10, custom, wasted, set count, undo). Voice entry ("chicken curry 9 and egg roll 12") uses the browser's free speech recognition and always asks to confirm. Making an item uses up its recipe ingredients.
- **POS**: sales take from ready portions first (no second deduction); any extra goes to the kitchen as normal. Voiding returns portions.
- **/admin/plan**: big-order ingredient planner (needs vs on hand, copyable shopping list).

## Phase 2B-2a – Cash drawer, gift cards, foreign currency

Run `supabase/migrations/0012_phase2b2_cash_gift_currency.sql` (needs 0011).

- **/pos/cash**: open the drawer with a starting float, cash in/out with a reason, close with a count. Managers see expected vs counted (over/short).
- **Admin → Gift cards & currency**: issue (auto or typed code), top up, cancel gift cards (shared by all outlets of a company); set exchange rates (e.g. USD); admins can require an open drawer before cash sales.
- **Payment screen**: new *gift card* method and cash in a foreign currency (recorded in MVR at the saved rate).

## Phase 2B-3 – Customers, loyalty & referral points, delivery person

Run `supabase/migrations/0013_phase2b3_customers_loyalty_delivery.sql` (needs 0012).

- Customers are kept **separately per outlet**; add or find them on the order screen (name/phone). Each has a referral code.
- **Admin → Customers & loyalty**: admin sets points per 100 MVR, value of a point, referral bonus (all 0 = off); managers can adjust points with a reason.
- **Payment screen**: *points* method (needs a customer). Points are earned on money paid; the referrer gets a bonus on the friend's first paid order.
- **Delivery orders**: pick the delivering staff member, address, and mark assigned / out / delivered.

## Phase 2B-4 – Barcode scanning at the POS

No database change. On the order screen:
- A USB/Bluetooth scanner (types the code + Enter) or typing a barcode/SKU + Enter adds that item straight to the order; quick repeated scans are batched. Beep for found / low beep for unknown.
- Kitchen/bar items are added to the draft instead so notes can be added.
- **Scan with camera** button (Chrome/Edge/Android) keeps the camera open and adds each barcode it sees.

## Phase 3A – Customer credit and sales reports

Run `supabase/migrations/0014_phase3a_credit_reports.sql` (needs 0013).

- **Credit / on account**: a manager sets a credit limit per customer (Customers & loyalty). At payment, choose *on account* (customer must be on the order). Staff are blocked over the limit; managers can approve more. **Admin → Customer credit** shows what each customer owes with 0–30/31–60/61–90/90+ day ageing, a statement, and records payments received (cash/card/transfer).
- **Admin → Sales reports** (managers): totals, GST (set % per outlet by an admin; prices are treated as GST-inclusive), by day, payment method, order type, best sellers, cash drawer over/short, CSV download.
