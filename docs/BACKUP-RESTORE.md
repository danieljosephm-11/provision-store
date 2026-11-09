# Backup and Restore

The database is the source of truth for money, stock and audit history. Product images are stored on disk. **Back up both, or a restore will be incomplete.**

This guide uses PostgreSQL's custom archive format (`pg_dump -Fc`), which is compressed, supports selective restore and works with `pg_restore`.

---

## 1. What must be backed up

| Item | Location | Why |
| --- | --- | --- |
| PostgreSQL database | `provision_store` | Invoices, stock, ledgers, users, audit log |
| Uploads | `UPLOAD_DIR` (default `apps/api/uploads`; production example `/var/lib/provision-store/uploads`) | Product images referenced by URL |
| Environment file | `apps/api/.env` | Secrets needed to run the restored system |
| Application version | git tag/commit | Schema and code must match the dump |
| Nginx/systemd config | `/etc/nginx`, `/etc/systemd/system` | Faster disaster recovery |

Do **not** store backups only on the same disk as the database. Follow the 3-2-1 rule: three copies, two media types, one off-site.

---

## 2. Manual backup

### Linux

```bash
set -euo pipefail

STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR=/var/backups/provision-store
mkdir -p "$BACKUP_DIR"

# Database (custom format, compressed)
pg_dump -Fc --no-owner --no-privileges \
  "postgresql://provision_app:PASSWORD@127.0.0.1:5432/provision_store" \
  -f "$BACKUP_DIR/provision_store-$STAMP.dump"

# Uploads
tar -C /var/lib/provision-store -czf "$BACKUP_DIR/uploads-$STAMP.tar.gz" uploads

# Checksums
sha256sum "$BACKUP_DIR/provision_store-$STAMP.dump" \
          "$BACKUP_DIR/uploads-$STAMP.tar.gz" \
          > "$BACKUP_DIR/$STAMP.sha256"
```

### Windows (PowerShell)

```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = "D:\backups\provision-store"
New-Item -ItemType Directory -Force -Path $backup | Out-Null

& "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe" `
  -Fc --no-owner --no-privileges `
  -f "$backup\provision_store-$stamp.dump" `
  "postgresql://provision_app:PASSWORD@127.0.0.1:5432/provision_store"

Compress-Archive -Path "D:\provision-store-data\uploads" `
  -DestinationPath "$backup\uploads-$stamp.zip" -Force
```

Use the `pg_dump` version that matches (or is newer than) the server. PostgreSQL 16 tooling is correct for this application.

### Verify the dump immediately

```bash
pg_restore --list /var/backups/provision-store/provision_store-20261108-020000.dump | head
```

A dump that cannot be listed is not a backup. Also compare the dump size with previous nights; a sudden drop usually means a failed or partial dump.

---

## 3. Automated nightly backup

`/usr/local/bin/provision-backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR=/var/backups/provision-store
DB_URL=$(grep '^DATABASE_URL=' /opt/provision-store/apps/api/.env | cut -d= -f2-)
UPLOAD_DIR=$(grep '^UPLOAD_DIR=' /opt/provision-store/apps/api/.env | cut -d= -f2-)
UPLOAD_DIR=${UPLOAD_DIR:-/opt/provision-store/apps/api/uploads}

mkdir -p "$BACKUP_DIR"

pg_dump -Fc --no-owner --no-privileges "$DB_URL" \
  -f "$BACKUP_DIR/provision_store-$STAMP.dump"

tar -C "$(dirname "$UPLOAD_DIR")" -czf "$BACKUP_DIR/uploads-$STAMP.tar.gz" \
  "$(basename "$UPLOAD_DIR")"

sha256sum "$BACKUP_DIR/provision_store-$STAMP.dump" \
          "$BACKUP_DIR/uploads-$STAMP.tar.gz" \
          > "$BACKUP_DIR/$STAMP.sha256"

# Keep 30 daily backups.
find "$BACKUP_DIR" -type f -mtime +30 -delete

# Copy off-site (example: restic repository on object storage).
# restic backup "$BACKUP_DIR"
```

```bash
sudo chmod 750 /usr/local/bin/provision-backup.sh
sudo chown provision:provision /usr/local/bin/provision-backup.sh
```

Crontab for the `provision` user:

```cron
15 2 * * * /usr/local/bin/provision-backup.sh >> /var/log/provision-backup.log 2>&1
```

On Windows, create a Task Scheduler job running the PowerShell script daily, with "Run whether user is logged on or not".

### Encryption

Backups contain customer data and financial history. Encrypt before sending off-site:

```bash
age -r age1YOURPUBLICKEY -o "$BACKUP_DIR/$STAMP.tar.gz.age" "$BACKUP_DIR/$STAMP.tar.gz"
```

Store the private key separately from the backups. Losing it means losing the backups.

---

## 4. Retention policy

A practical policy for a retail store:

| Copy | Frequency | Retention |
| --- | --- | --- |
| Local disk | Nightly | 30 days |
| Off-site object storage | Nightly | 90 days |
| Monthly archive | First of month | 12 months |
| Before every deployment/migration | On demand | Until the next successful deploy + 30 days |

Tax and audit requirements may demand longer retention. Confirm with your accountant.

---

## 5. Restore — full disaster recovery

Use this when the server or database is lost.

### Step 1 — Stop the API

```bash
sudo systemctl stop provision-api
```

### Step 2 — Preserve the current state

If the database still exists, take a safety dump first:

```bash
pg_dump -Fc "$DATABASE_URL" -f /var/backups/provision-store/pre-restore-$(date +%Y%m%d-%H%M%S).dump
```

### Step 3 — Create an empty database

```bash
sudo -u postgres psql
```

```sql
DROP DATABASE IF EXISTS provision_store;
CREATE DATABASE provision_store OWNER provision_app;
\c provision_store
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

Never restore into a database that still has the old tables; `pg_restore` will collide with existing objects.

### Step 4 — Restore the dump

```bash
pg_restore \
  --no-owner --no-privileges \
  --exit-on-error \
  -d "postgresql://provision_app:PASSWORD@127.0.0.1:5432/provision_store" \
  /var/backups/provision-store/provision_store-20261108-020000.dump
```

`--exit-on-error` is deliberate: a partially restored financial database is worse than a failed restore. Read and fix the error, then start again from an empty database.

### Step 5 — Restore uploads

```bash
sudo tar -C /var/lib/provision-store -xzf /var/backups/provision-store/uploads-20261108-020000.tar.gz
sudo chown -R provision:provision /var/lib/provision-store/uploads
```

### Step 6 — Confirm schema version

```bash
cd /opt/provision-store
npm run db:deploy -w @ps/api
```

This should report no pending migrations. If it applies migrations, the dump was taken before a deploy — acceptable, but review the migration output.

### Step 7 — Start and verify

```bash
sudo systemctl start provision-api
curl -fsS http://127.0.0.1:4000/api/v1/health
```

Then in the UI:

1. Sign in as the administrator.
2. Open **Invoices** and confirm the latest invoice number matches expectations.
3. Open **Inventory** and spot-check two products with known quantities.
4. Open **Reports → Sales summary** for the last full month and compare with the closing report.
5. Open a product image and confirm it loads.
6. Open **Audit log** and confirm recent entries are present.

If any check fails, stop and restore again from a known-good dump.

---

## 6. Restore a single table or explore a dump

Restoring the whole database is not always necessary. To recover a table into a scratch database:

```bash
createdb provision_scratch
pg_restore -d provision_scratch --no-owner \
  -t '"Customer"' \
  /var/backups/provision-store/provision_store-20261108-020000.dump
```

Because identifiers are case-sensitive (Prisma uses PascalCase table names without `@@map`), quote them exactly.

To inspect data without restoring:

```bash
pg_restore -l dumpfile > restore.list
pg_restore -f - dumpfile | less
```

For SQL-formatted dumps, use `psql` instead. This project uses custom format.

---

## 7. Point-in-time recovery (optional)

For a larger store, enable WAL archiving and take periodic base backups with `pg_basebackup`. That allows recovery to a specific timestamp, for example just before an accidental expense reversal.

Minimum `postgresql.conf` changes:

```
wal_level = replica
archive_mode = on
archive_command = 'test ! -f /var/lib/postgresql/wal-archive/%f && cp %p /var/lib/postgresql/wal-archive/%f'
archive_timeout = 300
```

Test PITR on a scratch host before relying on it. Logical `pg_dump` backups remain the simplest and most portable option for this application.

---

## 8. Off-site and ransomware protection

- Push backups to storage the application server cannot delete (append-only bucket, object lock, or a pull-based backup server).
- Keep at least one offline copy.
- Encrypt backups; restrict who can read the private key.
- Test that the off-site copy restores, not just the local one.
- Rotate database and JWT secrets only with a planned procedure; changing JWT secrets signs everyone out but does not affect stored data.

---

## 9. Restore rehearsal checklist

Run this monthly, and always before a major upgrade:

- [ ] Copy the latest dump to a non-production host or scratch database.
- [ ] Create an empty database and restore with `--exit-on-error`.
- [ ] Restore uploads into a scratch directory.
- [ ] Run `npm run db:deploy -w @ps/api` and confirm no pending migrations.
- [ ] Start an API instance against the scratch database on a different port.
- [ ] Sign in, open the dashboard, one invoice, one product image and one report.
- [ ] Compare invoice counts and revenue totals with the production month-end report.
- [ ] Record the restore time. If it exceeds your recovery target, adjust the plan.
- [ ] Delete the scratch database and scratch uploads after the rehearsal.

A backup that has never been restored is an assumption, not a recovery plan.
