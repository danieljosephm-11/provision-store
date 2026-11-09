# Deploy on Render (recommended) or Vercel + Render

`render.yaml` deploys the whole application to Render as three resources:

```
Browser ──▶ Render static site (React build, HTTPS, global CDN)
                  │  HTTPS + CORS
                  ▼
            Render web service (Express API)
                  │
                  ▼
            Render PostgreSQL
```

The web app can also run on Vercel instead of Render; the API and database stay
on Render either way. Both options are covered below.

The API runs as a single instance. The rate limiter and refresh-token rotation
assume one node, so do not scale the Render service to multiple instances.

---

## Live demo

| Resource | URL |
| --- | --- |
| Web app (Render static site) | https://provision-store-web.onrender.com |
| API (Render web service) | https://provision-store-api.onrender.com |
| Health check | https://provision-store-api.onrender.com/api/v1/health |
| Database | Render PostgreSQL 18, Singapore, free plan |

The administrator password is set once as `SEED_ADMIN_PASSWORD` and is not
stored in the repository. The demo data is loaded through the public API by
`scripts/demo-data.mjs`; see section 4.

> **Free-plan caveats:** the API spins down after inactivity and the first
> request can take 30–60 seconds. The free PostgreSQL database expires on
> 9 December 2026 and is deleted unless the plan is upgraded. Product images
> are written to the API container filesystem and are lost on redeploy.

---

## 1. Before you start

1. Push the repository to GitHub (`main` branch).
2. Create a strong administrator password. Generate one with:

   ```bash
   node -e "console.log('Ps-' + require('crypto').randomBytes(15).toString('base64url'))"
   ```

   Keep it in a password manager. It is only used the first time the database
   is seeded; it is never committed to the repository.
3. Sign in to [Render](https://render.com) with GitHub. Free plans are enough
   for a demo.

---

## 2. Deploy the API, database and web app on Render

Open the one-click blueprint link for your repository:

```
https://render.com/deploy?repo=https://github.com/danieljosephm-11/provision-store
```

If the link opens a different repository, replace the `repo=` value with your
own GitHub URL.

Render reads `render.yaml` and creates:

| Resource | Type | Plan | Region |
| --- | --- | --- | --- |
| `provision-store-db` | PostgreSQL 18 | Free | Singapore |
| `provision-store-api` | Node web service | Free | Singapore |
| `provision-store-web` | Static site | Free | Global CDN |

During blueprint creation Render prompts for the variables marked
`sync: false`:

- `SEED_ADMIN_PASSWORD` — paste the strong password from section 1.

Approve the blueprint and wait for the first deploy. The API start command runs
`prisma migrate deploy`, seeds configuration only when the database is empty,
then starts the API. The static site runs `npm ci && npm run build -w @ps/web`
and publishes `apps/web/dist`.

The static site is built with:

```
VITE_API_URL=https://provision-store-api.onrender.com/api/v1
```

`VITE_*` values are compiled into the bundle, so changing the API URL requires
a redeploy, not just a restart.

When the first deploy finishes, copy the two service URLs. They normally match
the names in `render.yaml`:

```
https://provision-store-api.onrender.com
https://provision-store-web.onrender.com
```

Verify the API:

```
https://provision-store-api.onrender.com/api/v1/health
```

Expect `{"status":"ok",...}`. A cold start may take 30–60 seconds.

### Checklist for the Render deploy

- [ ] `GET /api/v1/health` returns `status: ok`.
- [ ] `GET /` on the API redirects to the static site URL.
- [ ] The static site shows the login page, and a refresh on a deep link works
      (SPA rewrite `/*` → `/index.html`).
- [ ] Sign in with `admin@provisionstore.local` and the password from section 1.

### Customising the URLs

`render.yaml` already points `APP_URL` and `CORS_ORIGINS` at
`https://provision-store-web.onrender.com`. If your static site gets a different
name, update both variables on the API service in the Render dashboard:

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Where browser visits to the API root are redirected |
| `CORS_ORIGINS` | Comma-separated allow-list for credentialed requests |

Use the exact origin (scheme + host, no trailing slash). Save; Render redeploys
automatically.

Authentication in this topology is same-site only in the sense that both hosts
share `onrender.com`. The blueprint still sets the cross-site cookie options so
the same API works from a Vercel origin:

```
COOKIE_SECURE=true
COOKIE_SAME_SITE=none
```

Access tokens are sent as `Authorization: Bearer` headers. The refresh token is
an `HttpOnly` cookie scoped to `/api/v1/auth`.

> Static sites do not accept a `plan` field in `render.yaml`; they are always
> free. Adding `plan: free` makes the blueprint fail with
> `no such plan free for service type web`.

---

## 3. Alternate: deploy the web app on Vercel

Keep the Render API and database from section 2 and host only the React build on
Vercel.

1. Open [vercel.com/new](https://vercel.com/new) and import the same GitHub
   repository.
2. Leave **Root Directory** empty. `vercel.json` sets the framework, install
   command, build command (`@ps/web`) and output directory (`apps/web/dist`).
3. Add one environment variable for the **Production** environment:

   | Name | Value |
   | --- | --- |
   | `VITE_API_URL` | `https://provision-store-api.onrender.com/api/v1` |

4. Deploy. Copy the production URL, for example
   `https://provision-store.vercel.app`.

Then update the API environment in the Render dashboard:

| Name | Value |
| --- | --- |
| `APP_URL` | `https://provision-store.vercel.app` |
| `CORS_ORIGINS` | `https://provision-store.vercel.app` |

Re-check:

```bash
curl -i https://provision-store-api.onrender.com/api/v1/health
curl -i https://provision-store-api.onrender.com/        # 302 to the web app
```

The Render static site can stay deployed beside it; only `APP_URL` and
`CORS_ORIGINS` decide which origin the API trusts and redirects to.

### Same-origin proxy on Vercel (optional)

This keeps cookies first-party and avoids third-party-cookie blocking. It
requires the Render API URL to be known before you deploy the web app.

In `vercel.json`, add rewrites **above** the SPA rewrite:

```json
{
  "source": "/api/(.*)",
  "destination": "https://provision-store-api.onrender.com/api/$1"
},
{
  "source": "/uploads/(.*)",
  "destination": "https://provision-store-api.onrender.com/uploads/$1"
}
```

Then:

1. Remove `VITE_API_URL` from Vercel, or set it to `/api/v1`.
2. Set on Render:
   - `COOKIE_SECURE=true`
   - `COOKIE_SAME_SITE=lax`
   - `APP_URL=https://provision-store.vercel.app`
   - `CORS_ORIGINS=https://provision-store.vercel.app`
3. Redeploy both services.

In this mode the browser only talks to the Vercel domain. The Render API must
still allow the Vercel origin for direct calls.

---

## 4. Load the demo data (optional, once)

The live database is seeded with configuration only — no fake business data.
To create the CRM demo through the public API:

```powershell
$env:Path = "D:\opencode\tools\node;" + $env:Path
$env:API_URL = "https://provision-store-api.onrender.com/api/v1"
$env:DEMO_WEB_URL = "https://provision-store-web.onrender.com"
$env:DEMO_EMAIL = "admin@provisionstore.local"
$env:DEMO_PASSWORD = "<the strong password from section 1>"
$env:DEMO_BACKDATE = "true"
$env:DATABASE_URL = "<Render external database URL>"
node scripts/demo-data.mjs
```

`DATABASE_URL` is only needed for `DEMO_BACKDATE=true`, which spreads invoices,
payments and activities over seven months. Copy the **External Database URL**
from the Render database page.

The script is idempotent: re-running it only fills in missing records and
reopens the seeded follow-ups. It uses the API for every business record and
suspends the append-only ledger triggers only for the backdating transaction.

> If you prefer a clean business database, skip this step. The app starts with
> no customers, products or invoices and every figure is then real.

---

## 5. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `503` from `/api/v1/health` | Database unreachable, migrations failed | Open Render logs; check `DATABASE_URL`; re-run the deploy |
| `502` on first request | Free instance cold start | Wait 60 seconds and retry |
| Login returns `401` for the right password | Seed did not run, or password changed | Check Render logs for the admin seed; reset via the Admin UI if you can still sign in |
| Login works, refresh logs you out | Cookie dropped cross-site | Use `COOKIE_SAME_SITE=none` + HTTPS, or switch to proxy mode |
| CORS error in the console | Origin not allow-listed | Set `CORS_ORIGINS` to the exact web origin |
| Blank page on refresh | SPA rewrite missing | Confirm the static site has `/*` → `/index.html` |
| Product image 404 | Uploads are ephemeral on Render | Re-upload after a redeploy, or move to object storage |
| `pg_trgm` extension error during migrate | Database user cannot create extensions | Use the blueprint database (owner role) or create the extension once as an admin |
| `no such plan free for service type web` | Static site has `plan:` in `render.yaml` | Remove `plan` from the static site service |

---

## Rotating the administrator password later

1. Sign in as the administrator.
2. Open **Settings → Users**, edit the administrator and set a new password.
3. Update your password manager and `DEMO_PASSWORD` for the demo-data script.

The seeded `SEED_ADMIN_PASSWORD` is only read when the database is empty. It
does not overwrite an existing password on later deploys.
