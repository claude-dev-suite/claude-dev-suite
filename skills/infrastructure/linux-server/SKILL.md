---
name: linux-server
description: |
  Linux (Ubuntu/Debian) server initial setup and ongoing administration skill.
  Covers new server hardening, user management, package management, file
  permissions, resource limits, log rotation, cron scheduling, and disk management.

  USE WHEN:
  - Performing initial setup of a fresh Ubuntu/Debian server (VPS, bare metal, cloud VM)
  - Hardening SSH, disabling root login, configuring sudo
  - Configuring system-level resource limits (ulimits, sysctl) for high-concurrency workloads
  - Managing users, groups, file permissions, and ACLs
  - Setting up log rotation, journald retention, swap, and NTP
  - Troubleshooting disk full, FD exhaustion, locale errors, or time drift

  DO NOT USE FOR:
  - Container-level administration (use docker or kubernetes skill)
  - Application deployment pipelines (use deployment-strategies or ci-cd skill)
  - Firewall/fail2ban configuration (use firewall skill)
  - Nginx or service configuration (use nginx or systemd skill)
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---

# Linux Server Administration (Ubuntu / Debian)

## New Server Setup Script

Save as `/root/setup-server.sh` on the new machine, run once as root, then delete it.

```bash
#!/usr/bin/env bash
# =============================================================================
# Production Server Initial Setup — Ubuntu 22.04 / 24.04 LTS
# Run as root immediately after first login.
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# 1. Variables — edit before running
# ---------------------------------------------------------------------------
NEW_USER="deploy"
SSH_PUBLIC_KEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA... user@workstation"
HOSTNAME="app-prod-01"
TIMEZONE="UTC"          # Or e.g. "America/New_York", "Europe/London"
SWAP_SIZE_GB=4          # Set to 0 to skip swap creation

# ---------------------------------------------------------------------------
# 2. Update package lists and apply security patches
# ---------------------------------------------------------------------------
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -q

# ---------------------------------------------------------------------------
# 3. Set hostname and /etc/hosts
# ---------------------------------------------------------------------------
hostnamectl set-hostname "$HOSTNAME"
# Ensure 127.0.1.1 resolves the hostname (required by some software)
if ! grep -q "$HOSTNAME" /etc/hosts; then
    echo "127.0.1.1  $HOSTNAME" >> /etc/hosts
fi

# ---------------------------------------------------------------------------
# 4. Set timezone
# ---------------------------------------------------------------------------
timedatectl set-timezone "$TIMEZONE"

# ---------------------------------------------------------------------------
# 5. Install essential packages
# ---------------------------------------------------------------------------
DEBIAN_FRONTEND=noninteractive apt-get install -y -q \
    curl wget git vim htop iotop net-tools dnsutils \
    unzip build-essential ca-certificates gnupg lsb-release \
    fail2ban ufw chrony logrotate unattended-upgrades apt-listchanges

# ---------------------------------------------------------------------------
# 6. Configure NTP with chrony
# ---------------------------------------------------------------------------
systemctl enable --now chrony
# Verify synchronisation (should show * on the active source)
chronyc sources -v || true

# ---------------------------------------------------------------------------
# 7. Create sudo user with SSH key access
# ---------------------------------------------------------------------------
if ! id -u "$NEW_USER" &>/dev/null; then
    adduser --disabled-password --gecos "" "$NEW_USER"
fi
usermod -aG sudo "$NEW_USER"

# Set up authorized_keys
SSH_DIR="/home/${NEW_USER}/.ssh"
mkdir -p "$SSH_DIR"
echo "$SSH_PUBLIC_KEY" > "${SSH_DIR}/authorized_keys"
chmod 700 "$SSH_DIR"
chmod 600 "${SSH_DIR}/authorized_keys"
chown -R "${NEW_USER}:${NEW_USER}" "$SSH_DIR"

# ---------------------------------------------------------------------------
# 8. Harden SSH
# ---------------------------------------------------------------------------
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak.$(date +%F)
cat > /etc/ssh/sshd_config.d/99-hardening.conf <<'SSHD_CONF'
PermitRootLogin no
PasswordAuthentication no
ChallengeResponseAuthentication no
PubkeyAuthentication yes
X11Forwarding no
AllowTcpForwarding no
MaxAuthTries 3
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2
SSHD_CONF
systemctl reload sshd

# ---------------------------------------------------------------------------
# 9. Configure unattended security upgrades
# ---------------------------------------------------------------------------
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'APT_CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
APT_CONF'

cat > /etc/apt/apt.conf.d/50unattended-upgrades <<'APT_UU'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrade::Mail "root";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Automatic-Reboot "false";
APT_UU

# ---------------------------------------------------------------------------
# 10. Create swap file
# ---------------------------------------------------------------------------
if [[ "$SWAP_SIZE_GB" -gt 0 ]] && ! swapon --show | grep -q /swapfile; then
    fallocate -l "${SWAP_SIZE_GB}G" /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    # Reduce swappiness for applications (default is 60)
    echo 'vm.swappiness=10' > /etc/sysctl.d/60-swap.conf
    sysctl -p /etc/sysctl.d/60-swap.conf
fi

# ---------------------------------------------------------------------------
# 11. Apply kernel tuning (idempotent — see sysctl.d section below)
# ---------------------------------------------------------------------------
cp /dev/stdin /etc/sysctl.d/99-production.conf <<'SYSCTL'
# Network performance
net.core.somaxconn = 65535
net.core.netdev_max_backlog = 65536
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_keepalive_time = 300
net.ipv4.tcp_keepalive_intvl = 30
net.ipv4.tcp_keepalive_probes = 5
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1

# File system
fs.file-max = 2097152
fs.inotify.max_user_watches = 524288

# Virtual memory
vm.swappiness = 10
vm.dirty_ratio = 15
vm.dirty_background_ratio = 5
SYSCTL
sysctl --system

echo ""
echo "=== Setup complete. Log in as '${NEW_USER}' via SSH key before closing this session. ==="
```

---

## sysctl.d Production Tuning Reference

The file above (`/etc/sysctl.d/99-production.conf`) covers the most impactful parameters. Apply changes live without rebooting:

```bash
sudo sysctl --system       # Reload all files in /etc/sysctl.d/
sudo sysctl -p /etc/sysctl.d/99-production.conf  # Reload specific file

# Verify a parameter
sudo sysctl net.core.somaxconn
```

---

## /etc/security/limits.conf — High-Concurrency App

```
# /etc/security/limits.conf
# Changes take effect on next login (not on running processes).

# Application service user (e.g., node app running as 'deploy')
deploy   soft   nofile   65535
deploy   hard   nofile   65535
deploy   soft   nproc    8192
deploy   hard   nproc    8192

# Root (required if app runs as root — avoid this)
root     soft   nofile   65535
root     hard   nofile   65535

# Wildcard fallback for all other users
*        soft   nofile   65535
*        hard   nofile   65535
```

For systemd services, `LimitNOFILE` in the unit file takes precedence over `/etc/security/limits.conf`. Set both.

Verify effective limits of a running process:

```bash
# PID of your app:
cat /proc/$(pgrep -o node)/limits
```

---

## Package Management

```bash
# Update package lists
sudo apt-get update

# Upgrade all packages (non-interactive)
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y

# Install specific package
sudo apt-get install -y nginx

# Remove package and its config files
sudo apt-get purge -y apache2 && sudo apt-get autoremove -y

# Hold a package at its current version (prevent unattended upgrades)
sudo apt-mark hold nginx
sudo apt-mark unhold nginx
sudo apt-mark showhold

# List installed packages
dpkg -l | grep nginx

# Show available versions
apt-cache policy nginx

# Find which package provides a file
dpkg -S /usr/sbin/nginx
apt-file search /usr/sbin/nginx  # needs apt-file package
```

---

## File Permissions

```bash
# Symbolic mode: u=user, g=group, o=others, a=all; r=4, w=2, x=1
chmod 755 /var/www/myapp          # rwxr-xr-x — directory traversable by all
chmod 644 /var/www/myapp/app.js   # rw-r--r--  — file readable by all
chmod 600 /etc/app/secret.env     # rw-------  — private config file
chmod -R 750 /opt/myapp           # Recursive; all files/dirs get 750

# Ownership
chown www-data:www-data /var/www/myapp
chown -R deploy:deploy /opt/myapp

# umask: determines default permissions for new files
# Default 022 → new files 644, new dirs 755
# For private app dirs, set umask 027 in the service unit's EnvironmentFile

# ACL — grant extra access without changing ownership
sudo apt-get install -y acl
sudo setfacl -m u:deploy:rwX /var/log/myapp     # User deploy gets rwX
sudo setfacl -m g:developers:rX /var/log/myapp  # Group developers read only
sudo setfacl -d -m u:deploy:rwX /var/log/myapp  # Default ACL for new files in dir
sudo getfacl /var/log/myapp                      # View current ACL
```

---

## logrotate — Application Log Config

Create `/etc/logrotate.d/myapp`:

```
/var/log/myapp/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 deploy www-data
    sharedscripts
    postrotate
        # Signal app to reopen log file handles
        systemctl kill -s USR1 myapp.service || true
    endscript
}
```

```bash
# Test logrotate config without actually rotating
sudo logrotate --debug /etc/logrotate.d/myapp

# Force rotation immediately (useful after config changes)
sudo logrotate --force /etc/logrotate.d/myapp
```

---

## journald Retention Limits

```
# /etc/systemd/journald.conf.d/size-limits.conf
[Journal]
SystemMaxUse=2G          # Maximum total disk usage for persistent journals
SystemKeepFree=500M      # Minimum free space to leave on the volume
MaxFileSec=1month        # Rotate journal files older than 1 month
MaxRetentionSec=3months  # Delete journal entries older than 3 months
```

```bash
sudo systemctl restart systemd-journald
# Show current journal disk usage
journalctl --disk-usage
# Manually vacuum old entries
sudo journalctl --vacuum-time=90d
sudo journalctl --vacuum-size=1G
```

---

## User Management

```bash
# Create a new system user (no login shell, for running services)
sudo adduser --system --group --no-create-home --shell /usr/sbin/nologin appuser

# Create a regular user interactively
sudo adduser alice

# Add to a group
sudo usermod -aG sudo alice     # Add alice to sudo group
sudo usermod -aG docker alice   # Add to docker group (takes effect on next login)

# Show group memberships
groups alice
id alice

# Lock/unlock account (prevents password login)
sudo passwd -l alice
sudo passwd -u alice

# Expire password (force change on next login)
sudo chage -d 0 alice

# Edit sudoers safely (always use visudo)
sudo visudo

# Grant passwordless sudo for specific command only (add to /etc/sudoers.d/deploy)
echo 'deploy ALL=(ALL) NOPASSWD: /bin/systemctl restart myapp' \
    | sudo tee /etc/sudoers.d/deploy-restart
sudo chmod 440 /etc/sudoers.d/deploy-restart
```

---

## cron Scheduling

```bash
# Edit crontab for current user
crontab -e

# Edit crontab for another user
sudo crontab -u deploy -e

# Cron expression format:
# ┌── minute (0-59)
# │  ┌── hour (0-23)
# │  │  ┌── day of month (1-31)
# │  │  │  ┌── month (1-12)
# │  │  │  │  ┌── day of week (0=Sun, 7=Sun)
# │  │  │  │  │
# *  *  *  *  *  command
0  3  *  *  *  /opt/myapp/scripts/backup.sh >> /var/log/myapp/backup.log 2>&1
*/15 * * * *   /usr/bin/healthcheck.sh
0  0  1  *  *  /usr/sbin/certbot renew --quiet

# System-wide cron directories (no crontab syntax — file name is not significant)
ls /etc/cron.{hourly,daily,weekly,monthly}/

# Run a one-off command at a specific time
echo "/opt/scripts/maintenance.sh" | at 02:00 tomorrow
atq    # List pending at jobs
atrm 3 # Remove job #3
```

---

## Disk Management

```bash
# Disk space overview
df -hT                    # Human-readable, with filesystem type
df -ih                    # inode usage (relevant when disk shows space but can't write)

# Find large files / directories
du -sh /var/log/*         # Size of each log dir
du -ah /var/log | sort -rh | head -20

# Block device layout (partitions, mount points, sizes)
lsblk -f                  # With filesystem types and UUIDs
blkid                     # UUIDs and filesystem types only

# Mount a new volume
sudo mkfs.ext4 /dev/sdb1
sudo mkdir -p /data
sudo mount /dev/sdb1 /data

# Persist mount in /etc/fstab (use UUID, not device name)
UUID=$(blkid -s UUID -o value /dev/sdb1)
echo "UUID=$UUID  /data  ext4  defaults,noatime  0  2" | sudo tee -a /etc/fstab
sudo mount -a   # Test fstab without rebooting

# Resize ext4 filesystem after volume expansion (e.g., cloud disk resize)
sudo resize2fs /dev/sda1   # Online resize — no unmount needed on ext4 with kernel ≥ 2.6

# Check filesystem for errors (unmounted)
sudo fsck -n /dev/sdb1     # Dry run — no changes

# Find which process has a deleted file open (common cause of "disk full" despite empty dirs)
sudo lsof | grep '(deleted)' | awk '{print $7, $1, $2}' | sort -rn | head -20
# Kill or restart that process to release the space
```

---

## Anti-Patterns

| Anti-pattern | Why it's harmful | Fix |
|---|---|---|
| Running the application as root | Root process compromise = full system compromise | Create a dedicated low-privilege service user; use `User=` in systemd unit |
| No swap configured | OOM killer terminates processes without warning on memory spikes | Create and mount `/swapfile`; set `vm.swappiness=10` |
| No log rotation | Logs fill the disk; service crashes with no space left | Add `/etc/logrotate.d/myapp` with `compress`, `rotate 14`, `daily` |
| Timezone not set (default UTC may be fine but implicit) | Log timestamps ambiguous when comparing with client logs | Run `timedatectl set-timezone` on every server |
| Password SSH auth enabled | Brute-force attacks succeed with weak passwords | `PasswordAuthentication no` in sshd_config; key-only access |
| `PermitRootLogin yes` | Direct root login bypasses audit trail | `PermitRootLogin no`; use sudo from named user |
| Not using `unattended-upgrades` | Security patches not applied; server stays vulnerable | Enable and configure `unattended-upgrades` for security repos |
| ulimit not raised for app user | App hits default 1024 FD limit → "too many open files" errors under load | Set `LimitNOFILE` in systemd unit AND in `/etc/security/limits.conf` |
| Ignoring `df -ih` (inode usage) | Disk reports free space but writes fail because inodes exhausted | Monitor inode usage: `df -ih`; clean up small file accumulation |
| Global `chmod -R 777` to "fix permissions" | Every user and process can write to the directory — data destruction risk | Identify which user needs access and use `chown` + `chmod 750` or ACLs |

---

## Troubleshooting

| Symptom | Likely cause | Diagnostic / Fix |
|---|---|---|
| **Disk full** | Logs, core dumps, or deleted-but-open files | `df -h`; `du -ah / --max-depth=3 \| sort -rh \| head`; `lsof \| grep deleted` |
| **"Too many open files"** | Process hit FD limit (`ulimit -n`) | `cat /proc/$(pgrep -o myapp)/limits`; raise `LimitNOFILE` in unit file |
| **"cannot set locale"** | Missing locale package or LANG mismatch | `locale -a`; `sudo locale-gen en_US.UTF-8`; `update-locale LANG=en_US.UTF-8` |
| **Time drift / NTP not working** | chrony not running, or firewall blocking UDP 123 | `chronyc tracking`; `systemctl status chrony`; check UFW rules for UDP 123 |
| **`sudo` asks for password for deploy user** | User in sudoers but no NOPASSWD rule | Add `deploy ALL=(ALL) NOPASSWD: ALL` in `/etc/sudoers.d/deploy` (scope it tightly) |
| **Can't SSH after sshd_config change** | Syntax error or PermitRootLogin disabled with no other user | Always test: `sshd -t`; keep a second SSH session open before reloading |
| **unattended-upgrades not running** | Service disabled or config typo | `systemctl status unattended-upgrades`; `unattended-upgrade --debug` |
| **Swap not being used** | `vm.swappiness=0` or swap not mounted | `free -h`; `swapon --show`; `sysctl vm.swappiness` |
| **cron job not running** | Permission error, wrong PATH, or no output | Check `/var/log/syslog` for cron entries; redirect output to log file; use absolute paths |
| **resize2fs "Device or resource busy"** | Trying to resize a mounted ext2/3 filesystem | ext4 supports online resize; for others, boot from rescue mode |

---

## Essential Commands Cheat-Sheet

```bash
# Process management
ps aux --sort=-%mem | head -20  # Top memory consumers
top -b -n1 | head -20           # Snapshot of all processes
kill -9 <pid>                   # Force-kill
pkill -u deploy                 # Kill all processes of a user

# Network
ss -tlnp          # TCP listening sockets with PID
ss -s             # Socket summary
netstat -tulpn    # Alternative (older)
ip addr           # Interface addresses
ip route          # Routing table

# Memory
free -h           # RAM and swap usage
vmstat -s         # Detailed memory stats
cat /proc/meminfo

# Load average
uptime
w
sar -u 1 5        # CPU utilisation every 1s for 5 samples (sysstat package)

# Who is logged in
who
last | head -20   # Login history

# Find recently modified files
find /etc -newer /etc/passwd -type f 2>/dev/null | head -20

# Check open ports
ss -tlnp | awk 'NR>1 {print $4, $6}'

# Check failed login attempts
journalctl -u ssh --since "1 hour ago" | grep Failed
grep 'Failed password' /var/log/auth.log | tail -20
```
