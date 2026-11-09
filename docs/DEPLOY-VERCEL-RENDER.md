# Deploy: Vercel web + Render API and PostgreSQL

This is the split deployment used for the live demo:

```
Browser ──▶ Vercel (static React app, HTTPS)
                  │  HTTPS + CORS
                  ▼
            Render web service (Express API)
                  │
                  ▼
            Render PostgreSQL
```

- **Web:** Vercel, built from `apps/web` (`vercel.json`).
- **API:** Render Node web service, built from the repository root (`render.yaml`).
- **Database:** Render PostgreSQL, created by the same blueprint.

The API runs as a single instance. The rate limiter and refresh-token rotation
assume one node; do not scale the Render service to multiple instances.

---

## 1. Before you start

1. Push the repository to GitHub (`main` branch).
2. Create a strong administrator password. Generate one with:

   ```bash
   node -e "console.log('Ps-' + require('crypto').randomBytes(15).toString('base64url'))"
   ```

   Keep it in a password manager. It is only used the first time the database
   is seeded; it is never committed to the repository.
3. Sign in to [Render](https://render.com) and [Vercel](https://vercel.com)
   with GitHub. Both free plans are enough for a demo.

---

## 2. Deploy the API and database on Render

Open the one-click blueprint link for your repository:

```
https://render.com/deploy?repo=https://github.com/danieljosephm-11/provision-store
```

If the link opens a different repository, replace the `repo=` value with your
own GitHub URL.

Render reads `render.yaml` and creates:

| Resource | Plan | Region |
| --- | --- | --- |
| `provision-store-db` PostgreSQL | Free | Singapore |
| `provision-store-api` Node web service | Free | Singapore |

During blueprint creation Render prompts for the variables marked
`sync: false`:

- `SEED_ADMIN_PASSWORD` — paste the strong password from step 1.

Approve the blueprint and wait for the first deploy. The start command runs
`prisma migrate deploy`, seeds configuration only when the database is empty,
then starts the API.

Copy the API URL shown at the top of the service, for example:

```
https://provision-store-api.onrender.com
```

Verify it before touching Vercel:

```
https://provision-store-api.onrender.com/api/v1/health
```

Expect `{"status":"ok",...}`. The first request after idle can take 30–60
seconds on the free plan; the health check warms it back up.

> **Free plan caveats:** the web service spins down when idle and the free
> PostgreSQL database expires after 30 days. Product images are written to the
> container filesystem and are lost on redeploy or spin-down. For a long-lived
> deployment use a paid instance or an object store for uploads.

---

## 3. Deploy the web app on Vercel

1. Open [vercel.com/new](https://vercel.com/new) and import the same GitHub
   repository.
2. Leave **Root Directory** empty. `vercel.json` already sets the framework,
   install command, build command (`@ps/web`) and output directory
   (`apps/web/dist`).
3. Add one environment variable for the **Production** environment:

   | Name | Value |
   | --- | --- |
   | `VITE_API_URL` | `https://provision-store-api.onrender.com/api/v1` |

   Use the API URL from step 2, including `/api/v1`.
4. Deploy. Copy the production URL, for example
   `https://provision-store.vercel.app`.

`VITE_*` values are compiled into the bundle, so changing `VITE_API_URL` later
requires a **Redeploy**, not just a restart.

### How authentication works in this mode

The web app and API are on different registrable domains, so the refresh cookie
must be `SameSite=None; Secure`. `render.yaml` sets:

```
COOKIE_SECURE=true
COOKIE_SAME_SITE=none
```

Access tokens are sent as `Authorization: Bearer` headers. The refresh token is
an `HttpOnly` cookie scoped to `/api/v1/auth`.

If the browser blocks cross-site cookies (Safari ITP, or a strict privacy
extension), use the same-origin proxy mode below instead.

---

## 4. Let the API trust the Vercel origin

In the Render dashboard open **provision-store-api → Environment** and add:

| Name | Value |
| --- | --- |
| `APP_URL` | `https://provision-store.vercel.app` |
| `CORS_ORIGINS` | `https://provision-store.vercel.app` |

Use the exact Vercel production URL. Save; Render redeploys automatically.

- `APP_URL` is where browser visits to the API root are redirected.
- `CORS_ORIGINS` is the comma-separated allow-list for credentialed requests.
  Add preview URLs only if you need them.

Re-check:

```bash
curl -i https://provision-store-api.onrender.com/api/v1/health
curl -i https://provision-store-api.onrender.com/        # 302 to the Vercel URL
```

---

## 5. Load the demo data (optional, once)

The live database is seeded with configuration only — no fake business data.
To create the CRM demo through the public API:

```powershell
$env:Path = "D:\opencode\tools\node;" + $env:Path
$env:API_URL = "https://provision-store-api.onrender.com/api/v1"
$env:DEMO_EMAIL = "admin@provisionstore.local"
$env:DEMO_PASSWORD = "<the strong password from step 1>"
$env:DEMO_BACKDATE = "true"
node scripts/demo-data.mjs
```

`DEMO_BACKDATE=true` uses a direct database connection to spread history over
seven months. On Render, copy the **External Database URL** from the database
page and set it first:

```powershell
$env:DATABASE_URL = "<Render external database URL>"
```

The script is idempotent: re-running it only fills in missing records and
reopens the seeded follow-ups.

> If you prefer a clean business database, skip this step. The app starts with
> no customers, products or invoices and every figure is then real.

---

## 6. Post-deploy checklist

- [ ] `GET /api/v1/health` returns `status: ok`.
- [ ] `GET /` on the API redirects to the Vercel URL.
- [ ] The Vercel URL shows the login page (no blank screen, no 404 on refresh).
- [ ] Sign in with `admin@provisionstore.local` and the strong password.
- [ ] Reload the page while signed in; the session survives (refresh cookie).
- [ ] Open **CRM → Customers**; the list loads.
- [ ] Create a customer, add a follow-up, and see it in the timeline.
- [ ] Export customers as CSV and download an invoice PDF.
- [ ] Upload a product image and confirm it renders. (Lost on Render redeploy.)
- [ ] Sign out; the refresh cookie is cleared and the login page returns.

If sign-in succeeds but the page immediately returns to login, the refresh
cookie is being dropped. Check that:

1. `VITE_API_URL` points at the Render API and ends in `/api/v1`.
2. Render has `COOKIE_SECURE=true` and `COOKIE_SAME_SITE=none`.
3. `CORS_ORIGINS` exactly matches the Vercel origin (scheme, host, no slash).
4. The browser is not blocking third-party cookies. If it is, use proxy mode.

---

## Alternate mode: same-origin proxy on Vercel

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
still allow the Vercel origin for any direct calls.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `503` from `/api/v1/health` | Database unreachable, migrations failed | Open Render logs; check `DATABASE_URL`; re-run the deploy |
| `502` on first request | Free instance cold start | Wait 60 seconds and retry |
| Login returns `401` for the right password | Seed did not run, or password changed | Check Render logs for `✓ admin`; reset the password via the Admin UI if you can still sign in |
| Login works, refresh logs you out | Cookie dropped cross-site | Use `COOKIE_SAME_SITE=none` + HTTPS, or switch to proxy mode |
| CORS error in the console | Origin not allow-listed | Set `CORS_ORIGINS` to the exact Vercel URL |
| Blank page on refresh | SPA rewrite missing | Confirm `vercel.json` is at the repository root and redeploy |
| Product image 404 | Uploads are ephemeral on Render | Re-upload after a redeploy, or move to object storage |
| `pg_trgm` extension error during migrate | Database user cannot create extensions | Use the blueprint database (owner role) or create the extension once as an admin |

---

## Rotating the administrator password later

1. Sign in as the administrator.
2. Open **Settings → Users**, edit the administrator and set a new password.
3. Update your password manager and `DEMO_PASSWORD` for the demo-data script.

The seeded `SEED_ADMIN_PASSWORD` is only read when the database is empty. It
does not overwrite an existing password on later deploys.
