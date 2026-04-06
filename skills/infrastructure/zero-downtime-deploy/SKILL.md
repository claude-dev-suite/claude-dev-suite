---
name: zero-downtime-deploy
description: |
  Zero-downtime deployment strategies and automation: blue-green, rolling, and canary
  deployments with Nginx upstream switching, symlink-based atomic deploys, rsync
  deploy scripts, GitHub Actions SSH deploy workflows, health check polling, and
  rollback runbooks.

  USE WHEN:
  - Implementing blue-green deployment with Nginx upstream swapping
  - Writing a production deploy script with symlink-based atomic release management
  - Configuring canary traffic splitting with Nginx split_clients
  - Setting up a GitHub Actions workflow that deploys via SSH with health check polling
  - Writing or testing a rollback runbook
  - Planning database migration strategy alongside zero-downtime deploys

  DO NOT USE FOR:
  - Kubernetes rolling updates and canary with Argo Rollouts (use the kubernetes skill)
  - Container image building and registry management (use the docker skill)
  - Cloud-specific deployment (AWS CodeDeploy, GCP Cloud Deploy — use the cloud skill)
  - Frontend-only CDN cache invalidation strategies
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---

# Zero-Downtime Deployment — Strategies and Automation

## Strategy Comparison

| Strategy | Traffic Shift | Rollback Speed | Cost | Risk |
|----------|--------------|----------------|------|------|
| Blue-Green | Instant (upstream or DNS swap) | Instant (swap back) | 2x infrastructure | Low — old version ready |
| Rolling | Gradual (instance by instance) | Medium (redeploy previous) | 1x infrastructure | Medium — mixed versions briefly |
| Canary | Percentage-based | Near-instant (drop to 0%) | 1x + small canary fleet | Low — small blast radius |

Choose based on: infrastructure cost tolerance, rollback requirements, and whether users can tolerate seeing mixed versions during deploy.

---

## Blue-Green Deployment

### Concept

Maintain two identical environments: **blue** (current live) and **green** (new version). Deploy to green, run smoke tests, then switch traffic from blue to green. Blue stays warm for instant rollback.

```
          ┌──────────┐
Users ──→ │  Nginx   │
          └─────┬────┘
                │ active_upstream.conf
         ┌──────┴──────┐
         ▼             ▼
  ┌─────────────┐  ┌─────────────┐
  │  Blue       │  │  Green      │
  │  :3000      │  │  :3001      │
  │  (old)      │  │  (new)      │
  └─────────────┘  └─────────────┘
```

### Nginx Configuration

`/etc/nginx/conf.d/upstreams.conf`:
```nginx
upstream blue {
    server 127.0.0.1:3000;
    keepalive 32;
}

upstream green {
    server 127.0.0.1:3001;
    keepalive 32;
}
```

`/etc/nginx/active_upstream.conf` (managed by deploy script):
```nginx
# This file is symlinked/replaced atomically by deploy scripts.
# Do not edit manually.
proxy_pass http://blue;
```

`/etc/nginx/sites-enabled/myapp.conf`:
```nginx
server {
    listen 80;
    server_name example.com;

    location / {
        include /etc/nginx/active_upstream.conf;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Health check configuration
        proxy_connect_timeout 5s;
        proxy_read_timeout 60s;
    }
}
```

### Blue-Green Upstream Swap Script

`/opt/scripts/blue-green-swap.sh`:
```bash
#!/bin/bash
# Blue-Green upstream swap for Nginx
# Usage: blue-green-swap.sh [blue|green]
set -euo pipefail

TARGET=${1:-}
ACTIVE_CONF="/etc/nginx/active_upstream.conf"
NGINX_CONF="/etc/nginx/nginx.conf"
LOG_FILE="/var/log/deploy/blue-green.log"
HEALTH_CHECK_TIMEOUT=30

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

# ── Determine current and target upstream ─────────────────────────────────────
current=$(grep -oP 'http://\K[a-z]+' "$ACTIVE_CONF" 2>/dev/null || echo "blue")
if [[ -z "$TARGET" ]]; then
    TARGET=$([ "$current" = "blue" ] && echo "green" || echo "blue")
fi

if [[ "$TARGET" != "blue" && "$TARGET" != "green" ]]; then
    echo "Usage: $0 [blue|green]" >&2
    exit 1
fi

log "Switching from $current to $TARGET"

# ── Determine target port ──────────────────────────────────────────────────────
TARGET_PORT=$([ "$TARGET" = "blue" ] && echo "3000" || echo "3001")

# ── Health check target before switching ──────────────────────────────────────
log "Health checking $TARGET on port $TARGET_PORT..."
deadline=$((SECONDS + HEALTH_CHECK_TIMEOUT))
while [[ $SECONDS -lt $deadline ]]; do
    if curl -fsS --max-time 3 "http://127.0.0.1:${TARGET_PORT}/health" > /dev/null 2>&1; then
        log "$TARGET is healthy"
        break
    fi
    log "Waiting for $TARGET health check..."
    sleep 2
done

if ! curl -fsS --max-time 3 "http://127.0.0.1:${TARGET_PORT}/health" > /dev/null 2>&1; then
    log "ERROR: $TARGET health check failed after ${HEALTH_CHECK_TIMEOUT}s — aborting swap"
    exit 1
fi

# ── Write new active_upstream.conf ────────────────────────────────────────────
# Write to temp file first, then atomically move
TMP_CONF=$(mktemp)
cat > "$TMP_CONF" <<EOF
# Active upstream: $TARGET (updated $(date '+%Y-%m-%d %H:%M:%S'))
proxy_pass http://${TARGET};
EOF
sudo mv "$TMP_CONF" "$ACTIVE_CONF"

# ── Test Nginx config and reload ──────────────────────────────────────────────
if ! sudo nginx -t 2>&1; then
    log "ERROR: Nginx config test failed — reverting"
    echo "proxy_pass http://${current};" | sudo tee "$ACTIVE_CONF" > /dev/null
    exit 1
fi

sudo nginx -s reload
log "Nginx reloaded — now serving from $TARGET"

# ── Final external health check ───────────────────────────────────────────────
sleep 2
if curl -fsS --max-time 5 "https://example.com/health" > /dev/null 2>&1; then
    log "External health check passed — deploy complete"
else
    log "WARNING: External health check failed — monitor closely"
fi

echo ""
echo "Deploy summary:"
echo "  Previous: $current"
echo "  Active:   $TARGET"
echo "  Port:     $TARGET_PORT"
echo ""
echo "To rollback: sudo /opt/scripts/blue-green-swap.sh $current"
```

```bash
sudo chmod +x /opt/scripts/blue-green-swap.sh
sudo mkdir -p /var/log/deploy

# Deploy to green and switch
./deploy-to-green.sh    # Deploy your app to port 3001
sudo /opt/scripts/blue-green-swap.sh green

# Instant rollback
sudo /opt/scripts/blue-green-swap.sh blue
```

---

## Rolling Deployment

Nginx upstream with `max_fails` for automatic routing around unhealthy instances:

```nginx
upstream app {
    server 127.0.0.1:3000 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:3001 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:3002 max_fails=3 fail_timeout=30s;
    keepalive 32;
}
```

Rolling update loop:
```bash
#!/bin/bash
# Rolling update: restart each instance sequentially
APP_INSTANCES=(myapp@3000 myapp@3001 myapp@3002)
HEALTH_URL="http://127.0.0.1"

for INSTANCE in "${APP_INSTANCES[@]}"; do
    PORT=${INSTANCE##*@}
    echo "Restarting $INSTANCE..."
    sudo systemctl restart "$INSTANCE"

    echo "Waiting for $INSTANCE to become healthy..."
    for i in $(seq 1 30); do
        if curl -fsS --max-time 2 "${HEALTH_URL}:${PORT}/health" > /dev/null 2>&1; then
            echo "$INSTANCE is healthy after ${i}s"
            break
        fi
        sleep 1
    done

    if ! curl -fsS --max-time 2 "${HEALTH_URL}:${PORT}/health" > /dev/null 2>&1; then
        echo "ERROR: $INSTANCE failed health check — stopping rolling update"
        exit 1
    fi

    echo "$INSTANCE healthy — continuing to next instance..."
    sleep 2   # Brief pause between restarts
done

echo "Rolling update complete"
```

---

## Canary Deployment

Route a percentage of traffic to the new version using Nginx `split_clients`:

```nginx
# Hash on client IP for sticky routing (same user always sees same version)
split_clients "${remote_addr}" $upstream_pool {
    10%     canary;   # 10% to new version
    *       stable;   # 90% to current version
}

upstream stable {
    server 127.0.0.1:3000;
    keepalive 32;
}

upstream canary {
    server 127.0.0.1:3001;
    keepalive 32;
}

server {
    location / {
        proxy_pass http://$upstream_pool;
    }
}
```

Adjust percentage by editing the `split_clients` block and reloading Nginx. Monitor error rate and latency in Grafana before increasing canary percentage. To promote canary to 100%: replace `stable` backend with canary code and set `*` to the stable upstream.

---

## Rsync + Symlink Atomic Deploy Script

### Directory Layout (Capistrano-style)

```
/var/www/myapp/
├── releases/
│   ├── 20241201_030000/    ← older release
│   ├── 20241202_030000/    ← previous release
│   └── 20241203_030000/    ← newest release
├── current -> releases/20241203_030000   ← symlink (atomic)
└── shared/
    ├── .env                ← never in repository
    ├── logs/ -> /var/log/myapp/
    └── uploads/
```

### Deploy Script

`/opt/scripts/deploy.sh`:
```bash
#!/bin/bash
# Rsync + atomic symlink deploy
# Usage: deploy.sh [--rollback]
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
APP_DIR="/var/www/myapp"
RELEASES_DIR="$APP_DIR/releases"
SHARED_DIR="$APP_DIR/shared"
CURRENT_LINK="$APP_DIR/current"
SOURCE_DIR="/tmp/myapp-deploy"        # Checked-out source from CI
SERVICE_NAME="myapp"
HEALTH_URL="http://127.0.0.1:3000/health"
KEEP_RELEASES=5
LOG_FILE="/var/log/deploy/deploy.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

mkdir -p "$RELEASES_DIR" /var/log/deploy

# ── Rollback mode ─────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--rollback" ]]; then
    log "ROLLBACK: finding previous release..."
    # Get the second-most-recent release (current is most recent, previous is before that)
    PREVIOUS_RELEASE=$(ls -t "$RELEASES_DIR" | sed -n '2p')
    if [[ -z "$PREVIOUS_RELEASE" ]]; then
        log "ERROR: No previous release found"
        exit 1
    fi
    log "Rolling back to $PREVIOUS_RELEASE"
    ln -sfn "$RELEASES_DIR/$PREVIOUS_RELEASE" "$CURRENT_LINK"
    sudo systemctl restart "$SERVICE_NAME"
    sleep 3
    if curl -fsS --max-time 5 "$HEALTH_URL" > /dev/null; then
        log "Rollback successful — now running $PREVIOUS_RELEASE"
    else
        log "ERROR: Health check failed after rollback"
        exit 1
    fi
    exit 0
fi

# ── Create release directory ──────────────────────────────────────────────────
RELEASE_NAME=$(date +%Y%m%d_%H%M%S)
RELEASE_DIR="$RELEASES_DIR/$RELEASE_NAME"
mkdir -p "$RELEASE_DIR"
log "Creating release: $RELEASE_NAME"

# ── Rsync source to release directory ────────────────────────────────────────
log "Syncing files..."
rsync -av --delete \
    --exclude='.git/' \
    --exclude='node_modules/' \
    --exclude='.env*' \
    --exclude='*.log' \
    --exclude='uploads/' \
    "$SOURCE_DIR/" \
    "$RELEASE_DIR/"

# ── Link shared files and directories ────────────────────────────────────────
log "Linking shared resources..."
ln -sf "$SHARED_DIR/.env" "$RELEASE_DIR/.env"
ln -sf "$SHARED_DIR/uploads" "$RELEASE_DIR/public/uploads"
mkdir -p "$RELEASE_DIR/log"
ln -sf /var/log/myapp "$RELEASE_DIR/log"

# ── Install dependencies ──────────────────────────────────────────────────────
log "Installing dependencies..."
cd "$RELEASE_DIR"
npm ci --omit=dev --prefer-offline

# ── Run database migrations ───────────────────────────────────────────────────
log "Running database migrations..."
npm run db:migrate -- --no-rollback-on-fail
# Use additive-only migrations (expand/contract pattern for zero-downtime)

# ── Build assets (if applicable) ─────────────────────────────────────────────
if [[ -f "$RELEASE_DIR/package.json" ]] && grep -q '"build"' "$RELEASE_DIR/package.json"; then
    log "Building assets..."
    npm run build
fi

# ── Atomic symlink swap ───────────────────────────────────────────────────────
log "Swapping symlink to $RELEASE_NAME..."
ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"

# ── Restart service ───────────────────────────────────────────────────────────
log "Restarting $SERVICE_NAME..."
sudo systemctl restart "$SERVICE_NAME"

# ── Health check polling ──────────────────────────────────────────────────────
log "Polling health check..."
HEALTH_TIMEOUT=60
for i in $(seq 1 $HEALTH_TIMEOUT); do
    if curl -fsS --max-time 3 "$HEALTH_URL" > /dev/null 2>&1; then
        log "Health check passed after ${i}s"
        break
    fi
    if [[ $i -eq $HEALTH_TIMEOUT ]]; then
        log "ERROR: Health check failed after ${HEALTH_TIMEOUT}s — triggering rollback"
        "$0" --rollback
        exit 1
    fi
    sleep 1
done

# ── Clean old releases ────────────────────────────────────────────────────────
log "Cleaning up old releases (keeping last $KEEP_RELEASES)..."
ls -t "$RELEASES_DIR" | tail -n +$((KEEP_RELEASES + 1)) | while read -r OLD_RELEASE; do
    log "Removing old release: $OLD_RELEASE"
    rm -rf "$RELEASES_DIR/$OLD_RELEASE"
done

log "Deploy complete: $RELEASE_NAME"
echo ""
echo "Release: $RELEASE_NAME"
echo "Current: $(readlink -f "$CURRENT_LINK")"
```

```bash
sudo chmod +x /opt/scripts/deploy.sh

# Deploy
sudo /opt/scripts/deploy.sh

# Rollback
sudo /opt/scripts/deploy.sh --rollback
```

---

## GitHub Actions Deploy Workflow

`.github/workflows/deploy.yml`:
```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      rollback:
        description: 'Rollback to previous release'
        type: boolean
        default: false

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm
      - run: npm ci
      - run: npm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    environment: production
    concurrency:
      group: production-deploy
      cancel-in-progress: false   # Never cancel in-flight deploys

    steps:
      - uses: actions/checkout@v4

      # Set up SSH agent with deploy key
      - name: Set up SSH
        uses: webfactory/ssh-agent@v0.8.0
        with:
          ssh-private-key: ${{ secrets.DEPLOY_SSH_KEY }}

      # Add server to known_hosts (prevents MITM prompt)
      - name: Add server to known_hosts
        run: |
          mkdir -p ~/.ssh
          ssh-keyscan -H ${{ secrets.DEPLOY_HOST }} >> ~/.ssh/known_hosts
          chmod 600 ~/.ssh/known_hosts

      # Copy source code to server (only if not rollback)
      - name: Sync source to server
        if: ${{ !inputs.rollback }}
        run: |
          rsync -av --delete \
            --exclude='.git/' \
            --exclude='node_modules/' \
            -e "ssh -o StrictHostKeyChecking=yes" \
            ./ \
            ${{ secrets.DEPLOY_USER }}@${{ secrets.DEPLOY_HOST }}:/tmp/myapp-deploy/

      # Run deploy script on server
      - name: Deploy
        run: |
          if [[ "${{ inputs.rollback }}" == "true" ]]; then
            ssh ${{ secrets.DEPLOY_USER }}@${{ secrets.DEPLOY_HOST }} \
              "sudo /opt/scripts/deploy.sh --rollback"
          else
            ssh ${{ secrets.DEPLOY_USER }}@${{ secrets.DEPLOY_HOST }} \
              "sudo /opt/scripts/deploy.sh"
          fi

      # Poll health check from GitHub Actions runner (external validation)
      - name: External health check
        run: |
          echo "Polling https://${{ secrets.DEPLOY_HOST }}/health..."
          for i in $(seq 1 30); do
            STATUS=$(curl -o /dev/null -s -w "%{http_code}" https://${{ secrets.DEPLOY_HOST }}/health)
            if [[ "$STATUS" == "200" ]]; then
              echo "Health check passed (HTTP $STATUS) after ${i}s"
              exit 0
            fi
            echo "Attempt $i: HTTP $STATUS — retrying..."
            sleep 2
          done
          echo "Health check never passed — deploy may have failed"
          exit 1

      - name: Notify Slack on failure
        if: failure()
        run: |
          curl -X POST ${{ secrets.SLACK_WEBHOOK_URL }} \
            -H 'Content-Type: application/json' \
            -d '{"text": ":red_circle: Deploy to production failed! Check GitHub Actions."}'
```

Required GitHub secrets: `DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER`, `SLACK_WEBHOOK_URL`.

The deploy user needs passwordless sudo for `/opt/scripts/deploy.sh`:
```
# /etc/sudoers.d/deploy
deploy ALL=(ALL) NOPASSWD: /opt/scripts/deploy.sh
deploy ALL=(ALL) NOPASSWD: /bin/systemctl restart myapp
```

---

## Rollback Runbook

```
# ROLLBACK RUNBOOK — Production Deploy Rollback
# Trigger: health check failing post-deploy, error rate spike, user reports

## Step 1: Detect and Confirm Problem
  - [ ] Check Grafana: error rate, response time, 5xx count
  - [ ] Check application logs: journalctl -u myapp --since "5 minutes ago"
  - [ ] Confirm: problem started after deploy, not before

## Step 2: Immediate Mitigation (choose one)

  Option A — Symlink rollback (< 30 seconds):
    sudo /opt/scripts/deploy.sh --rollback

  Option B — Blue-green swap back (< 10 seconds):
    sudo /opt/scripts/blue-green-swap.sh blue

  Option C — Manual symlink swap:
    PREVIOUS=$(ls -t /var/www/myapp/releases | sed -n '2p')
    ln -sfn "/var/www/myapp/releases/$PREVIOUS" /var/www/myapp/current
    sudo systemctl restart myapp

## Step 3: Verify
  - [ ] curl https://example.com/health → 200 OK
  - [ ] Check Grafana: error rate returning to baseline
  - [ ] Check application logs: no new errors

## Step 4: Communicate
  - [ ] Post in #incidents: "Rolled back deploy at HH:MM — investigating root cause"
  - [ ] Update status page if customer-visible

## Step 5: Root Cause and Post-Mortem
  - [ ] Identify what caused the failure (diff the two releases)
  - [ ] Fix the issue in a branch
  - [ ] Add test coverage for the bug
  - [ ] Re-deploy after thorough testing
  - [ ] Write 5-minute post-mortem (what happened, why, what we changed)
```

---

## Environment Management

Secrets and environment configuration must never live in the repository.

### Systemd EnvironmentFile

`/etc/systemd/system/myapp.service`:
```ini
[Unit]
Description=My Application
After=network.target

[Service]
Type=simple
User=myapp
WorkingDirectory=/var/www/myapp/current
EnvironmentFile=/var/www/myapp/shared/.env
ExecStart=/usr/bin/node /var/www/myapp/current/dist/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

`/var/www/myapp/shared/.env` (`chmod 640`, owned by `myapp:myapp`):
```env
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@localhost:5432/myapp_prod
REDIS_URL=redis://localhost:6379
SECRET_KEY=very-long-random-secret
```

Inject from CI secrets (never commit):
```bash
# In GitHub Actions — write .env from secrets before rsync
cat > /tmp/myapp.env <<EOF
NODE_ENV=production
DATABASE_URL=${{ secrets.DATABASE_URL }}
SECRET_KEY=${{ secrets.SECRET_KEY }}
EOF
scp /tmp/myapp.env deploy@server:/var/www/myapp/shared/.env
```

---

## Database Migration Strategy

### Expand/Contract (Forward-Only) Pattern

Zero-downtime migrations require that new code and old code can run against the **same database schema** simultaneously.

| Phase | Schema Change | Code |
|-------|--------------|------|
| **Expand** | Add new column/table (nullable or with default) | Both old and new code work |
| **Deploy** | Roll out new code | New code uses new column |
| **Contract** | Remove old column/table (old code no longer running) | Cleanup migration |

**Safe live changes (additive-only):**
- Adding a nullable column
- Adding a column with a DEFAULT value
- Creating a new table
- Adding an index CONCURRENTLY (Postgres): `CREATE INDEX CONCURRENTLY idx_name ON table(col)`

**Unsafe live changes (require maintenance window or expand/contract):**
- Renaming a column or table
- Dropping a column
- Adding a NOT NULL column without DEFAULT
- Adding a unique constraint (locks table)
- Changing a column type

```bash
# Postgres: create index without locking the table
psql -c "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON users(email);"
```

---

## Anti-Patterns

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| Deploy directly to production without staging | No validation that new version works before users see it | Always deploy to staging first; run smoke tests |
| No health check after deploy | Failed deploy discovered by users, not monitoring | Poll `/health` endpoint in deploy script; auto-rollback on failure |
| Migrations that break old code | During rolling deploy, old pods crash against new schema | Use expand/contract: deploy backward-compatible schema first, then new code |
| No rollback plan | Incident duration extends while team figures out how to revert | Test rollback on staging quarterly; keep rollback script in deploy pipeline |
| Storing secrets in deploy script or repository | Credential exposure in git history | Use `EnvironmentFile` in systemd; inject secrets from CI environment |
| Running database migrations in the deploy script (blocking) | Long-running migration holds deploy and may hold table lock | Run migrations separately before code deploy; use `CREATE INDEX CONCURRENTLY` |
| Single `latest` tag for Docker images | Previous version destroyed — rollback requires rebuild | Tag images with git SHA: `myapp:abc1234`; keep last N images |
| No concurrent deploy protection | Two deploys in parallel corrupt release directory | Use `concurrency: group: production-deploy` in GitHub Actions |
| Deploying without draining connections from old version | In-flight requests to old instance are killed mid-response | Add `SIGTERM` handler to app; configure systemd `TimeoutStopSec=30` |

---

## Troubleshooting

| Symptom | Likely Cause | Diagnostic & Fix |
|---------|--------------|------------------|
| Health check never passes after deploy | App crashes on startup, wrong port, or missing env var | `journalctl -u myapp -n 50`; check port with `ss -tlnp`; verify `.env` file readable |
| Symlink swap race (two deploys collide) | Concurrent deploys overwrite each other's `current` link | Add `concurrency` group in CI; use deploy lock file (`flock`) |
| SSH key not found in CI | Secret not set, or wrong secret name | Check GitHub Actions secrets tab; test with `echo "${{ secrets.DEPLOY_SSH_KEY }}" | wc -c` |
| `rsync: connection unexpectedly closed` | SSH auth failure or server unreachable | Test manually: `ssh -i key deploy@host 'echo ok'`; check `known_hosts` |
| Database migration fails mid-deploy | Migration error, constraint violation, or timeout | Roll back migration manually; restore from pre-deploy backup if data corrupted |
| `sudo: /opt/scripts/deploy.sh: command not found` | sudo PATH doesn't include script directory | Use full absolute path in sudoers; verify script exists at that path |
| Old release not cleaned up; disk fills up | `KEEP_RELEASES` cleanup not running or failing | `ls -lt /var/www/myapp/releases`; run cleanup manually; check deploy script exit code |
| Nginx returns 502 after upstream swap | New backend not ready, or upstream block misconfigured | `nginx -t`; check upstream port is listening (`ss -tlnp`); check Nginx error log |
| `ln -sfn` doesn't update symlink | Target directory doesn't exist, or path typo | `ls -la /var/www/myapp/current`; verify RELEASE_DIR was created successfully |
| Rollback deploys same broken version | Most recent and second-most-recent releases are both broken | Check release list: `ls -lt releases/`; manually point to an older known-good release |
