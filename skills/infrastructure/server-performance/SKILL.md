---
name: server-performance
description: |
  Linux server and application-layer performance tuning for production workloads,
  covering kernel networking parameters, file descriptor limits, Nginx worker config,
  database connection pooling (PgBouncer), I/O scheduler tuning, and profiling tools.

  USE WHEN:
  - Tuning kernel sysctl parameters for high-concurrency web servers
  - Increasing file descriptor limits for Nginx, Node.js, or Postgres
  - Configuring Nginx worker settings for optimal throughput
  - Setting up PgBouncer as a Postgres connection pool
  - Diagnosing high TIME_WAIT, OOM kills, or disk I/O bottlenecks
  - Tuning vm.swappiness, dirty ratios, and I/O schedulers for SSD servers
  - Profiling with perf, strace, or flamegraphs

  DO NOT USE FOR:
  - Application-level code profiling (use language-specific profiling tools)
  - Kubernetes resource requests/limits (use the kubernetes skill)
  - Network interface bonding or VLAN configuration
  - Windows Server performance tuning
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---

# Server Performance Tuning — Production Linux

## Performance Tuning Checklist

Before tuning, always establish a baseline:
```bash
# Baseline snapshot
ss -s                              # Socket summary
cat /proc/sys/net/core/somaxconn   # Current connection backlog
ulimit -n                          # File descriptor limit (per-process)
cat /proc/sys/fs/file-max          # Global fd limit
free -h                            # Memory/swap
swapon --show                      # Active swap
cat /sys/block/sda/queue/scheduler # I/O scheduler
```

---

## Kernel / Network Tuning via sysctl

`/etc/sysctl.d/99-production.conf`:
```ini
# ── Connection Backlog ────────────────────────────────────────────────────────
# Maximum number of connections that can be queued for acceptance
# Default: 4096 (Ubuntu 22.04). Match this to Nginx worker_connections.
net.core.somaxconn = 65535

# Maximum number of packets in the kernel's receive queue per NIC
net.core.netdev_max_backlog = 65535

# Maximum number of SYN requests in the half-open connection queue
net.ipv4.tcp_max_syn_backlog = 65535

# ── TIME_WAIT Tuning ──────────────────────────────────────────────────────────
# Reduce TIME_WAIT timeout from 60s to 30s
# Note: Cannot go below ~15s safely (RFC recommends 2*MSL)
net.ipv4.tcp_fin_timeout = 30

# Allow reuse of TIME_WAIT sockets for new outgoing connections
# Safe for servers that are not load balancers
net.ipv4.tcp_tw_reuse = 1

# ── Ephemeral Ports ───────────────────────────────────────────────────────────
# Default range: 32768-60999. Expand for high-outbound-connection servers.
net.ipv4.ip_local_port_range = 1024 65535

# ── TCP Keepalive ─────────────────────────────────────────────────────────────
# Start keepalive probes after 60s idle (default: 7200s = 2 hours)
net.ipv4.tcp_keepalive_time = 60

# Interval between keepalive probes
net.ipv4.tcp_keepalive_intvl = 10

# Number of failed probes before declaring connection dead
net.ipv4.tcp_keepalive_probes = 6

# ── Memory ───────────────────────────────────────────────────────────────────
# Swappiness: 10 is appropriate for SSD-based servers with sufficient RAM.
# Set to 1 for Redis/memory-intensive services, NOT to 0 (may cause OOM issues).
vm.swappiness = 10

# dirty_ratio: % of RAM that can be dirty before processes are forced to write
# Reduce for databases to avoid sudden I/O stalls (default: 20)
vm.dirty_ratio = 10

# dirty_background_ratio: % at which background writeback starts (default: 5)
vm.dirty_background_ratio = 3

# ── File Descriptors ──────────────────────────────────────────────────────────
# Global kernel limit for open file handles
fs.file-max = 2097152

# ── Network Receive Buffers ───────────────────────────────────────────────────
# Increase receive/send buffer maximums for high-throughput servers
net.core.rmem_max = 134217728
net.core.wmem_max = 134217728
net.ipv4.tcp_rmem = 4096 87380 134217728
net.ipv4.tcp_wmem = 4096 65536 134217728

# ── Connection Tracking (if firewall/NAT in use) ──────────────────────────────
# Increase conntrack table size to avoid "nf_conntrack: table full" errors
net.netfilter.nf_conntrack_max = 1048576
net.netfilter.nf_conntrack_tcp_timeout_established = 300
```

Apply immediately:
```bash
sudo sysctl -p /etc/sysctl.d/99-production.conf
# Verify
sysctl net.core.somaxconn net.ipv4.tcp_fin_timeout vm.swappiness
```

---

## File Descriptor (ulimit) Configuration

### System-wide: `/etc/security/limits.conf`
```
# Syntax: <domain> <type> <item> <value>
# * applies to all users except root
*               soft    nofile          65535
*               hard    nofile          65535
root            soft    nofile          65535
root            hard    nofile          65535
www-data        soft    nofile          1048576
www-data        hard    nofile          1048576
postgres        soft    nofile          65535
postgres        hard    nofile          65535
```

Requires PAM `pam_limits.so` to be active (enabled by default on Ubuntu). Verify:
```bash
sudo -u www-data bash -c 'ulimit -n'
```

### Per-Service Systemd Override

`/etc/systemd/system/nginx.service.d/limits.conf`:
```ini
[Service]
LimitNOFILE=1048576
```

`/etc/systemd/system/postgresql.service.d/limits.conf`:
```ini
[Service]
LimitNOFILE=65535
LimitNPROC=65535
```

```bash
sudo systemctl daemon-reload
sudo systemctl restart nginx
# Verify nginx sees the new limit
cat /proc/$(pgrep -o nginx)/limits | grep 'open files'
```

---

## Nginx Performance Configuration

`/etc/nginx/nginx.conf` (worker and global section):
```nginx
# Match CPU core count; "auto" sets it automatically
worker_processes auto;

# Increase from default 1024. Match fs.file-max / worker_processes.
worker_rlimit_nofile 65535;

events {
    # Number of simultaneous connections per worker process
    # Total capacity: worker_processes * worker_connections
    worker_connections 16384;

    # Use epoll on Linux for efficient I/O multiplexing
    use epoll;

    # Accept multiple connections per epoll event (reduces syscall overhead)
    multi_accept on;
}

http {
    # Send file data directly from kernel buffer (zero-copy)
    sendfile on;

    # Bundle response headers with first data packet (requires sendfile)
    tcp_nopush on;

    # Reduce latency on small packets by disabling Nagle's algorithm
    tcp_nodelay on;

    # Keep connections open for 30 requests or 65 seconds, whichever comes first
    keepalive_timeout 65;
    keepalive_requests 1000;

    # Cache open file descriptors (avoids repeated open()/stat() calls)
    open_file_cache max=10000 inactive=30s;
    open_file_cache_valid 60s;
    open_file_cache_min_uses 2;
    open_file_cache_errors on;

    # Compress text responses (substantial bandwidth saving)
    gzip on;
    gzip_comp_level 2;           # Level 2 is sweet spot for CPU vs ratio
    gzip_min_length 1024;
    gzip_types text/plain text/css text/javascript application/json
               application/javascript text/xml application/xml;

    # Upstream keepalive (for proxy_pass to app servers)
    upstream app_backend {
        server 127.0.0.1:3000;
        server 127.0.0.1:3001;
        keepalive 64;            # Persist 64 idle connections to backend
    }

    server {
        location / {
            proxy_pass http://app_backend;
            proxy_http_version 1.1;   # Required for keepalive to backend
            proxy_set_header Connection "";
        }
    }
}
```

Test and reload:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## PgBouncer: PostgreSQL Connection Pooling

Postgres creates a new OS process per connection (~5–10 MB RAM). At 500 connections that is 2.5–5 GB overhead before a single query runs. PgBouncer multiplexes client connections onto a small pool of real server connections.

### Pool Modes

| Mode | Description | Best For |
|------|-------------|----------|
| `session` | Server connection held for lifetime of client session | Legacy apps that use session-level state |
| `transaction` | Server connection returned to pool after each transaction | **Recommended** for most stateless web apps |
| `statement` | Server connection returned after each statement | Only when no multi-statement transactions used |

`/etc/pgbouncer/pgbouncer.ini`:
```ini
[databases]
# Format: <pgbouncer_db_name> = host=<pg_host> port=<pg_port> dbname=<real_db>
myapp = host=127.0.0.1 port=5432 dbname=myapp_production

[pgbouncer]
listen_addr = 127.0.0.1
listen_port = 6432

auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt

pool_mode = transaction

# Maximum client connections PgBouncer will accept
max_client_conn = 1000

# Number of real Postgres connections per database/user pair
default_pool_size = 20

# Reserve pool for emergencies (used when default pool exhausted)
reserve_pool_size = 5

# After this many seconds, reserve pool kicks in
reserve_pool_timeout = 3

# Kill idle server connections after N seconds of inactivity
server_idle_timeout = 600

# Maximum age of server connection before forced recycling (detects schema changes)
server_lifetime = 3600

# Maximum time to wait for a connection from pool before error
pool_mode_timeout = 30

# Log connections
log_connections = 0        # Set to 1 during debugging only
log_disconnections = 0
log_pooler_errors = 1

# Admin interface
admin_users = postgres
stats_users = monitoring_user

# PID file and socket
pidfile = /var/run/pgbouncer/pgbouncer.pid
unix_socket_dir = /var/run/pgbouncer
```

`/etc/pgbouncer/userlist.txt` (md5 hash of password):
```
"myapp_user" "md5HASH_OF_PASSWORD"
```
Generate: `echo -n 'PASSWORDmyapp_user' | md5sum | awk '{print "md5"$1}'`

```bash
sudo systemctl enable --now pgbouncer
# Connect through PgBouncer (port 6432 instead of 5432)
psql -h 127.0.0.1 -p 6432 -U myapp_user myapp
# Check pool stats
psql -h 127.0.0.1 -p 6432 -U postgres pgbouncer -c "SHOW POOLS;"
psql -h 127.0.0.1 -p 6432 -U postgres pgbouncer -c "SHOW STATS;"
```

---

## Memory: Transparent Huge Pages

THP causes latency spikes in databases (Redis, MongoDB, PostgreSQL) due to compaction pauses.

```bash
# Check current status
cat /sys/kernel/mm/transparent_hugepage/enabled

# Disable for current session
echo never | sudo tee /sys/kernel/mm/transparent_hugepage/enabled
echo never | sudo tee /sys/kernel/mm/transparent_hugepage/defrag

# Persist across reboots — add to /etc/rc.local or a systemd oneshot unit
```

`/etc/systemd/system/disable-thp.service`:
```ini
[Unit]
Description=Disable Transparent Huge Pages
DefaultDependencies=no
After=sysinit.target local-fs.target
Before=basic.target

[Service]
Type=oneshot
ExecStart=/bin/sh -c 'echo never > /sys/kernel/mm/transparent_hugepage/enabled'
ExecStart=/bin/sh -c 'echo never > /sys/kernel/mm/transparent_hugepage/defrag'
RemainAfterExit=yes

[Install]
WantedBy=basic.target
```

---

## OOM Killer Tuning

```bash
# Check OOM score of a process (higher = more likely to be killed)
cat /proc/$(pgrep postgres)/oom_score

# Protect critical processes from being OOM-killed (-1000 = never kill)
echo -1000 | sudo tee /proc/$(pgrep postgres)/oom_score_adj

# Set in systemd unit to persist across restarts:
# [Service]
# OOMScoreAdjust = -900    # Range: -1000 (never kill) to +1000 (kill first)
```

NUMA (on multi-socket servers):
```bash
# Check NUMA topology
numactl --hardware

# Bind process to NUMA node 0 and its local memory
numactl --cpunodebind=0 --membind=0 -- /usr/bin/postgres -D /var/lib/postgresql/16/main
```

---

## CPU: Scheduling and Affinity

```bash
# Change I/O priority of a process (ionice class: 1=realtime, 2=best-effort, 3=idle)
sudo ionice -c 2 -n 0 -p $(pgrep backup-script)

# Change CPU scheduling priority (nice: -20=highest, 19=lowest)
sudo renice -n -5 -p $(pgrep postgres)

# Pin process to specific CPU cores (reduce cache invalidation)
sudo taskset -cp 0,1 $(pgrep -o nginx)

# Set CPU frequency governor to "performance" (disable power-saving for latency-sensitive)
echo performance | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor
```

---

## Disk I/O Tuning

### I/O Scheduler
```bash
# Check available schedulers
cat /sys/block/sda/queue/scheduler
# [none] mq-deadline kyber bfq  ← brackets show active

# For NVMe SSDs: "none" is best (hardware queue handles ordering)
echo none | sudo tee /sys/block/nvme0n1/queue/scheduler

# For SATA SSD: "mq-deadline" gives good latency
echo mq-deadline | sudo tee /sys/block/sda/queue/scheduler

# For HDDs with mixed workloads: "bfq" (Budget Fair Queuing)
echo bfq | sudo tee /sys/block/sda/queue/scheduler

# Persist via udev rule (/etc/udev/rules.d/60-io-scheduler.rules):
# ACTION=="add|change", KERNEL=="nvme[0-9]*", ATTR{queue/scheduler}="none"
# ACTION=="add|change", KERNEL=="sd[a-z]", ATTR{queue/rotational}=="0", ATTR{queue/scheduler}="mq-deadline"
```

### Mount Options

`/etc/fstab` — add `noatime` for read-heavy filesystems (eliminates access time writes):
```fstab
UUID=xxxx  /var/lib/postgresql  ext4  defaults,noatime  0 2
UUID=xxxx  /var/www             ext4  defaults,noatime  0 2
```

```bash
# Remount without rebooting
sudo mount -o remount,noatime /var/lib/postgresql

# Enable periodic TRIM for SSDs (runs weekly by default on Ubuntu)
sudo systemctl enable fstrim.timer
sudo systemctl start fstrim.timer
# Manual trim
sudo fstrim -v /
```

---

## Performance Profiling Tools

```bash
# perf top — live flame of kernel + userspace (requires linux-tools)
sudo perf top -g

# Record 30s of CPU activity for process
sudo perf record -g -p $(pgrep -o myapp) -o /tmp/perf.data -- sleep 30
sudo perf report -i /tmp/perf.data

# strace — trace syscalls (high overhead, use only on dev/staging or briefly in prod)
sudo strace -p $(pgrep -o myapp) -e trace=network,file -T 2>&1 | head -100

# ltrace — trace library calls
sudo ltrace -p $(pgrep -o myapp) -c 2>&1    # summary mode, lower overhead

# lsof — list open files and sockets for a process
sudo lsof -p $(pgrep -o myapp) | wc -l      # Count open fds
sudo lsof -p $(pgrep -o myapp) | grep TCP   # TCP connections
```

---

## Before/After Comparison: Connection Handling

| Scenario | Default Config | Tuned Config |
|----------|---------------|--------------|
| `net.core.somaxconn` | 4096 | 65535 |
| Max Nginx connections (4 workers) | 4 × 1024 = 4096 | 4 × 16384 = 65536 |
| Postgres connections (per process, no pooling) | 100 connections, ~500 MB overhead | PgBouncer pool_size=20, ~100 MB, 1000 clients |
| TIME_WAIT socket clearing | 60 seconds | 30 seconds |
| Ephemeral port range | 32768–60999 (28,231 ports) | 1024–65535 (64,511 ports) |
| Per-process file descriptors (Nginx) | 1024 (default ulimit) | 65535 (limits.conf) |

---

## Anti-Patterns

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| `vm.swappiness=60` on SSD servers | OS aggressively swaps RAM-resident hot data to SSD, adding latency | Set `vm.swappiness=10` for general servers, `1` for databases |
| No connection pooling for Postgres | Each client holds a Postgres process (~5–10 MB RAM + context switches) | Deploy PgBouncer in transaction mode in front of Postgres |
| `worker_processes 1` in Nginx | Single Nginx worker can't saturate multi-core CPU | Set `worker_processes auto` |
| Transparent Huge Pages enabled for Redis/MongoDB | THP compaction causes 100ms+ latency spikes | Disable THP via systemd oneshot unit |
| `open_file_cache` disabled | Nginx does open()/stat() on every request for static files | Enable `open_file_cache max=10000 inactive=30s` |
| Default I/O scheduler (CFQ) on NVMe | CFQ adds unnecessary seek optimization for drives that have no seek latency | Switch to `none` for NVMe, `mq-deadline` for SATA SSD |
| `dirty_ratio=20` on database servers | Large dirty page bursts cause sudden I/O stalls during writeback | Reduce to `dirty_ratio=10 dirty_background_ratio=3` |
| `net.ipv4.tcp_tw_recycle=1` | Deprecated in Linux 4.12+, causes issues with NAT | Remove entirely; use `tcp_tw_reuse=1` instead |
| Not applying ulimits via systemd | Limits in `/etc/security/limits.conf` don't apply to systemd-started services | Set `LimitNOFILE` in the `[Service]` section |
| `pool_mode=session` in PgBouncer | Session mode ties up server connection for entire client session, negating pooling benefit | Use `transaction` mode for stateless web apps |

---

## Troubleshooting

| Symptom | Likely Cause | Diagnostic & Fix |
|---------|--------------|------------------|
| Many TIME_WAIT sockets | Clients opening/closing connections rapidly | `ss -o state time-wait | wc -l` — tune `tcp_fin_timeout=30`, `tcp_tw_reuse=1` |
| `connection refused` under load | `somaxconn` or `tcp_max_syn_backlog` too low | `netstat -s | grep overflow` — increase both to 65535 |
| OOM kills in journal | Process exceeds available RAM | `journalctl -k | grep oom-killer` — add swap, increase RAM, or tune `OOMScoreAdjust` |
| Disk I/O saturated under moderate load | I/O scheduler not optimal, or THP writeback storms | `iostat -xz 1` — check `%util`; disable THP; reduce `dirty_ratio` |
| Nginx 502 under high load | Backend connection pool exhausted | `ss -s` on backend — increase PgBouncer `max_client_conn`; scale backend |
| PgBouncer `no more connections allowed` | `max_client_conn` hit | `SHOW CLIENTS` in pgbouncer console; increase `max_client_conn` |
| `too many open files` error in Nginx logs | `worker_rlimit_nofile` not applied | Check `cat /proc/$(pgrep -o nginx)/limits`; verify systemd override loaded |
| High `wa` (I/O wait) in `vmstat` / `top` | Slow disk or `dirty_ratio` causing flush stall | `iostat -xz 1 sda`; enable `noatime`; check I/O scheduler |
| perf data shows kernel function dominating | System call overhead (e.g., excessive `stat()` calls) | Enable `open_file_cache` in Nginx; audit app for repeated file checks |
| NUMA imbalance on multi-socket server | Processes accessing remote NUMA memory (+2x latency) | `numastat -m` — bind DB process to single NUMA node with `numactl` |
