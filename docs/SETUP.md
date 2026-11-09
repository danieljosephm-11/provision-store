# Setup Guide

This guide takes a clean machine to a running development installation. For production, continue with [DEPLOYMENT.md](DEPLOYMENT.md).

---

## 1. Prerequisites

| Requirement | Notes |
| --- | --- |
| Node.js 22.9+ | `node --version` must print v22.9.0 or newer. Node 20 is not supported by the target runtime declared in `package.json`. |
| npm 10+ | Ships with Node 22. |
| PostgreSQL 16+ | Local or remote. The `pg_trgm` extension is required. |
| Build tools | Only needed if a native dependency has no prebuilt binary. On Windows, install the Visual Studio Build Tools if `npm install` asks for them. |

Verify:

```bash
node --version
npm --version
psql --version
```

---

## 2. Create the databases

Connect as a PostgreSQL superuser (or a role with `CREATEDB`):

```sql
CREATE DATABASE provision_store;
CREATE DATABASE provision_store_test;

\c provision_store
CREATE EXTENSION IF NOT EXISTS pg_trgm;

\c provision_store_test
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

The hardening migration also runs `CREATE EXTENSION IF NOT EXISTS pg_trgm`, but doing it up front makes failures obvious and avoids permission surprises on managed databases.

Recommended for production:

```sql
CREATE ROLE provision_app LOGIN PASSWORD 'use-a-strong-password';
GRANT ALL PRIVILEGES ON DATABASE provision_store TO provision_app;
\c provision_store
GRANT ALL ON SCHEMA public TO provision_app;
```

Then use that role in `DATABASE_URL`. Do not run the application as the `postgres` superuser in production.

---

## 3. Configure environment

```bash
cp .env.example apps/api/.env
```

The API, Prisma CLI and seed script load `.env` from `apps/api`, because npm workspace scripts run with that working directory. Keep this file out of version control (it is already ignored).
Set `SEED_ADMIN_PASSWORD` in `apps/api/.env` to a unique, strong password before seeding; the seed has no default password.

| Variable | Required | Description |
| --- | --- | --- |
| `NODE_ENV` | yes | `development`, `test` or `production` |
| `PORT` | yes | API port, default `4000` |
| `APP_URL` | yes | Public URL of the web app (used in password-reset links) |
| `API_URL` | yes | Public URL of the API |
| `CORS_ORIGINS` | yes | Comma-separated allowed origins, e.g. `https://store.example.com` |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `TEST_DATABASE_URL` | no | Used by integration tests |
| `JWT_ACCESS_SECRET` | yes | Signing key for 15-minute access tokens |
| `JWT_REFRESH_SECRET` | yes | Signing key for refresh tokens |
| `ACCESS_TOKEN_TTL` | no | Default `15m` |
| `REFRESH_TOKEN_TTL_DAYS` | no | Default `30` |
| `BCRYPT_ROUNDS` | no | Default `12`; do not lower in production |
| `COOKIE_SECURE` | yes in prod | Must be `true` behind HTTPS |
| `SEED_ADMIN_*` | first boot | Administrator created by the seed; `SEED_ADMIN_PASSWORD` must be unique and strong |
| `SEED_STORE_*` | first boot | Initial store name, GSTIN and state code |
| `UPLOAD_DIR` | no | Upload directory, default `uploads` (relative to the API working directory) |
| `MAX_UPLOAD_MB` | no | Upload limit, default `5` |
| `ENABLE_CRON` | no | Enables scheduled maintenance jobs |

Generate strong secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Run it twice — one value for access tokens, another for refresh tokens. Never reuse the example values.

---

## 4. Install dependencies

```bash
npm install
```

The repository uses npm workspaces. `@ps/shared` is consumed directly from TypeScript source, so no separate build step is required.

---

## 5. Generate the client and migrate

```bash
npm run db:generate
npm run db:deploy -w @ps/api
```

- `db:generate` writes the Prisma client for the current schema.
- `db:deploy` applies the committed migrations without prompting. Use `npm run db:migrate` only while developing schema changes.

---

## 6. Seed configuration

```bash
npm run db:seed
```

The seed is idempotent and creates:

- the store record (name, GSTIN, state, invoice prefix, loyalty settings)
- 57 permissions across 17 modules
- 5 system roles: Admin, Manager, Cashier, Stock keeper, Accountant
- the administrator account from `.env`
- units, GST slabs, product categories, expense categories
- the default stock location
- the loyalty earning rule

It does **not** create products, customers, suppliers, sales or expenses. The application starts with an empty, honest ledger.

> Change the seeded administrator password after the first login, then update or remove `SEED_ADMIN_*` from the environment.

---

## 7. Start development

From the repository root:

```bash
npm run dev
```

This starts:

- API on <http://localhost:4000> with `tsx watch`
- Web on <http://localhost:5173> with Vite HMR

Vite proxies `/api` and `/uploads` to the API, so cookies stay first-party in development.

Open <http://localhost:5173> and sign in with the seeded administrator.

---

## 8. Verify the installation

```bash
npm run typecheck
npm test
npm run build

# keep the API running in another terminal
$env:SEED_ADMIN_PASSWORD = "<the password configured for the seeded administrator>"
node scripts/smoke.mjs
```

Expected results:

- Type-check passes for both workspaces.
- 15 billing-engine unit tests pass.
- API bundle and web assets build.
- Smoke test reports **43/43 passed**, including a genuine `401` for unauthenticated access.

For a full business-flow check, start a second API instance pointed at the **test** database (never production) and run the end-to-end script:

```powershell
cd apps/api
$env:PORT = "4001"
$env:NODE_ENV = "test"
$env:DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/provision_store_test?schema=public"
node dist/server.js   # leave running in its own terminal

# from the repository root
$env:API_URL = "http://localhost:4001/api/v1"
$env:SEED_ADMIN_PASSWORD = "<the password configured for the seeded administrator>"
node scripts/e2e.mjs
```

Expect **40/40 checks passed**. The script asserts stock levels and monetary totals after each step, so it needs a database it is allowed to write to freely; it derives unique SKUs and mobile numbers from a timestamp so repeated runs do not collide.

---

## 9. Recommended first-run checklist

1. Sign in and open **Settings**.
2. Confirm the legal name, GSTIN, state code and invoice prefix.
3. Set invoice terms and bill footer.
4. Decide whether negative stock is allowed (default: blocked).
5. Configure loyalty earning and point value, or disable it.
6. Create stock locations if you have more than one (shop floor, godown).
7. Create employees and assign roles. Do not share the administrator account.
8. Add suppliers and products, then record an opening purchase so stock is real.
9. Create customers only when needed; walk-in sales need no customer.
10. Record a test invoice, print it, and void it before going live.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Can't reach database server` | Confirm PostgreSQL is running and `DATABASE_URL` host/port are correct. |
| `extension "pg_trgm" is not available` | Install `postgresql-contrib` (Linux) or use the official PostgreSQL distribution, then run `CREATE EXTENSION pg_trgm` as a superuser. |
| `P1001` on Windows with a local server | Use `127.0.0.1` instead of `localhost` in `DATABASE_URL`; IPv6 resolution sometimes fails. |
| Login succeeds but the next request returns `401` | The refresh cookie is blocked. Check `CORS_ORIGINS`, `APP_URL`, `COOKIE_SECURE` and that you access the web app through the Vite proxy or the same site in production. |
| `429 Too Many Requests` while testing logins | Login rate limiting is intentional. Wait for the window to pass or restart the API in development. |
| Uploads return `404` | Start the API from `apps/api` (workspace scripts do this) so `UPLOAD_DIR` resolves to `apps/api/uploads`, or set an absolute path. |
| Prisma client out of date after `git pull` | Run `npm run db:generate` and `npm run db:deploy -w @ps/api`. |
| Port already in use | Change `PORT` in `.env` and update the Vite proxy in `apps/web/vite.config.ts`. |
| Excel import rejects a row | The import is all-or-nothing per row; the response lists the failing row and column. Fix the sheet and retry. |

---

## Appendix — this workstation

The project on this machine uses portable tools rather than a system installation:

| Tool | Path |
| --- | --- |
| Node 22 | `D:\opencode\tools\node` |
| PostgreSQL 16 | `D:\opencode\tools\pgsql` |
| PostgreSQL data | `D:\opencode\tools\pgdata` |
| Project | `D:\opencode\provision-store` |

`node`, `npm` and `git` are not on the global PATH. Prefix commands with:

```powershell
$env:Path = "D:\opencode\tools\node;" + $env:Path
```

Start PostgreSQL:

```powershell
& "D:\opencode\tools\pgsql\bin\postgres.exe" -D "D:\opencode\tools\pgdata" -p 5432
```

Connect with `psql` (`PGPASSWORD=postgres`), using the `postgres` role. The databases `provision_store` and `provision_store_test` are already created and `pg_trgm` is enabled.

Start only the API:

```powershell
cd D:\opencode\provision-store\apps\api
npx.cmd tsx src/server.ts
```
