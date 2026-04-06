---
name: systemd
description: |
  systemd unit file authoring and system management skill: service units,
  timer units, socket activation, drop-in overrides, journalctl, and security
  hardening options.

  USE WHEN:
  - Writing or modifying systemd service unit files for Node.js, Python, Go, or other apps
  - Setting up automatic restarts, dependency ordering, and environment variable loading
  - Creating timer units as a cron replacement for periodic tasks
  - Hardening a service with PrivateTmp, NoNewPrivileges, ProtectSystem=strict, etc.
  - Using drop-in overrides to modify upstream package-provided unit files
  - Debugging service startup failures, missing env vars, or timer misfires
  - Managing logs with journalctl (filtering, following, exporting)

  DO NOT USE FOR:
  - Docker container orchestration (use docker or kubernetes skill)
  - Application-level scheduling (job queues, cron-based business logic — use job-queues skill)
  - Full init system replacement on non-systemd distros (Alpine uses OpenRC)
  - Windows Task Scheduler or macOS launchd equivalents
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---

# systemd — Unit Files and System Management

## Unit File Anatomy

systemd units live in:
- `/lib/systemd/system/` — package-installed units (do not edit directly)
- `/etc/systemd/system/` — administrator units; override package units with same name
- `/etc/systemd/system/<name>.service.d/` — drop-in overrides (preferred)

Unit files use INI-style sections. Key sections for a service:

```
[Unit]     — metadata, dependencies, ordering
[Service]  — what to run and how to manage it
[Install]  — how to enable/disable (which targets want this unit)
```

---

## Production Service Unit Template

Save as `/etc/systemd/system/myapp.service`:

```ini
[Unit]
Description=My Application Server
Documentation=https://docs.example.com/myapp
# Ordering: start after network is up and PostgreSQL is ready
After=network-online.target postgresql.service
Wants=network-online.target
# Hard dependency: if PostgreSQL stops, this unit also stops
Requires=postgresql.service

[Service]
# --- Process type ---
# simple: ExecStart is the main process; systemd tracks it directly
# forking: process daemonises (old-style); set PIDFile=
# notify: process signals systemd via sd_notify() when ready
# oneshot: for scripts that run and exit; combine with RemainAfterExit=yes
Type=notify

# --- Identity ---
User=myapp
Group=myapp
WorkingDirectory=/opt/myapp

# --- Environment ---
# Load secrets from a file not checked into source control
EnvironmentFile=/etc/myapp/environment
# Inline env vars (for non-secret values)
Environment=NODE_ENV=production
Environment=PORT=3000

# --- Process lifecycle ---
ExecStartPre=/opt/myapp/scripts/pre-start.sh   # Validation / migration
ExecStart=/usr/bin/node /opt/myapp/dist/server.js
ExecStop=/bin/kill -SIGTERM $MAINPID           # Graceful shutdown signal
ExecStopPost=/opt/myapp/scripts/post-stop.sh  # Cleanup after stop
ExecReload=/bin/kill -SIGHUP $MAINPID          # Signal for config reload (if supported)

# --- Restart behaviour ---
Restart=on-failure         # Restart if process exits non-zero or is killed
RestartSec=5s              # Wait 5 seconds before restarting
StartLimitIntervalSec=60s  # Window for counting start attempts
StartLimitBurst=5          # Max 5 starts in 60s; unit enters failed state after

# --- Resource limits ---
LimitNOFILE=65535          # Open file descriptors (overrides /etc/security/limits.conf)
LimitNPROC=4096            # Max subprocesses
MemoryMax=2G               # OOM-kill process if it exceeds 2 GB (cgroup-based)
CPUQuota=200%              # Max 2 CPU cores (200% of one core = 2 cores)
TasksMax=512               # Max number of tasks (threads + processes)

# --- Output logging ---
StandardOutput=journal     # stdout → journal
StandardError=journal      # stderr → journal
SyslogIdentifier=myapp     # Tag in journal (default: unit name without .service)

# --- Security hardening ---
PrivateTmp=true            # Mount private /tmp and /var/tmp (other services can't see them)
NoNewPrivileges=true       # Prevent setuid/setgid; process can't gain more privileges
ProtectSystem=strict       # /usr, /boot, /etc are read-only
ProtectHome=true           # /home, /root, /run/user are inaccessible
ReadWritePaths=/var/lib/myapp /var/log/myapp  # Exceptions to ProtectSystem=strict
PrivateDevices=true        # No access to physical devices
ProtectKernelTunables=true # Block writes to /proc/sys
ProtectKernelModules=true  # Block kernel module loading
ProtectControlGroups=true  # Block cgroup manipulation
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX  # Restrict socket families
RestrictNamespaces=true    # Block namespace creation
SystemCallFilter=@system-service  # Whitelist common syscalls; block dangerous ones

# --- Timeout ---
TimeoutStartSec=30s        # Fail if not ready within 30s (for Type=notify)
TimeoutStopSec=30s         # Force-kill after 30s if graceful stop takes too long

[Install]
WantedBy=multi-user.target  # Enable via: systemctl enable myapp
```

---

## EnvironmentFile Pattern for Secrets

```bash
# /etc/myapp/environment (mode 600, owned by root or myapp user)
DATABASE_URL=postgresql://myapp:secret@localhost:5432/myapp_prod
SECRET_KEY=your-256-bit-random-key-here
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
REDIS_URL=redis://:password@localhost:6379/0
```

```bash
# Set correct permissions
sudo install -m 600 -o root -g root /dev/stdin /etc/myapp/environment <<'EOF'
DATABASE_URL=...
EOF

# Or for apps running as a specific user
sudo install -m 640 -o root -g myapp /dev/stdin /etc/myapp/environment <<'EOF'
DATABASE_URL=...
EOF
```

The `EnvironmentFile` path in the unit file reads each `KEY=VALUE` line. Lines starting with `#` are ignored. A leading `-` makes the file optional: `EnvironmentFile=-/etc/myapp/environment`.

---

## Timer Unit — Daily Backup Job

### /etc/systemd/system/backup-myapp.service

```ini
[Unit]
Description=Daily backup of myapp database
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=backup
Group=backup
EnvironmentFile=/etc/myapp/environment
ExecStart=/opt/myapp/scripts/backup.sh
StandardOutput=journal
StandardError=journal
SyslogIdentifier=backup-myapp
```

### /etc/systemd/system/backup-myapp.timer

```ini
[Unit]
Description=Run myapp backup daily at 02:30 UTC
Requires=backup-myapp.service

[Timer]
# OnCalendar format: DayOfWeek Year-Month-Day Hour:Minute:Second
# Shortcuts: minutely, hourly, daily, weekly, monthly, yearly, quarterly
OnCalendar=*-*-* 02:30:00    # Every day at 02:30 UTC
Persistent=true               # If timer was missed (machine off), run immediately on next boot
RandomizedDelaySec=10min      # Jitter to avoid thundering herd on multiple servers
AccuracySec=1min              # Allow 1 minute timing inaccuracy for better power management

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now backup-myapp.timer

# Verify timer status
sudo systemctl list-timers backup-myapp
sudo systemctl status backup-myapp.timer

# Trigger immediately (for testing)
sudo systemctl start backup-myapp.service
```

### OnCalendar Syntax Examples

```
OnCalendar=minutely              # Every minute
OnCalendar=hourly                # Every hour at :00
OnCalendar=daily                 # Every day at 00:00
OnCalendar=weekly                # Every Monday at 00:00
OnCalendar=monthly               # First day of month at 00:00
OnCalendar=*-*-* 02:30:00        # Every day at 02:30
OnCalendar=Mon *-*-* 03:00:00    # Every Monday at 03:00
OnCalendar=*-*-1 04:00:00        # First of every month at 04:00
OnCalendar=*-*-* *:0/15:00       # Every 15 minutes
OnCalendar=Mon..Fri *-*-* 09:00:00  # Weekdays at 09:00

# Verify calendar expression without executing
systemd-analyze calendar "Mon *-*-* 09:00:00"
```

---

## Drop-In Overrides

Override a package-provided unit without editing the original file:

```bash
# Opens editor; creates /etc/systemd/system/nginx.service.d/override.conf
sudo systemctl edit nginx

# Create override manually
sudo mkdir -p /etc/systemd/system/nginx.service.d/
sudo tee /etc/systemd/system/nginx.service.d/limits.conf > /dev/null <<'EOF'
[Service]
# Raise open file descriptor limit for Nginx
LimitNOFILE=65535
# Add environment variable
Environment=MALLOC_ARENA_MAX=2
EOF

sudo systemctl daemon-reload
sudo systemctl restart nginx

# Show effective merged unit (original + all drop-ins)
sudo systemctl cat nginx
```

Drop-in files in `<name>.service.d/` are applied alphabetically. Use numeric prefixes (e.g., `10-limits.conf`, `20-env.conf`) to control order.

---

## Socket Activation

systemd can hold a listening socket and pass it to the service on first connection. The service doesn't need to be running all the time.

### /etc/systemd/system/myapp.socket

```ini
[Unit]
Description=myapp socket activation

[Socket]
ListenStream=127.0.0.1:3000   # Or: ListenStream=/run/myapp/myapp.sock
Accept=false                   # false = pass socket fd to service (not per-connection)

[Install]
WantedBy=sockets.target
```

The service unit must accept the socket via `sd_listen_fds()` (Node.js: `LISTEN_FDS` env var, or use `systemd` npm package). Enable the socket, not the service:

```bash
sudo systemctl enable --now myapp.socket
# systemd starts myapp.service automatically on first connection
```

---

## systemctl Command Reference

```bash
# Start / stop / restart / reload
sudo systemctl start myapp
sudo systemctl stop myapp
sudo systemctl restart myapp
sudo systemctl reload myapp   # Send reload signal (ExecReload); service must support it

# Enable / disable (controls WantedBy symlinks in /etc/systemd/system/multi-user.target.wants/)
sudo systemctl enable myapp         # Enable but don't start
sudo systemctl enable --now myapp   # Enable and start immediately
sudo systemctl disable myapp        # Disable; running instance continues until stopped
sudo systemctl disable --now myapp  # Disable and stop

# Mask / unmask (make impossible to start, even manually)
sudo systemctl mask myapp
sudo systemctl unmask myapp

# Reload unit files from disk (ALWAYS run after editing unit files)
sudo systemctl daemon-reload

# Status and inspection
sudo systemctl status myapp
sudo systemctl is-active myapp   # Returns "active" or "inactive" (exit code 0/non-0)
sudo systemctl is-enabled myapp
sudo systemctl is-failed myapp
sudo systemctl cat myapp         # Show effective unit file (with drop-ins)
sudo systemctl show myapp        # Show all unit properties

# List units
sudo systemctl list-units --type=service --state=running
sudo systemctl list-units --type=timer
sudo systemctl list-timers --all
sudo systemctl list-unit-files --type=service | grep myapp

# Dependency tree
sudo systemctl list-dependencies myapp
sudo systemctl list-dependencies --reverse myapp  # Who depends on myapp?
```

---

## journalctl Cheat-Sheet

```bash
# Follow logs for a specific unit (like tail -f)
journalctl -u myapp -f

# Last N lines
journalctl -u myapp -n 100

# Since / until (accepts many formats)
journalctl -u myapp --since "2024-01-15 14:00:00" --until "2024-01-15 15:00:00"
journalctl -u myapp --since "1 hour ago"
journalctl -u myapp --since today

# Filter by priority level
# 0=emerg, 1=alert, 2=crit, 3=err, 4=warning, 5=notice, 6=info, 7=debug
journalctl -u myapp -p err        # Errors and above
journalctl -u myapp -p warning    # Warnings and above

# No pager (output all at once — useful in scripts)
journalctl -u myapp --no-pager

# Boot logs
journalctl -b           # Current boot
journalctl -b -1        # Previous boot
journalctl --list-boots # All recorded boots

# Kernel messages
journalctl -k           # Equivalent to dmesg

# JSON output (for log shipping to Elasticsearch etc.)
journalctl -u myapp -n 100 --output=json | jq '.'
journalctl -u myapp -n 100 --output=json-pretty

# Plain message text only
journalctl -u myapp --output=cat

# Filter by field (systemd journal fields)
journalctl _SYSTEMD_UNIT=myapp.service
journalctl _PID=12345
journalctl _UID=1001

# Disk usage
journalctl --disk-usage
# Vacuum by size or time
sudo journalctl --vacuum-size=500M
sudo journalctl --vacuum-time=30d

# Export to file (for archival)
journalctl -u myapp --since "2024-01-01" --output=export > /tmp/myapp-jan.journal
```

---

## Anti-Patterns

| Anti-pattern | Why it's harmful | Fix |
|---|---|---|
| Running service as `root` | Full system compromise on any exploit in the service | Set `User=` and `Group=` to a dedicated unprivileged user |
| No `Restart=` directive | Service crash requires manual restart or monitoring system intervention | Set `Restart=on-failure`; add `RestartSec=5s` to rate-limit restarts |
| No `LimitNOFILE=` in service unit | Service hits OS default (typically 1024) FD limit → "too many open files" | Set `LimitNOFILE=65535` in `[Service]`; `limits.conf` does not affect systemd services |
| `ExecStart` with shell globs or pipes | systemd does not use a shell; globs not expanded; pipes create wrong PID | Wrap in a shell: `ExecStart=/bin/bash -c 'cmd1 | cmd2'`; or better, write a wrapper script |
| Not running `daemon-reload` after editing unit files | systemd continues using the cached (old) unit definition | Always run `sudo systemctl daemon-reload` before restart |
| `Type=simple` for slow-starting services | systemd may start dependents before the service is ready | Use `Type=notify` (if app supports sd_notify) or `Type=forking` + `PIDFile=`; or add `ExecStartPost` health check |
| Putting secrets in `Environment=` directly in unit file | Unit file is world-readable in `systemctl cat` output and journald | Use `EnvironmentFile=/etc/myapp/env` with `chmod 600` |
| `ProtectSystem=strict` without `ReadWritePaths=` | App can't write logs, cache, or state files → silent failures | Add `ReadWritePaths=/var/lib/myapp /var/log/myapp` |
| Timer `Persistent=false` for critical jobs | If server is down at scheduled time, job is silently skipped | Set `Persistent=true` so missed jobs run on next boot |
| Using `KillMode=none` to avoid killing child processes | Orphaned children not cleaned up when service stops; zombies accumulate | Default `KillMode=control-group` kills entire cgroup; use `ExecStop` for graceful drain |

---

## Troubleshooting

| Symptom | Likely cause | Diagnostic / Fix |
|---|---|---|
| **Service fails to start** | ExecStart path wrong, permission error, or missing dependency | `sudo systemctl status myapp -l`; `journalctl -u myapp -n 50`; test ExecStart manually as the service user |
| **Environment variables not loaded** | `EnvironmentFile` path wrong, file permissions, or quoting issue | Check `sudo systemctl show myapp \| grep Env`; `cat /etc/myapp/environment`; verify `EnvironmentFile=-` makes it optional |
| **"Failed to open file for writing: Permission denied"** | `ProtectSystem=strict` blocks write to path not in `ReadWritePaths=` | Add path to `ReadWritePaths=`; reload daemon; restart service |
| **Timer not firing** | Timer not enabled, missed due to Persistent=false, or clock wrong | `systemctl list-timers`; `systemctl status backup.timer`; `timedatectl` to check clock |
| **Service restart loop** | Crash in startup; `StartLimitBurst` exceeded | `journalctl -u myapp -n 100`; fix root cause; then `systemctl reset-failed myapp` before restarting |
| **Logs not appearing in journal** | App writes to a file instead of stdout/stderr | Set `StandardOutput=journal`; redirect app logging to stdout; or use `systemd-cat` as a pipe |
| **Drop-in not applied** | File in wrong directory, wrong extension, or daemon not reloaded | Must be in `/etc/systemd/system/<name>.service.d/`; must end in `.conf`; run `daemon-reload` |
| **Socket activation: service not starting on connection** | `Accept=false` set but service not calling `sd_listen_fds()` correctly | Check `LISTEN_FDS` env var; verify `ListenStream` address; `systemctl status myapp.socket` |
| **`systemctl cat` shows old unit** | `daemon-reload` not run after editing | `sudo systemctl daemon-reload` then verify with `systemctl cat` |
| **OOM-killer stops service** | `MemoryMax` too low, or system under memory pressure | `journalctl -k \| grep -i oom`; raise `MemoryMax=`; add swap; profile memory usage |
