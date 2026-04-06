---
name: firewall
description: |
  Linux firewall configuration skill: UFW (Uncomplicated Firewall), iptables,
  nftables fundamentals, and fail2ban intrusion prevention.

  USE WHEN:
  - Setting up UFW on a new server (default deny-in, allow-out, selective port opens)
  - Configuring rate limiting and per-IP connection limits with UFW or iptables
  - Installing and tuning fail2ban for SSH, Nginx, and custom application jails
  - Writing iptables NAT rules (MASQUERADE for WireGuard/VPN, DNAT for port forwarding)
  - Diagnosing lockouts, fail2ban false positives, or blocked legitimate traffic
  - Setting up cloud security groups as the first layer of defence

  DO NOT USE FOR:
  - Application-level authentication / authorisation (use authentication skill)
  - SSL/TLS certificate management (use ssl-tls skill)
  - Kubernetes NetworkPolicy rules (use kubernetes skill)
  - WAF (Web Application Firewall) rules — Nginx rate limiting covers basic cases
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---

# Firewall Configuration — UFW, iptables, nftables, fail2ban

## Defence-in-Depth Model

A production server should have **at least two layers**:

1. **Cloud security group** — controls traffic at the hypervisor/VPC level; blocks reach the host NIC. Cheapest filter; stateful by default. Configure this first.
2. **Host-based firewall** (UFW / iptables / nftables) — applied by the kernel; catches port scans, limits rate of connections, enforces policy if security group is misconfigured.
3. **fail2ban** — bans IP addresses that show malicious behaviour patterns (too many auth failures, suspicious request patterns) by inserting iptables rules.

---

## UFW — Full Server Lockdown Sequence

Run this sequence on a fresh server before exposing it to the internet. **Keep your current SSH session open while testing — UFW changes take effect immediately.**

```bash
# 1. Install UFW (usually pre-installed on Ubuntu)
sudo apt-get install -y ufw

# 2. Set default policies — deny all inbound, allow all outbound
sudo ufw default deny incoming
sudo ufw default allow outgoing

# 3. Allow SSH BEFORE enabling UFW (otherwise you lock yourself out)
sudo ufw allow 22/tcp comment 'SSH'
# Or limit SSH to your own IP range:
sudo ufw allow from 203.0.113.0/24 to any port 22 proto tcp comment 'SSH from office'

# 4. Allow web traffic
sudo ufw allow 80/tcp  comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'

# 5. Allow other application ports as needed
sudo ufw allow 5432/tcp comment 'PostgreSQL — app subnet only'
# Better: restrict by source IP
sudo ufw allow from 10.0.1.0/24 to any port 5432 proto tcp comment 'PostgreSQL internal'

# 6. Enable UFW (prompts for confirmation)
sudo ufw enable

# 7. Verify status
sudo ufw status verbose
sudo ufw status numbered   # Shows rule numbers for easier deletion
```

---

## UFW Common Operations

```bash
# Remove a rule by number (get numbers from 'ufw status numbered')
sudo ufw delete 5

# Remove a rule by specification (exact match)
sudo ufw delete allow 80/tcp

# Rate-limit a port (UFW built-in: block IPs that connect > 6 times in 30s)
sudo ufw limit 22/tcp comment 'Rate-limit SSH brute force'

# Allow by named service (reads /etc/services)
sudo ufw allow smtp
sudo ufw allow 'Nginx Full'    # Application profile from /etc/ufw/applications.d/

# List available application profiles
sudo ufw app list
sudo ufw app info 'Nginx Full'

# Logging levels: off, low, medium, high, full
sudo ufw logging medium

# Reload (re-read rules without disabling)
sudo ufw reload

# Disable UFW completely
sudo ufw disable

# Reset to defaults (removes all rules)
sudo ufw reset

# Check UFW log
tail -f /var/log/ufw.log
journalctl -k | grep UFW
```

---

## iptables Fundamentals

UFW is a frontend to iptables. For advanced use cases (NAT, custom chains), work directly with iptables.

### Chains and Tables

| Table | Chains | Purpose |
|---|---|---|
| `filter` (default) | INPUT, FORWARD, OUTPUT | Accept / drop / reject packets |
| `nat` | PREROUTING, POSTROUTING, OUTPUT | Address and port translation |
| `mangle` | All five chains | Modify packet headers (TTL, QoS marks) |
| `raw` | PREROUTING, OUTPUT | Bypass connection tracking |

### Common iptables Commands

```bash
# List all rules with line numbers and counters
sudo iptables -L -n -v --line-numbers
sudo iptables -t nat -L -n -v          # NAT table

# Allow established/related connections (essential — add before deny rules)
sudo iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
sudo iptables -A INPUT -i lo -j ACCEPT                    # Allow loopback

# Allow specific port
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT

# Block a specific IP
sudo iptables -I INPUT -s 192.0.2.100 -j DROP

# Reject with ICMP (polite; informs sender)
sudo iptables -A INPUT -p tcp --dport 25 -j REJECT --reject-with tcp-reset

# Limit connection rate (SYN flood protection)
sudo iptables -A INPUT -p tcp --syn --dport 80 \
    -m connlimit --connlimit-above 20 -j REJECT

# Save rules persistently (package: iptables-persistent)
sudo apt-get install -y iptables-persistent
sudo netfilter-persistent save       # Saves to /etc/iptables/rules.v4 and rules.v6

# Restore saved rules
sudo netfilter-persistent reload

# Flush all rules (dangerous — default policy must be ACCEPT first)
sudo iptables -P INPUT ACCEPT
sudo iptables -F
sudo iptables -X
```

### NAT — MASQUERADE (WireGuard / VPN Gateway)

```bash
# Enable IP forwarding (also set in sysctl.d)
echo 'net.ipv4.ip_forward = 1' | sudo tee /etc/sysctl.d/50-ip-forward.conf
sudo sysctl -p /etc/sysctl.d/50-ip-forward.conf

# Masquerade VPN traffic going out via eth0
# (wg0 = WireGuard interface; eth0 = public internet interface)
sudo iptables -t nat -A POSTROUTING -s 10.8.0.0/24 -o eth0 -j MASQUERADE

# Allow forwarded traffic from VPN
sudo iptables -A FORWARD -i wg0 -j ACCEPT
sudo iptables -A FORWARD -o wg0 -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT

sudo netfilter-persistent save
```

### NAT — DNAT (Port Forwarding)

```bash
# Forward external :8080 to internal host 10.0.1.10:80
sudo iptables -t nat -A PREROUTING -p tcp --dport 8080 \
    -j DNAT --to-destination 10.0.1.10:80
sudo iptables -A FORWARD -p tcp -d 10.0.1.10 --dport 80 \
    -m conntrack --ctstate NEW,ESTABLISHED,RELATED -j ACCEPT
```

---

## nftables Basics

nftables is the successor to iptables (used by default on Debian 11+ and Ubuntu 22.04+). UFW still uses iptables-legacy by default on Ubuntu.

```bash
# Check if nftables is in use
sudo nft list ruleset

# Basic nftables configuration file: /etc/nftables.conf
cat > /etc/nftables.conf <<'NFTABLES'
#!/usr/sbin/nft -f
flush ruleset

table inet filter {
    chain input {
        type filter hook input priority 0; policy drop;

        iif lo accept comment "Allow loopback"
        ct state established,related accept comment "Allow established connections"
        ct state invalid drop comment "Drop invalid packets"

        tcp dport 22 accept comment "SSH"
        tcp dport { 80, 443 } accept comment "HTTP/HTTPS"

        # ICMP (allow ping)
        ip  protocol icmp   icmp type echo-request accept
        ip6 nexthdr  icmpv6 accept

        log prefix "nft-drop: " flags all counter drop
    }

    chain forward {
        type filter hook forward priority 0; policy drop;
    }

    chain output {
        type filter hook output priority 0; policy accept;
    }
}
NFTABLES

sudo systemctl enable --now nftables
sudo nft -f /etc/nftables.conf   # Apply immediately
```

---

## fail2ban — Complete Configuration

### Install

```bash
sudo apt-get install -y fail2ban
# Copy default config so updates don't overwrite your changes
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
```

### /etc/fail2ban/jail.local — Full Example

```ini
[DEFAULT]
# Global defaults (inherited by all jails unless overridden)
bantime   = 1h            # How long to ban (increase to 24h or 7d for repeat offenders)
findtime  = 10m           # Window in which maxretry failures trigger a ban
maxretry  = 5             # Number of failures before ban
ignoreip  = 127.0.0.1/8 ::1 10.0.0.0/8 203.0.113.0/24
            # ^ Whitelist: loopback, private network, office IP range
banaction = iptables-multiport
banaction_allports = iptables-allports
action    = %(action_mwl)s  # Ban + log + send email with whois/log context
# For email (requires mailutils): set destemail and sender
destemail = admin@example.com
sender    = fail2ban@example.com
mta       = sendmail

# --- SSH -------------------------------------------------------------------
[sshd]
enabled  = true
port     = ssh
filter   = sshd
logpath  = %(sshd_log)s
backend  = %(sshd_backend)s
maxretry = 3
bantime  = 24h

# --- Nginx: too many requests (from rate-limit log entries) ----------------
[nginx-req-limit]
enabled  = true
filter   = nginx-req-limit
port     = http,https
logpath  = /var/log/nginx/myapp.error.log
maxretry = 10
findtime = 1m
bantime  = 1h

# --- Nginx: authentication failures ----------------------------------------
[nginx-http-auth]
enabled  = true
filter   = nginx-http-auth
port     = http,https
logpath  = /var/log/nginx/myapp.error.log
maxretry = 5
bantime  = 6h

# --- Nginx: bad bots / scanners (4xx flooding) -----------------------------
[nginx-badbots]
enabled  = true
filter   = nginx-badbots
port     = http,https
logpath  = /var/log/nginx/myapp.access.log
maxretry = 2
bantime  = 24h
```

### Custom Filter — /etc/fail2ban/filter.d/nginx-req-limit.conf

```ini
[Definition]
# Matches Nginx error log lines produced by limit_req:
# 2024/01/15 12:34:56 [error] 12345#0: *1234 limiting requests, excess: 20.123
#                             by zone "api", client: 1.2.3.4, server: ...
failregex = ^\S+ \S+ \[error\] \d+#\d+: \*\d+ limiting requests, .+, client: <HOST>,
datepattern = %%Y/%%m/%%d %%H:%%M:%%S

[Init]
maxlines = 1
```

### Custom Filter — /etc/fail2ban/filter.d/nginx-http-auth.conf

```ini
[Definition]
# Matches Nginx error log lines for failed HTTP Basic auth
failregex = ^\S+ \S+ \[error\] \d+#\d+: \*\d+ no user/password was provided for basic authentication.+, client: <HOST>,
            ^\S+ \S+ \[error\] \d+#\d+: \*\d+ user "\S+" was not found in.+, client: <HOST>,
            ^\S+ \S+ \[error\] \d+#\d+: \*\d+ user "\S+": password mismatch.+, client: <HOST>,
datepattern = %%Y/%%m/%%d %%H:%%M:%%S
```

### fail2ban Management Commands

```bash
# Start / enable
sudo systemctl enable --now fail2ban

# Overall status
sudo fail2ban-client status

# Status of a specific jail
sudo fail2ban-client status sshd

# Manually ban an IP in a jail
sudo fail2ban-client set sshd banip 198.51.100.42

# Unban an IP from a specific jail
sudo fail2ban-client set sshd unbanip 198.51.100.42

# Unban from all jails
sudo fail2ban-client unban 198.51.100.42

# Reload fail2ban config (picks up jail.local changes)
sudo fail2ban-client reload

# Test a filter against a log file (invaluable for debugging regexes)
sudo fail2ban-regex \
    /var/log/nginx/myapp.error.log \
    /etc/fail2ban/filter.d/nginx-req-limit.conf \
    --print-all-matched

# Check what fail2ban has added to iptables
sudo iptables -L f2b-sshd -n -v
```

---

## Anti-Patterns

| Anti-pattern | Why it's harmful | Fix |
|---|---|---|
| `ufw allow from any to any` or allowing `0.0.0.0/0` on all ports | Effectively disables the firewall; any service binds to a port is reachable | Default deny incoming; allow only specific ports and source ranges |
| Not adding SSH allow rule before `ufw enable` | Locks yourself out immediately; requires console/KVM access | Always run `ufw allow 22/tcp` before `ufw enable` |
| No fail2ban on SSH port | SSH brute-force attempts run 24/7; eventually succeed with weak keys or if password auth is accidentally enabled | Install and enable the `[sshd]` fail2ban jail on every public server |
| fail2ban `ignoreip` not set | Your own IP could be banned during testing or after a scripting error | Always whitelist your management IP range in `ignoreip` |
| `bantime = 10m` (default) | Too short; determined attackers rotate through bans quickly | Set `bantime = 1h` minimum; use `bantime.increment = true` for repeat offenders |
| UFW disabled on cloud instances because "security groups are enough" | Security group misconfiguration or lateral movement from compromised instance on same SG bypasses cloud-level rules | Run both; host firewall is a safety net |
| Saving iptables rules with a script in `/etc/rc.local` | rc.local runs late in boot; firewall gap during startup; rules lost on `iptables -F` | Use `iptables-persistent` / `netfilter-persistent`; rules restored at network-up |
| nftables and iptables active simultaneously | Packets can match both rulesets; confusing interaction; double-counting | Choose one: either use UFW (iptables-nft backend) or native nftables, not both |
| fail2ban filter regex not tested before deployment | Typos cause the filter to never match — jail silently does nothing | Always run `fail2ban-regex <logfile> <filterfile>` before enabling a jail |
| Public-facing DB port (5432, 3306, 27017) open to `0.0.0.0/0` | Database exposed to the internet; brute-forced or default credentials exploited | Allow DB ports from application subnet IP range only |

---

## Troubleshooting

| Symptom | Likely cause | Diagnostic / Fix |
|---|---|---|
| **Locked out after `ufw enable`** | SSH rule not added before enabling | Recover via cloud console / out-of-band access; `ufw allow 22` and `ufw enable` again |
| **fail2ban not banning despite log matches** | Filter regex doesn't match log format, or `logpath` is wrong | Run `fail2ban-regex <logfile> <filterfile>`; verify `logpath` glob matches actual log files |
| **Legitimate users getting banned (false positives)** | `maxretry` too low, `findtime` too short, or shared NAT IP | Add their IP/range to `ignoreip`; raise `maxretry`; lengthen `findtime` |
| **Banned IP still connecting** | Ban inserted into iptables but not the right chain; or nftables in use while fail2ban uses iptables | `sudo iptables -L f2b-sshd -n`; switch fail2ban `banaction` to `nftables-multiport` if on nftables |
| **fail2ban service fails to start** | Syntax error in jail.local or filter file | `sudo fail2ban-client -x start`; `journalctl -u fail2ban -n 50` |
| **Port is open despite UFW `deny` rule** | Rule order matters; first matching rule wins; allow rule created before deny | `ufw status numbered`; delete the allow rule if deny should take precedence |
| **iptables rules lost after reboot** | Not persisted with `netfilter-persistent save` | `sudo netfilter-persistent save`; verify `/etc/iptables/rules.v4` |
| **UFW logging fills disk** | Logging level set to `full` on high-traffic server | Set `ufw logging low`; add `limit_req_log_level warn` in Nginx to reduce blocked request logging |
| **WireGuard clients can't reach internet after NAT setup** | IP forwarding disabled, or MASQUERADE rule on wrong interface | `sysctl net.ipv4.ip_forward`; verify interface name with `ip addr`; recheck `iptables -t nat -L POSTROUTING -n -v` |
