# Deployment Guide

Production deployment of the Smart Provision Store. The reference topology is a single Linux host running:

```
Internet ──▶ Nginx (TLS, static web app, reverse proxy)
                ├─ /            apps/web/dist        (SPA)
                ├─ /api/       127.0.0.1:4000        (Express API)
                └─ /uploads/   127.0.0.1:4000        (product images)
                                   │
                                   └─ PostgreSQL 16 (localhost)
```

One API instance is the supported topology. The in-process rate limiter and refresh-token rotation assume a single node; adding a second instance requires a shared rate-limit store and a shared session/refresh strategy first.

---

## 1. Prepare the server

- Ubuntu 22.04/24.04 LTS (or equivalent), 2 vCPU, 2 GB RAM minimum, 4 GB recommended.
- Node.js 22 LTS installed system-wide.
- PostgreSQL 16 installed locally (or a managed instance reachable over TLS).
- Nginx installed.
- A DNS record pointing at the server.
- A TLS certificate (Let's Encrypt is fine).

Create a service user:

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin provision
sudo mkdir -p /opt/provision-store
sudo chown provision:provision /opt/provision-store
```

---

## 2. Get the code and install

```bash
sudo -u provision -H bash
cd /opt/provision-store
git clone <your-repository-url> .
npm ci
```

`npm ci` installs exactly the locked dependency tree. Use it for every deploy; do not use `npm install` on a production host.

---

## 3. Configure the API environment

```bash
cp .env.example apps/api/.env
chmod 600 apps/api/.env
```

Set at minimum:

```dotenv
NODE_ENV=production
PORT=4000
APP_URL=https://store.example.com
API_URL=https://store.example.com
CORS_ORIGINS=https://store.example.com

DATABASE_URL=postgresql://provision_app:STRONG_PASSWORD@127.0.0.1:5432/provision_store?schema=public

JWT_ACCESS_SECRET=<48-byte random string>
JWT_REFRESH_SECRET=<different 48-byte random string>
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL_DAYS=30
BCRYPT_ROUNDS=12
COOKIE_SECURE=true

UPLOAD_DIR=/var/lib/provision-store/uploads
MAX_UPLOAD_MB=5
ENABLE_CRON=true
```

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Create the upload directory:

```bash
sudo install -d -o provision -g provision -m 750 /var/lib/provision-store/uploads
```

Notes:

- `COOKIE_SECURE=false` breaks login behind HTTPS because the browser refuses to store the secure refresh cookie over plain HTTP; set it to `true`.
- The refresh cookie is `httpOnly`, `SameSite=Lax`, path `/api/v1/auth`. Serve the web app and API from the **same site** so the cookie is first-party.
- Do not commit `apps/api/.env`.

---

## 4. Create the database

```sql
CREATE ROLE provision_app LOGIN PASSWORD 'STRONG_PASSWORD';
CREATE DATABASE provision_store OWNER provision_app;

\c provision_store
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

Tune PostgreSQL for a small store server:

```
shared_buffers = 512MB
work_mem = 16MB
maintenance_work_mem = 128MB
effective_cache_size = 1GB
max_connections = 50
```

Keep `max_connections` above the API pool size plus administrative sessions.

---

## 5. Apply migrations and seed (first deploy only)

```bash
npm run db:generate
npm run db:deploy -w @ps/api
npm run db:seed
```

On subsequent deploys, run `db:generate` and `db:deploy` again but **do not reseed**.

Immediately sign in and change the seeded administrator password. Then remove `SEED_ADMIN_PASSWORD` from the environment or replace it with a value nobody uses.

---

## 6. Build

```bash
npm run typecheck
npm test
npm run build
```

Artifacts:

- `apps/api/dist/server.js` — bundled API
- `apps/web/dist/` — static SPA

Build on the server or in CI. If you build in CI, ship both `dist` directories and the Prisma migrations; do not ship `node_modules` from a different platform.

---

## 7. Run the API with systemd

`/etc/systemd/system/provision-api.service`:

```ini
[Unit]
Description=Provision Store API
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=provision
Group=provision
WorkingDirectory=/opt/provision-store/apps/api
EnvironmentFile=/opt/provision-store/apps/api/.env
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/provision-store
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now provision-api
sudo systemctl status provision-api
curl -fsS http://127.0.0.1:4000/api/v1/health
```

Working directory matters: `UPLOAD_DIR` is resolved relative to it unless absolute, and Prisma loads `.env` from it.

### PM2 alternative

```bash
cd /opt/provision-store
pm2 start apps/api/dist/server.js --name provision-api --cwd apps/api
pm2 save
pm2 startup
```

Configure PM2 log rotation (`pm2 install pm2-logrotate`) and set `max_size` to 20 MB with 14 retained files.

---

## 8. Nginx

`/etc/nginx/sites-available/provision-store`:

```nginx
server {
    listen 80;
    server_name store.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name store.example.com;

    ssl_certificate     /etc/letsencrypt/live/store.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/store.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    root /opt/provision-store/apps/web/dist;
    index index.html;

    client_max_body_size 10m;
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;

    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    # Hashed build assets can be cached for a year.
    location /assets/ {
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA history fallback.
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache";
    }

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        expires 7d;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/provision-store /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Then obtain the certificate:

```bash
sudo certbot --nginx -d store.example.com
```

---

## 9. Verify the deployment

```bash
curl -fsS https://store.example.com/api/v1/health
```

Expected:

```json
{ "status": "ok", "uptime": 12.3, "timestamp": "..." }
```

Then, from your workstation:

1. Sign in with the administrator.
2. Change the password.
3. Open Settings and confirm GSTIN, state and invoice prefix.
4. Create a product, purchase stock, bill it, print the invoice, then void it.
5. Export one Excel report and one PDF report.
6. Check `journalctl -u provision-api -n 100 --no-pager` for errors.
7. Confirm no request is served over HTTP (the port-80 server only redirects).

---

## 10. Updating a deployment

```bash
sudo -u provision -H bash
cd /opt/provision-store
git fetch --all
git checkout <release-tag>
npm ci
npm run db:generate
npm run db:deploy -w @ps/api     # migrations are forward-only; back up first
npm run build
exit
sudo systemctl restart provision-api
```

Always take a database backup before applying migrations. See [BACKUP-RESTORE.md](BACKUP-RESTORE.md).

Rollback:

1. Stop the API.
2. Check out the previous release.
3. Restore the pre-migration database backup **if the new release changed the schema**.
4. `npm ci`, `npm run db:generate`, `npm run build`.
5. Start the API.

Migrations are not automatically reversible. Restoring the matching backup is the safe rollback path.

---

## 11. Security checklist

- [ ] `NODE_ENV=production`, `COOKIE_SECURE=true`
- [ ] Two independent 48-byte JWT secrets, stored only in `apps/api/.env` with mode `600`
- [ ] Seeded administrator password changed; default credentials no longer valid
- [ ] Database role is not a superuser and owns only `provision_store`
- [ ] PostgreSQL listens on `127.0.0.1` only, or firewalled to the app host
- [ ] TLS enforced; HSTS enabled once HTTPS is confirmed working
- [ ] `CORS_ORIGINS` lists only the production origin
- [ ] Firewall exposes only 22, 80 and 443
- [ ] Automated daily backups configured and **restore-tested**
- [ ] `uploads` directory backed up with the database
- [ ] Logs retained and reviewed; no secrets in logs
- [ ] OS and dependency security updates applied monthly
- [ ] Unused employees deactivated; roles reviewed quarterly
- [ ] Owner account is not used as the day-to-day cashier account

---

## 12. Logging and monitoring

- The API logs structured JSON through Pino. Under systemd: `journalctl -u provision-api -f`.
- Every response carries a request ID; error bodies include it. Ask the user for that ID when investigating.
- Monitor `GET /api/v1/health` every minute. Alert after three consecutive failures.
- Alert on disk usage above 80%: PostgreSQL, uploads and logs all grow.
- Watch PostgreSQL slow queries (`log_min_duration_statement = 500`) for the first week, then tune indexes if needed.

---

## 13. Windows Server alternative

The stack runs on Windows, but Linux is recommended. If Windows is required:

- Run the API as a service with [NSSM](https://nssm.cc/) or Task Scheduler:
  - Application: `C:\Program Files\nodejs\node.exe`
  - Arguments: `dist\server.js`
  - Startup directory: `C:\provision-store\apps\api`
- Serve `apps\web\dist` with IIS and enable the URL Rewrite module with an SPA fallback to `index.html`.
- Reverse-proxy `/api` and `/uploads` to `http://127.0.0.1:4000` using ARR.
- Set `UPLOAD_DIR` to an absolute path, for example `D:\provision-store-data\uploads`.
- Use `pg_dump.exe` from the PostgreSQL `bin` directory for backups and schedule it with Task Scheduler.

---

## 14. Scaling notes

Before running multiple API instances:

- Move rate limiting to a shared store (Redis).
- Decide how refresh-token rotation is coordinated across instances.
- Serve uploads from object storage or a shared volume.
- Put a load balancer in front and keep sticky sessions unnecessary by using the shared store.

For a single provision store, one API instance handles the workload comfortably.

---

## 15. Backup, restore and disaster recovery

See [BACKUP-RESTORE.md](BACKUP-RESTORE.md). At minimum:

- nightly `pg_dump` in custom format
- nightly copy of the uploads directory
- encrypted off-site copy
- monthly restore rehearsal into a scratch database
