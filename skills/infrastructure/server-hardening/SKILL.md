---
name: server-hardening
description: |
  Linux server security hardening covering CIS Benchmark areas: automatic security
  updates, AppArmor/SELinux MAC, auditd, intrusion detection, login security (PAM),
  network hardening sysctl, filesystem security, and service minimization.

  USE WHEN:
  - Hardening a new Ubuntu/Debian or RHEL/CentOS server before production use
  - Configuring automatic security updates with unattended-upgrades
  - Setting up auditd to track privilege escalation and file modifications
  - Enabling AppArmor enforcement or writing custom profiles
  - Running rkhunter or Wazuh for intrusion detection
  - Locking down PAM login policies (account lockout, password quality)
  - Auditing SUID/SGID binaries and open ports

  DO NOT USE FOR:
  - Application-layer WAF rules (use the waf skill instead)
  - Network firewall and UFW/iptables rules (use the firewall skill instead)
  - SSL/TLS certificate management (use the ssl-tls skill instead)
  - Container security (seccomp profiles, AppArmor with Docker — use the docker skill)
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---

# Server Hardening — Production Linux Security

## Hardening Philosophy

Apply the **principle of least privilege** at every layer:
- Services run as dedicated non-root users
- Only required ports are open
- Only required packages are installed
- All privilege changes are audited
- System is kept patched automatically

---

## Automatic Security Updates

### unattended-upgrades (Ubuntu/Debian)

```bash
sudo apt install -y unattended-upgrades update-notifier-common apt-listchanges
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

`/etc/apt/apt.conf.d/50unattended-upgrades`:
```
Unattended-Upgrade::Allowed-Origins {
    // Apply security updates from Ubuntu's security channel
    "${distro_id}:${distro_codename}-security";
    // Optional: ESM security updates (Ubuntu Pro)
    "UbuntuESMApps:${distro_codename}-apps-security";
    "UbuntuESM:${distro_codename}-infra-security";
};

// Automatically remove obsolete packages after upgrade
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Remove-New-Unused-Dependencies "true";

// Reboot automatically if required (kernel/libc updates)
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-WithUsers "false";
Unattended-Upgrade::Automatic-Reboot-Time "03:00";

// Email notification on errors
Unattended-Upgrade::Mail "ops@example.com";
Unattended-Upgrade::MailReport "on-change";

// Block packages that have failed for too long
Unattended-Upgrade::SyslogEnable "true";
Unattended-Upgrade::SyslogFacility "daemon";

// Split the upgrade into smaller batches to reduce memory pressure
Unattended-Upgrade::MinimalSteps "true";
```

`/etc/apt/apt.conf.d/20auto-upgrades`:
```
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Unattended-Upgrade "1";
```

```bash
# Test dry run — verify which packages would be upgraded
sudo unattended-upgrades --dry-run --debug

# Check service status
sudo systemctl status unattended-upgrades

# View upgrade log
sudo cat /var/log/unattended-upgrades/unattended-upgrades.log
```

`needrestart` — prompts (or automatically restarts) services after library upgrades:
```bash
sudo apt install -y needrestart
# Configure automatic restart mode (no prompt in CI/automated contexts):
sudo sed -i "s/#\$nrconf{restart} = 'i';/\$nrconf{restart} = 'a';/" /etc/needrestart/needrestart.conf
```

---

## SSH Hardening

`/etc/ssh/sshd_config.d/99-hardening.conf` (drop-in, overrides defaults):
```
# Disable root login entirely — use sudo from a named user account
PermitRootLogin no

# Disable password authentication — keys only
PasswordAuthentication no
ChallengeResponseAuthentication no

# Disable X11 forwarding unless required
X11Forwarding no

# Disable agent forwarding (prevents lateral movement via forwarded SSH agent)
AllowAgentForwarding no

# Limit login window (default 120s is excessive)
LoginGraceTime 30

# Maximum authentication attempts before disconnection
MaxAuthTries 3

# Restrict SSH to specific users or groups
AllowUsers deploy admin
# AllowGroups sshusers

# Use only strong algorithms
KexAlgorithms curve25519-sha256,curve25519-sha256@libssh.org,diffie-hellman-group16-sha512,diffie-hellman-group18-sha512
Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com
MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com

# Disable SSH protocol 1 (already default, but explicit is better)
Protocol 2

# Enable strict mode checking on key file permissions
StrictModes yes

# Log logins at verbose level (captures key fingerprints)
LogLevel VERBOSE

# Disable TCP port forwarding unless required
AllowTcpForwarding no
```

```bash
sudo sshd -t        # Test config before reloading
sudo systemctl reload sshd
```

---

## AppArmor (Ubuntu/Debian)

```bash
# Check status
sudo aa-status

# Put a profile in complain mode (log violations, do not enforce)
sudo aa-complain /usr/sbin/nginx

# Enforce a profile
sudo aa-enforce /usr/sbin/nginx

# Load all profiles in /etc/apparmor.d/
sudo apparmor_parser -r /etc/apparmor.d/

# View recent violations
sudo journalctl -k | grep apparmor | tail -30
# OR
sudo cat /var/log/kern.log | grep apparmor | tail -30
```

Custom AppArmor profile skeleton (`/etc/apparmor.d/usr.local.bin.myapp`):
```
#include <tunables/global>

/usr/local/bin/myapp {
  #include <abstractions/base>
  #include <abstractions/nameservice>

  # Read app files
  /opt/myapp/** r,

  # Write to log directory
  /var/log/myapp/ rw,
  /var/log/myapp/** rw,

  # Read config
  /etc/myapp/** r,

  # Network access (outbound only)
  network inet stream,

  # Deny everything else
  deny /** w,
}
```

---

## SELinux Basics (RHEL/CentOS/Fedora)

```bash
# Check enforcement status
getenforce         # Enforcing / Permissive / Disabled
sestatus           # Detailed status

# Temporarily set permissive (testing — does not persist reboot)
sudo setenforce 0

# Re-enable enforcement
sudo setenforce 1

# Persistent mode in /etc/selinux/config:
# SELINUX=enforcing

# Fix wrong file context (e.g., after moving files)
sudo restorecon -Rv /var/www/html/

# Generate allow rules from audit denials
sudo ausearch -m avc -ts recent | audit2allow -M mypolicy
sudo semodule -i mypolicy.pp

# View denials
sudo ausearch -m avc -ts recent
```

---

## auditd: System Call Auditing

```bash
sudo apt install -y auditd audispd-plugins
sudo systemctl enable --now auditd
```

`/etc/audit/rules.d/99-production.rules`:
```bash
# Delete all existing rules and start fresh
-D

# Set buffer size (increase if losing events during heavy load)
-b 8192

# Failure mode: 1=print to syslog, 2=panic
-f 1

# ── Authentication and Session Events ─────────────────────────────────────────
-w /etc/passwd -p wa -k identity
-w /etc/group -p wa -k identity
-w /etc/shadow -p wa -k identity
-w /etc/sudoers -p wa -k sudoers
-w /etc/sudoers.d/ -p wa -k sudoers

# Track sudo usage (execve of sudo binary)
-a always,exit -F arch=b64 -F path=/usr/bin/sudo -F perm=x -k sudo_usage
-a always,exit -F arch=b64 -F path=/usr/bin/su -F perm=x -k su_usage

# SSH login events
-w /var/log/auth.log -p wa -k auth_log
-w /etc/ssh/sshd_config -p wa -k sshd_config

# ── Privilege Escalation ───────────────────────────────────────────────────────
# Track setuid/setgid program execution
-a always,exit -F arch=b64 -S execve -F euid=0 -F auid>=1000 -F auid!=4294967295 -k root_commands

# ── File System Changes ────────────────────────────────────────────────────────
# Monitor critical system files
-w /etc/cron.d/ -p wa -k cron
-w /etc/crontab -p wa -k cron
-w /var/spool/cron/ -p wa -k cron
-w /etc/hosts -p wa -k hosts_file
-w /etc/hostname -p wa -k hostname_file

# Monitor module loading
-a always,exit -F arch=b64 -S init_module,finit_module,delete_module -k kernel_modules

# Monitor mount operations
-a always,exit -F arch=b64 -S mount -k mounts

# ── Network Connections ────────────────────────────────────────────────────────
-a always,exit -F arch=b64 -S socket -F a0=2 -k network_socket_ipv4
-a always,exit -F arch=b64 -S socket -F a0=10 -k network_socket_ipv6

# ── Make Rules Immutable (requires reboot to change) ─────────────────────────
-e 2
```

```bash
sudo augenrules --load
# Verify rules loaded
sudo auditctl -l

# Search audit log
sudo ausearch -k sudo_usage -ts today
sudo ausearch -k identity -ts recent

# Generate summary report
sudo aureport --summary
sudo aureport --failed --summary
sudo aureport -au --summary   # Authentication failures
```

---

## PAM Login Security

### Account Lockout After Failed Attempts

```bash
sudo apt install -y libpam-faillock
```

`/etc/security/faillock.conf`:
```ini
# Lock account after 5 failed attempts
deny = 5

# Unlock after 15 minutes (900 seconds)
unlock_time = 900

# Count failures for this many seconds
fail_interval = 900

# Also lock root account
even_deny_root = true

# Ignore users with UID below this (system accounts)
admin_group = wheel
```

Add to `/etc/pam.d/common-auth` (before `pam_unix.so`):
```
auth    required    pam_faillock.so preauth silent
auth    [success=1 default=bad]  pam_unix.so
auth    [default=die]   pam_faillock.so authfail
auth    sufficient  pam_faillock.so authsucc
```

Manage locked accounts:
```bash
# Check failed attempts for a user
faillock --user alice

# Reset (unlock) a user
faillock --user alice --reset
```

### Password Quality: pam_pwquality

```bash
sudo apt install -y libpam-pwquality
```

`/etc/security/pwquality.conf`:
```ini
minlen = 14
dcredit = -1      # Require at least 1 digit
ucredit = -1      # Require at least 1 uppercase
lcredit = -1      # Require at least 1 lowercase
ocredit = -1      # Require at least 1 special character
maxrepeat = 3     # Maximum 3 consecutive identical characters
gecoscheck = 1    # Disallow words from GECOS field (user info)
badwords = company myapp admin root
```

---

## Network Hardening Sysctl

Add to `/etc/sysctl.d/99-network-security.conf`:
```ini
# ── IP Forwarding ─────────────────────────────────────────────────────────────
# Disable if this server is NOT a router or VPN gateway
net.ipv4.ip_forward = 0
net.ipv6.conf.all.forwarding = 0

# ── ICMP Redirects ────────────────────────────────────────────────────────────
# Disable accepting ICMP redirect messages (routing change injection)
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0

# Disable sending ICMP redirects (not a router)
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0

# ── Source Routing ────────────────────────────────────────────────────────────
# Disable source routing (IP options spoofing)
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0

# ── Reverse Path Filtering ────────────────────────────────────────────────────
# Strict mode: drop packets with unexpected source addresses (anti-spoofing)
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1

# ── SYN Cookies ──────────────────────────────────────────────────────────────
# Protect against SYN flood attacks
net.ipv4.tcp_syncookies = 1

# ── ICMP ─────────────────────────────────────────────────────────────────────
# Log suspicious (martian) packets
net.ipv4.conf.all.log_martians = 1
net.ipv4.conf.default.log_martians = 1

# Ignore ICMP broadcast packets
net.ipv4.icmp_echo_ignore_broadcasts = 1

# ── Disable IPv6 (if not used) ────────────────────────────────────────────────
# net.ipv6.conf.all.disable_ipv6 = 1
# net.ipv6.conf.default.disable_ipv6 = 1
```

Apply: `sudo sysctl -p /etc/sysctl.d/99-network-security.conf`

---

## Filesystem Security

```bash
# Find all SUID/SGID binaries (audit regularly, especially after package installs)
sudo find / -xdev \( -perm -4000 -o -perm -2000 \) -type f -ls 2>/dev/null \
  | tee /root/suid_sgid_baseline.txt

# Compare against baseline next week:
sudo find / -xdev \( -perm -4000 -o -perm -2000 \) -type f -ls 2>/dev/null \
  | diff /root/suid_sgid_baseline.txt -

# Find world-writable files (excluding /proc, /sys, /tmp)
sudo find / -xdev -not \( -path /proc -prune \) -not \( -path /sys -prune \) \
  -perm -o+w -type f -ls 2>/dev/null

# Find unowned files (orphaned after package removal)
sudo find / -xdev \( -nouser -o -nogroup \) -ls 2>/dev/null

# Make critical system files immutable (even root cannot modify without removing flag)
sudo chattr +i /etc/passwd /etc/shadow /etc/group /etc/gshadow /etc/sudoers
# Remove immutable flag to make changes:
sudo chattr -i /etc/sudoers
# edit...
sudo chattr +i /etc/sudoers
```

Mount options for sensitive filesystems (`/etc/fstab`):
```fstab
# /tmp: no executables, no setuid, no device files
tmpfs  /tmp  tmpfs  defaults,nosuid,noexec,nodev,size=2G  0 0

# /var: no setuid, no device files
UUID=xxx  /var  ext4  defaults,nosuid,nodev  0 2

# /home: no executables, no setuid, no device files
UUID=xxx  /home  ext4  defaults,nosuid,noexec,nodev  0 2
```

---

## rkhunter — Rootkit Detection

```bash
sudo apt install -y rkhunter
sudo rkhunter --update            # Update signatures
sudo rkhunter --propupd           # Record current file properties as baseline
sudo rkhunter --check --skip-keypress  # Run check
sudo cat /var/log/rkhunter.log | grep -E 'Warning|Error'
```

Cron script `/etc/cron.weekly/rkhunter`:
```bash
#!/bin/bash
REPORT_EMAIL="ops@example.com"
LOGFILE="/var/log/rkhunter.log"

/usr/bin/rkhunter --update --nocolors --quiet
/usr/bin/rkhunter --check --nocolors --skip-keypress \
  --report-warnings-only \
  --logfile "$LOGFILE"

EXIT_CODE=$?

if [[ $EXIT_CODE -ne 0 ]]; then
  WARNINGS=$(grep -E 'Warning|Error' "$LOGFILE" | tail -30)
  echo -e "Subject: [ALERT] rkhunter warnings on $(hostname)\n\n$WARNINGS" \
    | sendmail "$REPORT_EMAIL"
fi
```

```bash
sudo chmod +x /etc/cron.weekly/rkhunter
```

`/etc/rkhunter.conf` — suppress known false positives:
```
PKGMGR=DPKG
SCRIPTWHITELIST=/usr/bin/lwp-request
ALLOWHIDDENDIR=/dev/.udev
ALLOWHIDDENFILE=/dev/.mdadm
```

---

## Service Minimization

```bash
# List all running services
systemctl list-units --type=service --state=running

# List all enabled services (start at boot)
systemctl list-unit-files --type=service --state=enabled

# Disable and mask services not needed
sudo systemctl disable --now bluetooth.service
sudo systemctl mask bluetooth.service     # Prevents re-enable

sudo systemctl disable --now avahi-daemon.service
sudo systemctl mask avahi-daemon.service

sudo systemctl disable --now cups.service
sudo systemctl mask cups.service

# Port audit
sudo ss -tlnp    # TCP listening ports + owning process
sudo ss -ulnp    # UDP listening ports + owning process

# Nmap self-scan (from same host)
sudo nmap -sV -O localhost
```

---

## Hardening Checklist (20 Points)

- [ ] 1. SSH: `PermitRootLogin no`, `PasswordAuthentication no`
- [ ] 2. SSH: `AllowUsers` / `AllowGroups` restricted to named accounts
- [ ] 3. SSH: Weak ciphers/MACs removed from sshd_config
- [ ] 4. Automatic security updates enabled (unattended-upgrades)
- [ ] 5. Automatic reboot scheduled (off-peak hours) for kernel updates
- [ ] 6. AppArmor enforcing for all installed profiles (`aa-status | grep processes in enforce`)
- [ ] 7. auditd installed and running with production rules
- [ ] 8. Sudo usage logged in auditd and/or `/var/log/auth.log`
- [ ] 9. PAM faillock: account lockout after 5 failed login attempts
- [ ] 10. PAM pwquality: minimum 14-character password with complexity
- [ ] 11. Network sysctl hardening applied (redirects, source routing, SYN cookies)
- [ ] 12. IP forwarding disabled (unless this is a router/VPN gateway)
- [ ] 13. `/tmp` mounted `nosuid,noexec,nodev`
- [ ] 14. `/home` mounted `nosuid,noexec,nodev`
- [ ] 15. SUID/SGID binary baseline recorded; unexpected additions alert
- [ ] 16. No world-writable files outside of `/tmp` and `/var/tmp`
- [ ] 17. rkhunter installed, baseline recorded, weekly cron configured
- [ ] 18. Unnecessary services disabled and masked
- [ ] 19. Port audit: only expected ports open (`ss -tlnp`)
- [ ] 20. All services run as dedicated non-root users with minimal directory access

---

## Anti-Patterns

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| Running application services as root | Exploited app grants full system access | Create dedicated user per service: `useradd --system --no-create-home myapp` |
| No automatic security updates | Known CVEs unpatched for months | Enable `unattended-upgrades` with security channel on day one |
| World-writable directories outside /tmp | Any process can drop files (local privilege escalation vector) | `find / -xdev -perm -o+w -type d` — remove write from others |
| No auditd | Breach investigation has no evidence trail | Install auditd with privilege escalation rules before going live |
| SUID binaries not inventoried | Attacker installs SUID shell backdoor undetected | Record baseline with `find / -perm -4000`; compare weekly |
| SSH password auth enabled on internet-facing server | Brute-force attacks possible | `PasswordAuthentication no` — key-only access |
| AppArmor in complain mode permanently | Complain mode logs but does not block attacks | Move to `aa-enforce` after testing period; use `aa-complain` only during development |
| Skipping `rkhunter --propupd` after package install | Every package upgrade triggers "Warning: file changed" false positives | Run `rkhunter --propupd` after every `apt upgrade` |
| `unattended-upgrades` set to upgrade all packages | Non-security updates can break application compatibility | Limit to `-security` origin only |

---

## Troubleshooting

| Symptom | Likely Cause | Diagnostic & Fix |
|---------|--------------|------------------|
| AppArmor blocking legitimate app | App accesses path not in profile | `journalctl -k | grep apparmor` → add rule to profile; reload with `apparmor_parser -r` |
| auditd causing high I/O / CPU | Too many audit rules or high syscall rate | Reduce rules scope; raise `-b` buffer; check `auditctl -s` for lost events |
| rkhunter false positives after upgrades | File hashes changed due to package update | Run `rkhunter --propupd` after each `apt upgrade` |
| `unattended-upgrades` breaks a package | Package update has incompatible change | Add to `Unattended-Upgrade::Package-Blacklist` in 50unattended-upgrades; pin version |
| Account not locking after failed logins | faillock not in PAM stack or wrong config file | `faillock --user alice` to check counters; verify PAM stack order in common-auth |
| SSH login blocked for valid user | AllowUsers doesn't include that user, or key not accepted | `sshd -T | grep allowusers`; check `~/.ssh/authorized_keys` permissions (must be 600) |
| `chattr +i` prevents sudo from editing `/etc/sudoers` | Immutable flag blocks all writes including root | `chattr -i /etc/sudoers`; edit; `chattr +i /etc/sudoers` |
| rkhunter reports hidden processes | Kernel module using unhide technique, or false positive from docker | `ps auxf` + `rkhunter --list hidden`; whitelist known false positive in `rkhunter.conf` |
