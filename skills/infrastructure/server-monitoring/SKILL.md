---
name: server-monitoring
description: |
  Production server monitoring stack covering Prometheus, Node Exporter, Grafana,
  Alertmanager, Loki, and Promtail on bare-metal or VM Linux hosts.

  USE WHEN:
  - Setting up monitoring for a new production server or VPS
  - Configuring Prometheus scrape targets for application or system metrics
  - Creating Grafana dashboards and datasource provisioning
  - Writing Alertmanager routing rules with email/Slack notifications
  - Implementing the PLG stack (Promtail + Loki + Grafana) for log aggregation
  - Performing live system diagnostics with htop, iotop, nethogs, ss, vmstat, iostat
  - Setting up uptime monitoring with UptimeRobot or healthchecks.io

  DO NOT USE FOR:
  - Kubernetes-native observability (use the kubernetes skill instead)
  - Application-level APM (distributed tracing with Jaeger/Tempo — use observability skill)
  - Cloud-managed monitoring (CloudWatch, GCP Monitoring, Azure Monitor)
  - Windows Server monitoring
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---

# Server Monitoring — Production Stack

## Stack Overview

| Layer | Tool | Purpose |
|-------|------|---------|
| Metrics collection | Node Exporter | OS/hardware metrics from `/proc` and `/sys` |
| Metrics scraping | Prometheus | Pull-based time-series database |
| Visualization | Grafana | Dashboards and alerting UI |
| Alerting | Alertmanager | Route, deduplicate, silence alerts |
| Log shipping | Promtail | Tail logs → push to Loki |
| Log aggregation | Loki | Log storage with label-based indexing |
| Uptime (external) | UptimeRobot | External HTTP/TCP reachability checks |
| Cron monitoring | healthchecks.io | Detect silent cron job failures |

---

## Node Exporter Installation (systemd)

Download the latest release from https://github.com/prometheus/node_exporter/releases.

```bash
NODE_EXPORTER_VERSION=1.8.2
wget https://github.com/prometheus/node_exporter/releases/download/v${NODE_EXPORTER_VERSION}/node_exporter-${NODE_EXPORTER_VERSION}.linux-amd64.tar.gz
tar xvf node_exporter-${NODE_EXPORTER_VERSION}.linux-amd64.tar.gz
sudo cp node_exporter-${NODE_EXPORTER_VERSION}.linux-amd64/node_exporter /usr/local/bin/
sudo useradd --no-create-home --shell /bin/false node_exporter
```

`/etc/systemd/system/node_exporter.service`:
```ini
[Unit]
Description=Node Exporter
Wants=network-online.target
After=network-online.target

[Service]
User=node_exporter
Group=node_exporter
Type=simple
ExecStart=/usr/local/bin/node_exporter \
  --collector.systemd \
  --collector.processes \
  --collector.diskstats \
  --web.listen-address=127.0.0.1:9100
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now node_exporter
sudo systemctl status node_exporter
curl -s http://127.0.0.1:9100/metrics | head -20
```

Bind Node Exporter to `127.0.0.1:9100` — never expose directly on 0.0.0.0. Prometheus scrapes it locally; use SSH tunnel or VPN for remote Prometheus.

---

## Prometheus Installation and Configuration

```bash
PROMETHEUS_VERSION=2.53.0
wget https://github.com/prometheus/prometheus/releases/download/v${PROMETHEUS_VERSION}/prometheus-${PROMETHEUS_VERSION}.linux-amd64.tar.gz
tar xvf prometheus-${PROMETHEUS_VERSION}.linux-amd64.tar.gz
sudo cp prometheus-${PROMETHEUS_VERSION}.linux-amd64/{prometheus,promtool} /usr/local/bin/
sudo mkdir -p /etc/prometheus /var/lib/prometheus
sudo cp -r prometheus-${PROMETHEUS_VERSION}.linux-amd64/{consoles,console_libraries} /etc/prometheus/
sudo useradd --no-create-home --shell /bin/false prometheus
sudo chown -R prometheus:prometheus /etc/prometheus /var/lib/prometheus
```

`/etc/prometheus/prometheus.yml`:
```yaml
global:
  scrape_interval: 15s           # Default scrape interval
  evaluation_interval: 15s       # Rule evaluation interval
  scrape_timeout: 10s

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['localhost:9093']

rule_files:
  - /etc/prometheus/rules/*.yml

scrape_configs:
  # Node Exporter — OS metrics
  - job_name: node
    static_configs:
      - targets: ['localhost:9100']
        labels:
          server: 'prod-web-01'
          env: production

  # Application metrics — assumes /metrics on port 3000
  - job_name: app
    metrics_path: /metrics
    static_configs:
      - targets: ['localhost:3000']
        labels:
          app: myapp
          env: production

  # Blackbox Exporter — probe HTTP endpoints
  - job_name: blackbox_http
    metrics_path: /probe
    params:
      module: [http_2xx]
    static_configs:
      - targets:
          - https://example.com
          - https://example.com/api/health
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: localhost:9115   # Blackbox Exporter address

  # Prometheus self-monitoring
  - job_name: prometheus
    static_configs:
      - targets: ['localhost:9090']
```

`/etc/systemd/system/prometheus.service`:
```ini
[Unit]
Description=Prometheus
Wants=network-online.target
After=network-online.target

[Service]
User=prometheus
Group=prometheus
Type=simple
ExecStart=/usr/local/bin/prometheus \
  --config.file=/etc/prometheus/prometheus.yml \
  --storage.tsdb.path=/var/lib/prometheus \
  --storage.tsdb.retention.time=30d \
  --storage.tsdb.retention.size=10GB \
  --web.listen-address=127.0.0.1:9090 \
  --web.enable-lifecycle
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now prometheus
promtool check config /etc/prometheus/prometheus.yml
```

---

## Alert Rules

`/etc/prometheus/rules/server.yml`:
```yaml
groups:
  - name: server_alerts
    interval: 1m
    rules:

      - alert: InstanceDown
        expr: up == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Instance {{ $labels.instance }} is down"
          description: "{{ $labels.job }}/{{ $labels.instance }} has been unreachable for more than 2 minutes."

      - alert: HighCPU
        expr: 100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High CPU usage on {{ $labels.instance }}"
          description: "CPU usage is {{ printf \"%.1f\" $value }}% (threshold 85%)."

      - alert: HighMemory
        expr: |
          (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes)
          / node_memory_MemTotal_bytes * 100 > 90
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage on {{ $labels.instance }}"
          description: "Memory usage is {{ printf \"%.1f\" $value }}% (threshold 90%)."

      - alert: DiskAlmostFull
        expr: |
          (node_filesystem_size_bytes{fstype!="tmpfs"} - node_filesystem_free_bytes{fstype!="tmpfs"})
          / node_filesystem_size_bytes{fstype!="tmpfs"} * 100 > 85
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Disk almost full on {{ $labels.instance }}"
          description: "Filesystem {{ $labels.mountpoint }} is {{ printf \"%.1f\" $value }}% full."

      - alert: HighLoad
        expr: node_load15 / count without(cpu, mode)(node_cpu_seconds_total{mode="idle"}) > 2.0
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High system load on {{ $labels.instance }}"
          description: "15-minute load average per CPU core is {{ printf \"%.2f\" $value }} (threshold 2.0)."
```

Validate rules: `promtool check rules /etc/prometheus/rules/server.yml`

---

## Alertmanager

```bash
ALERTMANAGER_VERSION=0.27.0
wget https://github.com/prometheus/alertmanager/releases/download/v${ALERTMANAGER_VERSION}/alertmanager-${ALERTMANAGER_VERSION}.linux-amd64.tar.gz
tar xvf alertmanager-${ALERTMANAGER_VERSION}.linux-amd64.tar.gz
sudo cp alertmanager-${ALERTMANAGER_VERSION}.linux-amd64/{alertmanager,amtool} /usr/local/bin/
sudo mkdir -p /etc/alertmanager /var/lib/alertmanager
```

`/etc/alertmanager/alertmanager.yml`:
```yaml
global:
  smtp_smarthost: 'smtp.gmail.com:587'
  smtp_from: 'alerts@example.com'
  smtp_auth_username: 'alerts@example.com'
  smtp_auth_password: 'app-specific-password'   # Use App Password, not account password
  smtp_require_tls: true
  resolve_timeout: 5m

route:
  group_by: ['alertname', 'instance']
  group_wait: 30s        # Wait before sending first notification for a new group
  group_interval: 5m     # How long to wait before sending alert for new alerts in the same group
  repeat_interval: 4h    # How often to re-send unresolved alerts
  receiver: 'team-ops'
  routes:
    - match:
        severity: critical
      receiver: 'pagerduty-critical'
      repeat_interval: 1h

receivers:
  - name: 'team-ops'
    email_configs:
      - to: 'ops-team@example.com'
        send_resolved: true
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/<T_ID>/<B_ID>/<WEBHOOK_TOKEN>'
        channel: '#alerts'
        send_resolved: true
        title: '{{ if eq .Status "firing" }}:red_circle:{{ else }}:white_check_mark:{{ end }} {{ .CommonAnnotations.summary }}'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'

  - name: 'pagerduty-critical'
    pagerduty_configs:
      - service_key: 'your-pagerduty-integration-key'
        send_resolved: true

inhibit_rules:
  - source_match:
      severity: critical
    target_match:
      severity: warning
    equal: ['alertname', 'instance']
```

`/etc/systemd/system/alertmanager.service`:
```ini
[Unit]
Description=Alertmanager
After=network-online.target

[Service]
User=prometheus
Group=prometheus
Type=simple
ExecStart=/usr/local/bin/alertmanager \
  --config.file=/etc/alertmanager/alertmanager.yml \
  --storage.path=/var/lib/alertmanager \
  --web.listen-address=127.0.0.1:9093
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

---

## Grafana Installation and Datasource Provisioning

```bash
sudo apt-get install -y apt-transport-https software-properties-common
wget -q -O - https://apt.grafana.com/gpg.key | gpg --dearmor | sudo tee /etc/apt/keyrings/grafana.gpg > /dev/null
echo "deb [signed-by=/etc/apt/keyrings/grafana.gpg] https://apt.grafana.com stable main" | sudo tee /etc/apt/sources.list.d/grafana.list
sudo apt-get update && sudo apt-get install -y grafana
sudo systemctl enable --now grafana-server
```

Datasource provisioning (`/etc/grafana/provisioning/datasources/prometheus.yml`):
```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://localhost:9090
    isDefault: true
    editable: false

  - name: Loki
    type: loki
    access: proxy
    url: http://localhost:3100
    editable: false
```

Import Node Exporter Full dashboard (ID **1860**) via Grafana UI: Dashboards → Import → enter 1860 → select Prometheus datasource. Other useful dashboard IDs:
- **3662** — Prometheus 2.0 Stats
- **13659** — Node Exporter for Prometheus Dashboard
- **10991** — Blackbox Exporter

---

## PLG Stack: Promtail + Loki

### Loki Installation

```bash
LOKI_VERSION=3.1.0
wget https://github.com/grafana/loki/releases/download/v${LOKI_VERSION}/loki-linux-amd64.zip
unzip loki-linux-amd64.zip
sudo mv loki-linux-amd64 /usr/local/bin/loki
sudo mkdir -p /etc/loki /var/lib/loki
```

`/etc/loki/loki-config.yml`:
```yaml
auth_enabled: false

server:
  http_listen_port: 3100
  grpc_listen_port: 9096

common:
  instance_addr: 127.0.0.1
  path_prefix: /var/lib/loki
  storage:
    filesystem:
      chunks_directory: /var/lib/loki/chunks
      rules_directory: /var/lib/loki/rules
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory

schema_config:
  configs:
    - from: 2024-01-01
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: loki_index_
        period: 24h

limits_config:
  retention_period: 30d           # Requires compactor below

compactor:
  working_directory: /var/lib/loki/compactor
  retention_enabled: true
  delete_request_cancel_period: 24h
```

### Promtail Configuration

`/etc/promtail/promtail-config.yml`:
```yaml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /var/lib/promtail/positions.yaml

clients:
  - url: http://localhost:3100/loki/api/v1/push

scrape_configs:
  # Systemd journal — captures all systemd unit logs
  - job_name: journal
    journal:
      max_age: 12h
      labels:
        job: systemd-journal
        host: prod-web-01
    relabel_configs:
      - source_labels: ['__journal__systemd_unit']
        target_label: unit
      - source_labels: ['__journal_priority_keyword']
        target_label: level

  # Application log files
  - job_name: app_logs
    static_configs:
      - targets:
          - localhost
        labels:
          job: myapp
          host: prod-web-01
          __path__: /var/log/myapp/*.log
    pipeline_stages:
      - json:
          expressions:
            level: level
            msg: message
      - labels:
          level:
      - timestamp:
          source: timestamp
          format: RFC3339Nano

  # Nginx access logs
  - job_name: nginx
    static_configs:
      - targets:
          - localhost
        labels:
          job: nginx
          host: prod-web-01
          __path__: /var/log/nginx/access.log
```

### LogQL Basics

```logql
# Filter by label
{job="myapp", level="error"}

# Filter by content
{job="nginx"} |= "500"

# Pattern extraction
{job="nginx"} | pattern `<ip> - - [<_>] "<method> <path> <_>" <status> <_>`

# Rate of error log lines per minute
rate({job="myapp", level="error"}[1m])

# Count errors by unit over last hour
sum by(unit) (count_over_time({job="systemd-journal", level="err"}[1h]))
```

---

## System-Level Diagnostic Tools

| Tool | Key Usage | Notes |
|------|-----------|-------|
| `htop` | Interactive process viewer | `F5` tree view, `F6` sort, `F9` kill, `u` filter by user |
| `iotop` | I/O per process | `sudo iotop -o` (only active), `-a` accumulated |
| `nethogs` | Bandwidth per process | `sudo nethogs eth0` |
| `ss` | Socket statistics (replaces netstat) | `ss -tlnp` TCP listening, `ss -s` summary, `ss -o state time-wait` |
| `vmstat` | Memory/swap/CPU overview | `vmstat 1 10` (10 samples, 1s interval) |
| `iostat` | Disk I/O stats | `iostat -xz 1` extended, `iostat -m` in MB/s |
| `dstat` | Combined resource stats | `dstat -cdngy` CPU/disk/net/page/sys |
| `sar` | Historical performance (sysstat) | `sar -u 1 5` CPU, `sar -r 1 5` memory, `sar -b 1 5` I/O |
| `free -h` | Memory and swap summary | Check buff/cache vs actual available |
| `df -h` | Disk space by filesystem | Add `-i` for inode usage |
| `du -sh` | Directory size | `du -sh /var/log/* | sort -rh | head -20` |

---

## Uptime Monitoring

### UptimeRobot (Free Tier)
- Create HTTP(s) monitor: URL, check interval (5 min on free tier), keyword match
- Alert contacts: email + Slack webhook
- Status page: public URL for incident communication
- TCP monitors for non-HTTP services (database ports, SMTP)

### healthchecks.io (Cron Job Monitoring)
Add a curl ping at the end of every cron script:
```bash
#!/bin/bash
set -euo pipefail

# ... backup/maintenance logic here ...

# Signal success to healthchecks.io
curl -fsS --retry 3 https://hc-ping.com/YOUR-CHECK-UUID > /dev/null
```

For jobs that should ping start + finish:
```bash
curl -fsS --retry 3 https://hc-ping.com/YOUR-CHECK-UUID/start > /dev/null
# ... job logic ...
curl -fsS --retry 3 https://hc-ping.com/YOUR-CHECK-UUID > /dev/null
```

---

## Anti-Patterns

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| No alerting configured | Incidents discovered by users, not ops team | Set up Alertmanager with email + Slack from day one |
| Scrape interval < 10s | High cardinality load on Prometheus, noisy data | Use 15s–60s depending on metric volatility |
| No retention limits | Prometheus disk fills up and crashes | Set `--storage.tsdb.retention.time=30d` and `--storage.tsdb.retention.size` |
| Monitoring server on the same host being monitored | Single point of failure — if server dies, so does the monitor | Run Prometheus on a dedicated monitoring host or use external uptime service |
| Exposing Node Exporter on 0.0.0.0 | Metrics data leaked publicly | Bind to `127.0.0.1:9100`, use SSH tunnel or VPN for remote scraping |
| Catching all logs without labels | Cannot filter Loki queries efficiently | Add `job`, `host`, `level` labels in Promtail config |
| Alert rules without `for` duration | Flapping alerts on transient spikes | Always add `for: 2m` or longer to avoid noise |
| No `inhibit_rules` in Alertmanager | Warning floods when critical alert also firing | Inhibit warnings when critical alert matches same instance |
| SMTP password in alertmanager.yml committed to git | Credential leak | Use environment variable substitution or external secret management |
| No Grafana datasource provisioning | Dashboard import fails after Grafana reinstall | Provision datasources as YAML in `/etc/grafana/provisioning/` |

---

## Troubleshooting

| Symptom | Likely Cause | Diagnostic & Fix |
|---------|--------------|------------------|
| Metrics not appearing in Prometheus | Node Exporter not running or wrong port | `curl http://127.0.0.1:9100/metrics` — check systemd status, verify `prometheus.yml` target |
| `up == 0` for a target | Prometheus cannot reach scrape endpoint | Check firewall (`ss -tlnp`), test with `curl` from Prometheus host, verify target address |
| Alert not firing despite condition met | `for` duration not elapsed, or rule file not loaded | `promtool check rules` — verify rule file path in `prometheus.yml`, check Prometheus logs |
| Alert firing but no notification | Alertmanager not configured or unreachable | Test Alertmanager with `amtool alert add` — check SMTP credentials, Slack webhook URL |
| Grafana blank dashboard after import | Wrong datasource selected | Edit dashboard → Panel → Query → verify datasource dropdown matches provisioned name |
| Loki not ingesting logs | Promtail cannot connect or wrong URL | `curl http://localhost:3100/ready` — check Promtail logs (`journalctl -u promtail`) |
| Promtail not tailing journal | Missing journal permissions | Add `promtail` user to `systemd-journal` group: `usermod -aG systemd-journal promtail` |
| High cardinality error in Loki | Too many unique label combinations | Avoid high-cardinality labels (request IDs, user IDs) — use log content for those |
| Prometheus OOM killed | Too many metrics or insufficient retention pruning | Add `--storage.tsdb.retention.size` limit, reduce scrape targets or intervals |
| `ALERTS` metric not visible | Prometheus evaluating no rules | Confirm `rule_files` path glob matches actual files: `ls /etc/prometheus/rules/*.yml` |
