---
name: backup-recovery
description: |
  Production backup strategy and disaster recovery planning for Linux servers,
  covering database backups, file backups, encryption, cloud storage, retention
  policies, and restore runbooks.

  USE WHEN:
  - Designing or implementing a backup strategy for a production server
  - Writing pg_dump / mongodump / mysqldump backup scripts
  - Configuring rclone to sync backups to S3, Backblaze B2, or SFTP
  - Encrypting backup archives with GPG before uploading offsite
  - Setting up retention schedules (daily/weekly/monthly rotation)
  - Writing or testing a disaster recovery runbook
  - Monitoring backup success/failure with healthchecks.io

  DO NOT USE FOR:
  - Kubernetes PersistentVolume snapshots (use cloud-provider CSI snapshot tools)
  - Application-level data export (e.g., Stripe data export, SaaS data portability)
  - Code repository backups (use git push to multiple remotes)
  - Windows Server backup (this skill covers Linux only)
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---

# Backup & Recovery — Production Strategy

## The 3-2-1 Rule

Every production backup strategy must satisfy:

- **3** copies of data (1 primary + 2 backups)
- **2** different storage media or locations (e.g., local disk + cloud)
- **1** offsite copy (different geographic region from primary)

| Backup Type | Description | Use Case |
|------------|-------------|----------|
| Full | Complete snapshot of all data | Weekly baseline, before major upgrades |
| Incremental | Changes since last backup (any type) | Daily; fast but requires chain for restore |
| Differential | Changes since last full backup | Balances restore speed vs. storage cost |

Recommended schedule: **Full weekly + Incremental daily** with 30-day retention.

---

## Database Backups

### PostgreSQL

```bash
# Plain SQL dump (human-readable, compatible with any Postgres version)
pg_dump -U postgres -d mydb > mydb_$(date +%Y%m%d_%H%M%S).sql

# Custom format (-Fc) — compressed, supports parallel restore, preferred for large DBs
pg_dump -U postgres -Fc -d mydb -f mydb_$(date +%Y%m%d_%H%M%S).dump

# Directory format (-Fd) — parallel dump, one file per table
pg_dump -U postgres -Fd -j 4 -d mydb -f mydb_$(date +%Y%m%d_%H%M%S).dir/

# Dump globals (roles, tablespaces) — run separately
pg_dumpall -U postgres --globals-only > globals_$(date +%Y%m%d).sql

# Dump all databases
pg_dumpall -U postgres > all_databases_$(date +%Y%m%d).sql
```

**PostgreSQL restore:**
```bash
# From plain SQL
psql -U postgres -d mydb < mydb_20241201_030000.sql

# From custom format (parallel restore with -j)
pg_restore -U postgres -d mydb -j 4 --clean --if-exists mydb_20241201_030000.dump

# Create DB first if it doesn't exist
createdb -U postgres mydb
pg_restore -U postgres -d mydb mydb_20241201_030000.dump

# Restore globals first
psql -U postgres < globals_20241201.sql
```

### MongoDB

```bash
# Full dump (BSON format)
mongodump --uri="mongodb://user:pass@localhost:27017/mydb" \
  --out=/var/backups/mongo/$(date +%Y%m%d_%H%M%S)/

# Compressed archive
mongodump --uri="mongodb://user:pass@localhost:27017/mydb" \
  --archive=/var/backups/mongo/mydb_$(date +%Y%m%d).gz \
  --gzip

# Restore
mongorestore --uri="mongodb://user:pass@localhost:27017/mydb" \
  --drop \
  --archive=/var/backups/mongo/mydb_20241201.gz \
  --gzip
```

### MySQL / MariaDB

```bash
# Single database
mysqldump -u root -p mydb \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  > mydb_$(date +%Y%m%d_%H%M%S).sql

# All databases
mysqldump -u root -p \
  --all-databases \
  --single-transaction \
  > all_databases_$(date +%Y%m%d).sql

# Restore
mysql -u root -p mydb < mydb_20241201_030000.sql
```

`--single-transaction` acquires a consistent snapshot for InnoDB without locking tables.

---

## File Backups with rsync

```bash
# Basic archive sync (preserves permissions, timestamps, symlinks)
rsync -av /var/www/html/ /mnt/backup/html/

# With deletion (mirror: remove files deleted from source)
rsync -av --delete /var/www/html/ /mnt/backup/html/

# Exclude paths
rsync -av --delete \
  --exclude='*.log' \
  --exclude='node_modules/' \
  --exclude='.cache/' \
  /var/www/ /mnt/backup/www/

# Incremental backup using --link-dest (hardlinks unchanged files — space efficient)
BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
LATEST=/mnt/backup/latest
rsync -av --delete \
  --link-dest="$LATEST" \
  /var/www/html/ \
  /mnt/backup/snapshots/$BACKUP_DATE/
# Update the "latest" symlink
ln -sfn /mnt/backup/snapshots/$BACKUP_DATE /mnt/backup/latest

# Remote sync over SSH (bandwidth-limited to 10 MB/s)
rsync -av --delete \
  --bwlimit=10000 \
  --partial \
  -e "ssh -i /root/.ssh/backup_key -p 22" \
  /var/www/html/ \
  backup-user@backup-server.example.com:/backups/html/
```

---

## rclone for Cloud Storage

### Installation and Configuration

```bash
curl https://rclone.org/install.sh | sudo bash

# Interactive config
rclone config
# Creates ~/.config/rclone/rclone.conf
```

`~/.config/rclone/rclone.conf`:
```ini
[b2]
type = b2
account = your-b2-account-id
key = your-b2-application-key

[s3]
type = s3
provider = AWS
access_key_id = AKIAIOSFODNN7EXAMPLE
secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
region = us-east-1

[sftp-backup]
type = sftp
host = backup-server.example.com
user = backup
key_file = /root/.ssh/backup_key
port = 22
```

### rclone Commands

```bash
# Copy (source → dest, skip existing identical files)
rclone copy /var/backups/ b2:my-bucket/server-backups/ --progress

# Sync (make destination identical to source — DELETES files not in source)
rclone sync /var/backups/ b2:my-bucket/server-backups/ \
  --progress \
  --bwlimit 50M

# Copy with bandwidth limit and filtering
rclone copy /var/backups/ s3:my-bucket/backups/ \
  --bwlimit 20M \
  --include "*.gpg" \
  --progress

# List remote contents
rclone ls b2:my-bucket/server-backups/

# Check (verify checksums between source and destination)
rclone check /var/backups/ b2:my-bucket/server-backups/
```

---

## Encryption with GPG

Never upload unencrypted backups containing sensitive data to cloud storage.

```bash
# Symmetric encryption (single passphrase) — simpler, good for personal use
gpg --symmetric \
    --cipher-algo AES256 \
    --compress-algo none \
    mydb_backup.dump
# Produces: mydb_backup.dump.gpg

# Asymmetric encryption (public key) — better for automation (no passphrase at encrypt time)
# Generate key pair once: gpg --full-gen-key
gpg --encrypt \
    --recipient backup-key@example.com \
    mydb_backup.dump

# Decrypt symmetric
gpg --decrypt mydb_backup.dump.gpg > mydb_backup.dump

# Decrypt asymmetric (requires private key)
gpg --decrypt mydb_backup.dump.gpg > mydb_backup.dump

# Pipe backup directly through encryption (no plaintext file on disk)
pg_dump -U postgres -Fc mydb | \
  gpg --symmetric --cipher-algo AES256 --compress-algo none \
  > /var/backups/mydb_$(date +%Y%m%d).dump.gpg
```

---

## Complete Production Backup Script

`/opt/scripts/backup-postgres.sh`:
```bash
#!/bin/bash
# Production PostgreSQL backup: dump → encrypt → upload to S3 → cleanup → ping
set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────
DB_NAME="mydb"
DB_USER="postgres"
BACKUP_DIR="/var/backups/postgres"
RCLONE_DEST="s3:my-backup-bucket/postgres"
GPG_PASSPHRASE_FILE="/etc/backup/gpg-passphrase"   # chmod 600, owned by backup user
HEALTHCHECK_URL="https://hc-ping.com/YOUR-CHECK-UUID"
RETAIN_LOCAL_DAYS=7
RETAIN_REMOTE_DAYS=30
LOG_FILE="/var/log/backup-postgres.log"

# ── Helpers ───────────────────────────────────────────────────────────────────
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

cleanup() {
  local exit_code=$?
  if [[ $exit_code -ne 0 ]]; then
    log "BACKUP FAILED (exit $exit_code) — sending failure ping"
    curl -fsS --retry 3 "${HEALTHCHECK_URL}/fail" > /dev/null || true
  fi
}
trap cleanup EXIT

# ── Ping start ────────────────────────────────────────────────────────────────
curl -fsS --retry 3 "${HEALTHCHECK_URL}/start" > /dev/null || true

# ── Backup ───────────────────────────────────────────────────────────────────
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="${DB_NAME}_${TIMESTAMP}.dump.gpg"
BACKUP_PATH="${BACKUP_DIR}/${FILENAME}"

mkdir -p "$BACKUP_DIR"
log "Starting backup of database: $DB_NAME"

pg_dump -U "$DB_USER" -Fc "$DB_NAME" | \
  gpg --batch --yes \
      --passphrase-file "$GPG_PASSPHRASE_FILE" \
      --symmetric \
      --cipher-algo AES256 \
      --compress-algo none \
  > "$BACKUP_PATH"

BACKUP_SIZE=$(du -sh "$BACKUP_PATH" | cut -f1)
log "Backup complete: $FILENAME ($BACKUP_SIZE)"

# ── Upload to S3 ─────────────────────────────────────────────────────────────
log "Uploading to $RCLONE_DEST"
rclone copy "$BACKUP_PATH" "$RCLONE_DEST/" \
  --progress \
  --log-file="$LOG_FILE" \
  --log-level INFO

log "Upload complete"

# ── Local retention cleanup ───────────────────────────────────────────────────
log "Removing local backups older than ${RETAIN_LOCAL_DAYS} days"
find "$BACKUP_DIR" -name "*.dump.gpg" -mtime +"$RETAIN_LOCAL_DAYS" -delete

# ── Remote retention cleanup ──────────────────────────────────────────────────
log "Removing remote backups older than ${RETAIN_REMOTE_DAYS} days"
rclone delete "$RCLONE_DEST" \
  --min-age "${RETAIN_REMOTE_DAYS}d" \
  --include "*.dump.gpg"

# ── Success ping ──────────────────────────────────────────────────────────────
curl -fsS --retry 3 "$HEALTHCHECK_URL" > /dev/null || true
log "Backup job finished successfully"
```

Crontab entry:
```cron
0 2 * * * backup-user /opt/scripts/backup-postgres.sh >> /var/log/backup-cron.log 2>&1
```

---

## Retention and Rotation Schedule

| Type | Frequency | Keep Count | Total Retained |
|------|-----------|------------|----------------|
| Daily | Every night at 02:00 | 7 | 7 days |
| Weekly | Every Sunday at 03:00 | 4 | 4 weeks |
| Monthly | 1st of month at 04:00 | 3 | 3 months |

Shell snippet for rotation logic:
```bash
# Keep only last N files matching pattern (sorted by modification time)
keep_last_n() {
  local dir="$1" pattern="$2" keep="$3"
  ls -t "$dir"/$pattern 2>/dev/null | tail -n +$((keep + 1)) | xargs -r rm --
}
keep_last_n /var/backups/postgres "*.dump.gpg" 7
```

---

## AWS IAM Policy for Backup User

Minimal S3 permissions — no ListAllMyBuckets, no delete on critical prefixes:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::my-backup-bucket/postgres/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::my-backup-bucket",
      "Condition": {
        "StringLike": {"s3:prefix": ["postgres/*"]}
      }
    }
  ]
}
```

---

## Disaster Recovery Concepts

**RTO (Recovery Time Objective):** Maximum acceptable downtime after a disaster. Drives decisions about hot/warm/cold standby and restore automation.

**RPO (Recovery Point Objective):** Maximum acceptable data loss measured in time. Drives backup frequency.

| Scenario | Target RTO | Target RPO | Strategy |
|----------|-----------|-----------|----------|
| Accidental data deletion | 1 hour | 24 hours | Daily backup + point-in-time restore |
| Server hardware failure | 4 hours | 24 hours | Offsite backup + server rebuild runbook |
| Datacenter outage | 24 hours | 24 hours | Cross-region offsite backup |
| Ransomware | 24–48 hours | 24 hours | Immutable offsite backup (object lock) |

---

## Restore Runbook Template

```
# DISASTER RECOVERY RUNBOOK — [Service Name]
# Last tested: [DATE]  Tested by: [NAME]

## Step 1: Provision New Server
- [ ] Provision server (size: ____, region: ____)
- [ ] Apply Terraform/Ansible baseline configuration
- [ ] Verify SSH access and firewall rules

## Step 2: Install Dependencies
- [ ] sudo apt install postgresql-16 (or appropriate version)
- [ ] Install application dependencies from runbook in DEPLOY.md

## Step 3: Download Latest Backup
  rclone copy s3:my-backup-bucket/postgres/ /var/restore/ --include "*.dump.gpg"
  # Identify most recent file
  ls -lt /var/restore/ | head -5

## Step 4: Decrypt
  gpg --batch --passphrase-file /etc/backup/gpg-passphrase \
      --decrypt /var/restore/mydb_YYYYMMDD_HHMMSS.dump.gpg \
      > /var/restore/mydb.dump

## Step 5: Restore Database
  createdb -U postgres mydb
  pg_restore -U postgres -d mydb -j 4 --clean --if-exists /var/restore/mydb.dump

## Step 6: Verify Data
  psql -U postgres -d mydb -c "SELECT COUNT(*) FROM users;"
  psql -U postgres -d mydb -c "SELECT MAX(created_at) FROM orders;"

## Step 7: Start Application
  systemctl start myapp
  curl -f http://localhost:3000/health

## Step 8: Update DNS / Load Balancer
  - [ ] Point DNS A record to new server IP
  - [ ] Update load balancer target group
  - [ ] Verify external access

## Step 9: Post-Recovery
  - [ ] Set up monitoring on new server
  - [ ] Schedule first backup of new server
  - [ ] Write incident report
  - [ ] Update runbook if steps were incorrect
```

---

## Anti-Patterns

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| No offsite backup | Local disaster (fire, ransomware) destroys all copies | Always push to a different geographic region using rclone |
| Never testing restores | Backup files are corrupt or incomplete — discovered only during a disaster | Monthly restore drill to a test environment |
| Unencrypted sensitive data uploaded to cloud | PII, credentials, financial data exposed if bucket becomes public | Pipe all backups through GPG before uploading |
| No monitoring of backup success | Backup script fails silently for weeks | Integrate healthchecks.io; alert on missing check-in |
| Storing backup credentials in backup script | Credential leak via script in git or logs | Use separate credentials file with `chmod 600`, or AWS IAM role |
| Backing up to same disk as primary data | Disk failure takes both primary and backup | Use a separate disk, remote server, or cloud storage |
| No retention policy | Storage fills up and script starts failing | Always implement `find -mtime +N -delete` or rclone `--min-age` |
| `pg_dump` without `--single-transaction` for InnoDB | Inconsistent backup if tables change during dump | Always use `--single-transaction` for live database dumps |
| Backing up only the application, not the database | Restore brings back code but data is months old | Include both database dumps and file backups in every backup job |

---

## Troubleshooting

| Symptom | Likely Cause | Diagnostic & Fix |
|---------|--------------|------------------|
| `pg_restore: error: could not execute query` | Schema version mismatch or missing extensions | Check Postgres version; restore globals first; ensure extensions installed |
| `pg_dump: error: query was canceled due to conflict` | Replication conflict on a hot standby | Use `--no-password --lock-wait-timeout=10s` or dump from primary |
| rclone `403 Forbidden` | IAM key lacks permission or wrong bucket name | `rclone lsd s3:` to test credentials; verify IAM policy covers the bucket/prefix |
| rclone `429 Too Many Requests` | B2 or S3 rate limit hit | Add `--tpslimit 10` to rclone command; reduce parallelism with `--transfers 4` |
| Backup taking too long | Large database, no compression, slow network | Use `-Fc` for pg_dump (built-in compression); add `--bwlimit` to avoid saturating connection |
| Restore takes too long | Single-threaded restore of large custom-format dump | Use `pg_restore -j 4` for parallel restore |
| GPG decryption fails | Wrong passphrase file or key not imported | `gpg --list-keys`; verify passphrase file contents (no trailing newline issues) |
| Healthchecks.io shows "Late" status | Cron job not running, or curl call before error trap fires | Check crontab, verify backup user's cron, ensure `curl` is in PATH |
| S3 bucket size growing unbounded | Retention cleanup script not running or misconfigured | Test cleanup manually with `rclone delete --dry-run`; check rclone logs |
| `find: No such file or directory` in cleanup | Backup directory path wrong in cleanup command | Log `$BACKUP_DIR` before cleanup; add `mkdir -p` at script start |
