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
