# Smart Provision Store

A complete store-management system for Indian provision/kirana retail: fast GST billing, stock control, customer credit and loyalty, supplier purchases, expenses, returns and owner-level reporting.

Built as a TypeScript monorepo with a React SPA, an Express REST API and PostgreSQL.

---

## Live demo

- **Web:** <https://provision-store-web.onrender.com>
- **API health:** <https://provision-store-api.onrender.com/api/v1/health>

Sign in with `admin@provisionstore.local` and the password configured as
`SEED_ADMIN_PASSWORD`. The Render free plan sleeps when idle, so the first
request can take 30–60 seconds; the free database expires on 9 December 2026.
See [Deploy on Render](docs/DEPLOY-VERCEL-RENDER.md).

---

## What is included

| Area | Capabilities |
| --- | --- |
| **POS billing** | Barcode/keyboard-first terminal, per-product GST (inclusive or exclusive), line and bill discounts, CGST/SGST vs IGST, cess, rupee round-off, split payments, credit sales, loyalty redemption, hold/resume bills, thermal and A4 PDF invoices |
| **Invoices** | Search and filter, full detail with payment history, void with reversal, printable PDF/thermal receipt, sale returns with proportional refunds |
| **Inventory** | Live stock per location, stock ledger (append-only), adjustments with reason, transfers between locations, low/out-of-stock views, valuation, expiry tracking, batch numbers |
| **Products & catalog** | Products with HSN, barcode, MRP/selling/purchase price, tax rate, reorder level, images, categories, brands, units, GST slabs, Excel import/export, barcode generation |
| **Customers** | Profiles, GSTIN, credit limit and payment terms, outstanding balance, ledger, payments, loyalty points and history, deactivation |
| **Suppliers & purchasing** | Supplier ledger, purchase orders, goods receipts (purchases) with batch/expiry, supplier payments, purchase returns, payables |
| **Expenses** | Categories, dated expenses with payment mode, reversal (no hard deletes), date-range summary |
| **Reports** | 13 reports with date filters and Excel/PDF export: sales summary/detailed/by product/by customer/by category, GST summary, HSN summary, profit, inventory valuation, purchases, expenses, receivables ageing, payments |
| **Dashboard** | Today and period sales, profit, average bill, payment mix, top products, low stock, receivables, trend chart |
| **Administration** | Employees, custom roles with a 57-permission matrix, store/GST/invoice/loyalty/stock settings, audit log with before/after values |
| **Platform** | JWT access tokens + rotating httpOnly refresh cookies, RBAC on every protected endpoint, rate limiting, request IDs, Zod validation, append-only audit/financial tables, transactional stock and money mutations, idempotent invoice creation |

No demo products, customers or sales are seeded. The database starts with configuration only, so every figure you see is real.

---

## Stack

- **Frontend** — React 18, TypeScript, Vite 6, Tailwind CSS 3, Radix/shadcn-style UI, React Router 6, TanStack Query 5, Recharts, Sonner
- **Backend** — Node 22, Express 5, TypeScript, Prisma 6, Zod, Pino, PDFKit, ExcelJS, bwip-js
- **Database** — PostgreSQL 16 (`pg_trgm` for fast product search)
- **Shared** — `@ps/shared` holds the billing engine, Zod schemas, permission catalogue and domain types used by both apps

---

## Repository layout

```
provision-store/
├─ apps/
│  ├─ api/                 Express REST API
│  │  ├─ prisma/           schema, migrations, seed
│  │  ├─ src/
│  │  │  ├─ modules/       auth, users, roles, store, audit, products, catalog,
│  │  │  │                 inventory, sales, customers, suppliers, purchases,
│  │  │  │                 expenses, dashboard, reports
│  │  │  ├─ middleware/    auth, validation, rate limits, errors, request IDs
│  │  │  └─ lib/           prisma, audit, numbering, money, PDF, Excel, upload
│  │  └─ tests/            Vitest unit tests
│  └─ web/                 React single-page app
│     └─ src/
│        ├─ pages/         one file per screen
│        ├─ components/    layout, shared and UI primitives
│        ├─ contexts/      auth provider
│        └─ lib/           API client, query client, formatters, types
├─ packages/shared/        billing math, schemas, permissions, constants
├─ scripts/smoke.mjs       live 43-endpoint smoke test
└─ docs/                   setup, deployment, backups, architecture, API
```

---

## Quick start

### 1. Prerequisites

- Node.js **22.9+** and npm 10+
- PostgreSQL **16+** with the `pg_trgm` extension available
- Git (optional)

### 2. Create the databases

```sql
CREATE DATABASE provision_store;
CREATE DATABASE provision_store_test;

\c provision_store
CREATE EXTENSION IF NOT EXISTS pg_trgm;

\c provision_store_test
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

### 3. Configure environment

```bash
cp .env.example apps/api/.env
```

The API and Prisma CLI load `.env` from `apps/api` because npm workspace scripts run with that working directory. Edit `apps/api/.env`:

- Point `DATABASE_URL` at your PostgreSQL instance.
- Replace **both** JWT secrets with long random strings:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
  ```
- Set `SEED_ADMIN_PASSWORD` to a unique, strong password before seeding.
- Set `COOKIE_SECURE=true` in production.

### 4. Install, migrate and seed

```bash
npm install
npm run db:generate
npm run db:deploy -w @ps/api
npm run db:seed
```

Seeding creates the store, the five system roles, all 57 permissions, units, GST slabs, catalog categories, expense categories, a default location, the loyalty rule and one administrator. It never creates fake business data.

### 5. Run

```bash
npm run dev
```

- Web app: <http://localhost:5173>
- API: <http://localhost:4000/api/v1>
- Health: <http://localhost:4000/api/v1/health>

Administrator (from `SEED_ADMIN_*` in `.env`):

```
Email:    admin@provisionstore.local
Password: the value configured as SEED_ADMIN_PASSWORD
```

---

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run API and web together with hot reload |
| `npm run build` | Build API bundle and production web assets |
| `npm start` | Run the built API (`apps/api/dist/server.js`) |
| `npm test` | Run API unit tests (billing engine) |
| `npm run typecheck` | Type-check API and web |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:migrate` | Create/apply a migration in development |
| `npm run db:deploy -w @ps/api` | Apply existing migrations (production) |
| `npm run db:seed` | Seed configuration and the first admin |
| `npm run db:reset` | Drop, migrate and reseed the database (**destructive**) |
| `npm run db:studio` | Open Prisma Studio |
| `node scripts/smoke.mjs` | Exercise 43 live endpoints against a running API |
| `node scripts/e2e.mjs` | Run the 40-check money/stock/RBAC business flow against a test database |

---

## Verification

```bash
npm run typecheck
npm test
npm run build

# with the API running:
node scripts/smoke.mjs

# business-flow check against a test API (never the production database):
$env:API_URL = "http://localhost:4001/api/v1"
node scripts/e2e.mjs
```

The smoke test logs in as the seeded administrator, calls every module, exports an Excel and a PDF report and confirms that an unauthenticated request is rejected with `401`.

The end-to-end script drives a complete trading cycle — product, supplier, purchase, cash and credit invoices, idempotent replay, customer and supplier payments, sale and purchase returns, expenses, RBAC, reports, invoice PDF/thermal output and audit logging — and asserts money and stock after every step. Point it at a dedicated test database: start a second API on port 4001 with `DATABASE_URL` set to `provision_store_test` (see [docs/SETUP.md](docs/SETUP.md#8-verify-the-installation)).

---

## Documentation

- [Setup guide](docs/SETUP.md)
- [Deployment guide (single host)](docs/DEPLOYMENT.md)
- [Deploy on Render (or Vercel + Render)](docs/DEPLOY-VERCEL-RENDER.md)
- [Backup and restore](docs/BACKUP-RESTORE.md)
- [Architecture and invariants](docs/ARCHITECTURE.md)
- [API reference](docs/API.md)

---

## Operational notes

- Money is computed in **integer paise** in `@ps/shared`; never use floating point for billing.
- Stock movements, payments, ledgers and audit entries are **append-only** at the database level. Corrections are reversals, not edits.
- Invoice creation is **idempotent**: send `Idempotency-Key` (or `clientRef`) to make retries safe.
- GST is configured **on each product**, never store-wide. Inclusive prices are back-calculated; exclusive prices get tax added.
- Document numbers (`INV/2026-27/00001`) come from a row-locked sequence per store, document type and financial year.
- Every protected API route checks a permission; UI hiding is a convenience, not the security boundary.
- Back up PostgreSQL and the uploads directory together so product images match the database.

This is proprietary business software. Treat the `.env` file, database dumps and uploads as confidential.
