---
name: waf
description: |
  Web Application Firewall configuration. Covers ModSecurity v3 with Nginx
  and Cloudflare WAF: managed rulesets, custom rules, rate limiting, and tuning.

  USE WHEN: user mentions "waf", "web application firewall", "modsecurity",
  "owasp crs", "core rule set", "cloudflare waf", "cloudflare firewall rules",
  "cloudflare rate limiting", "cloudflare custom rules", "modsecurity nginx",
  "secruleengine", "false positive waf", "waf exclusion", "waf bypass",
  "cloudflare bot fight mode", "cloudflare managed ruleset", "waf tuning"

  DO NOT USE FOR: Network-layer firewalls (iptables, nftables, ufw) — those are not WAF,
  DDoS volumetric protection at ISP level,
  API authentication / authorization — use `authentication` skill,
  Input validation in application code — use application-level validation
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---
# WAF Core Knowledge

## WAF Layers

```
Internet
   │
   ▼
[ Cloudflare WAF ]  ← Layer 1: Edge WAF (managed rulesets, rate limits, bot protection)
   │
   ▼
[ Load Balancer / Nginx ]
   │
   ▼
[ ModSecurity + CRS ]  ← Layer 2: Host WAF (inline with web server)
   │
   ▼
[ Application ]
```

Use both layers for defense in depth. Cloudflare is cheaper per request but Nginx +
ModSecurity gives you more visibility on the host and works without Cloudflare.

---

## ModSecurity v3 with Nginx

### Install ModSecurity and Nginx Connector

```bash
# Ubuntu 22.04 / 24.04
sudo apt update
sudo apt install -y libmodsecurity3 libmodsecurity-dev

# Install Nginx ModSecurity connector
# Option A: compile Nginx with connector (recommended for full control)
# Get connector source, then compile as dynamic module
git clone --depth 1 https://github.com/owasp-modsecurity/ModSecurity-nginx.git /tmp/modsecurity-nginx
NGINX_VER=$(nginx -v 2>&1 | grep -oP '[\d.]+')
wget http://nginx.org/download/nginx-${NGINX_VER}.tar.gz -P /tmp
cd /tmp && tar -xzf nginx-${NGINX_VER}.tar.gz
cd nginx-${NGINX_VER} && ./configure --with-compat --add-dynamic-module=/tmp/modsecurity-nginx
make modules
sudo cp objs/ngx_http_modsecurity_module.so /etc/nginx/modules/

# Option B: use pre-built package (distro-specific)
# Ubuntu PPA often provides: nginx-extras with modsecurity bundled

# Load module in nginx.conf
echo 'load_module modules/ngx_http_modsecurity_module.so;' | sudo tee /etc/nginx/modules-enabled/50-mod-modsecurity.conf
```

### Download OWASP Core Rule Set

```bash
CRS_VERSION=4.7.0
wget https://github.com/coreruleset/coreruleset/archive/refs/tags/v${CRS_VERSION}.tar.gz
sudo tar -xzf v${CRS_VERSION}.tar.gz -C /etc/modsecurity/
sudo ln -s /etc/modsecurity/coreruleset-${CRS_VERSION} /etc/modsecurity/crs

# Copy default configs
sudo cp /etc/modsecurity/crs/crs-setup.conf.example /etc/modsecurity/crs/crs-setup.conf
sudo cp /usr/share/modsecurity-crs/modsecurity.conf-recommended /etc/modsecurity/modsecurity.conf
```

### Core `modsecurity.conf` Settings

```apacheconf
# /etc/modsecurity/modsecurity.conf

# CRITICAL: Set to On in production, DetectionOnly to test
SecRuleEngine On
# SecRuleEngine DetectionOnly    # Log but do not block — use during initial tuning

# Request body inspection
SecRequestBodyAccess On
SecRequestBodyLimit 13107200        # 12.5 MB max request body
SecRequestBodyNoFilesLimit 131072   # 128 KB for non-file content
SecRequestBodyLimitAction Reject    # Reject requests exceeding body limit

# Response body inspection
SecResponseBodyAccess On
SecResponseBodyMimeType text/plain text/html text/xml application/json
SecResponseBodyLimit 524288         # 512 KB

# Audit log — CRITICAL for incident investigation
SecAuditEngine RelevantOnly         # Log only blocked/suspicious requests
# SecAuditEngine On                 # Log everything (very verbose, use only for debugging)
SecAuditLog /var/log/modsecurity/audit.log
SecAuditLogParts ABCDEFHIJKZ        # What to include in audit log
SecAuditLogType Serial
SecAuditLogStorageDir /var/log/modsecurity/data/

# Debug log (level 0-9, 0=off, 9=maximum verbosity)
SecDebugLog /var/log/modsecurity/debug.log
SecDebugLogLevel 0                  # 0 in production; set 3-5 for debugging

# Temporary files
SecTmpDir /tmp/modsecurity/
SecDataDir /tmp/modsecurity/

# Upload handling
SecUploadDir /tmp/modsecurity/upload/
SecUploadKeepFiles Off

# Sensor ID (for cluster deployments)
SecSensorId nginx-waf-01

# Default action: log + pass (rules set block action explicitly)
SecDefaultAction "phase:1,log,auditlog,pass"
```

### CRS Setup (`crs-setup.conf` Key Settings)

```apacheconf
# /etc/modsecurity/crs/crs-setup.conf

# Paranoia Level (1-4):
# 1 = Baseline protection, very few false positives (recommended start)
# 2 = More rules, some FPs — good for APIs with known input patterns
# 3 = Strict, significant tuning required
# 4 = Maximum, expect many FPs — only for high-security apps after extensive tuning
SecAction \
  "id:900000, \
   phase:1, \
   nolog, \
   pass, \
   t:none, \
   setvar:tx.paranoia_level=1"

# Anomaly scoring threshold
# Requests accumulate a score; if score > threshold, block
# Default: 5 (inbound blocking score) / 4 (outbound)
SecAction \
  "id:900110, \
   phase:1, \
   nolog, \
   pass, \
   t:none, \
   setvar:tx.inbound_anomaly_score_threshold=5, \
   setvar:tx.outbound_anomaly_score_threshold=4"

# Allowed HTTP methods
SecAction \
  "id:900200, \
   phase:1, \
   nolog, \
   pass, \
   t:none, \
   setvar:'tx.allowed_methods=GET HEAD POST PUT DELETE PATCH OPTIONS'"

# Allowed content types (tighten for APIs)
SecAction \
  "id:900220, \
   phase:1, \
   nolog, \
   pass, \
   t:none, \
   setvar:'tx.allowed_request_content_type=|application/json| |application/x-www-form-urlencoded| |multipart/form-data|'"

# Max argument count and name/value lengths
SecAction \
  "id:900300, \
   phase:1, \
   nolog, \
   pass, \
   t:none, \
   setvar:tx.max_num_args=255, \
   setvar:tx.arg_name_length=100, \
   setvar:tx.arg_length=400, \
   setvar:tx.total_arg_length=64000, \
   setvar:tx.max_file_size=1048576, \
   setvar:tx.combined_file_sizes=1048576"
```

### Nginx Integration

```nginx
# /etc/nginx/nginx.conf (http block)
modsecurity on;
modsecurity_rules_file /etc/nginx/modsecurity/main.conf;
```

```nginx
# /etc/nginx/modsecurity/main.conf
Include /etc/modsecurity/modsecurity.conf
Include /etc/modsecurity/crs/crs-setup.conf
Include /etc/modsecurity/crs/rules/*.conf
# Custom exclusions (loaded AFTER CRS rules)
Include /etc/modsecurity/custom-exclusions.conf
```

```nginx
# /etc/nginx/sites-enabled/api.conf
server {
    listen 443 ssl http2;
    server_name api.example.com;

    # Enable WAF on this server
    modsecurity on;
    modsecurity_rules_file /etc/nginx/modsecurity/main.conf;

    # Disable WAF for specific locations (e.g., file upload endpoint)
    location /api/upload {
        modsecurity off;
        proxy_pass http://upstream;
    }

    location / {
        proxy_pass http://upstream;
    }
}
```

### Custom ModSecurity Rules

```apacheconf
# /etc/modsecurity/custom-rules.conf

# Block specific malicious User-Agent
SecRule REQUEST_HEADERS:User-Agent "@contains BadBot/1.0" \
    "id:10001, \
     phase:1, \
     deny, \
     status:403, \
     log, \
     msg:'Blocked malicious bot', \
     tag:'custom/bot-block'"

# Block SQL injection pattern in a specific custom parameter
SecRule ARGS:search "@detectSQLi" \
    "id:10002, \
     phase:2, \
     deny, \
     status:400, \
     log, \
     msg:'SQL injection attempt in search parameter', \
     tag:'custom/sqli'"

# Rate limit login endpoint by IP (using IP-based collections)
SecAction \
    "id:10010, \
     phase:1, \
     nolog, \
     pass, \
     initcol:ip=%{REMOTE_ADDR}, \
     setvar:ip.login_count=+1, \
     expirevar:ip.login_count=60"

SecRule IP:LOGIN_COUNT "@gt 10" \
    "id:10011, \
     phase:1, \
     deny, \
     status:429, \
     log, \
     msg:'Login rate limit exceeded', \
     chain"
SecRule REQUEST_URI "@contains /api/login" "t:none"

# Block by IP CIDR range
SecRule REMOTE_ADDR "@ipMatch 185.220.0.0/14" \
    "id:10020, \
     phase:1, \
     deny, \
     status:403, \
     log, \
     msg:'Blocked TOR exit node range'"
```

### Whitelisting False Positives

```apacheconf
# /etc/modsecurity/custom-exclusions.conf

# Remove a specific rule globally (use rule ID from audit log)
SecRuleRemoveById 942100           # Example: SQLi detection false positive

# Remove rule only for a specific path
<LocationMatch "^/api/query">
    SecRuleRemoveById 942100
    SecRuleRemoveById 942110
</LocationMatch>

# Remove by tag (removes all rules with that tag)
SecRuleRemoveByTag "OWASP_CRS/SQL_INJECTION"

# Whitelist a specific argument from rule
SecRuleUpdateTargetById 942100 "!ARGS:filter_query"

# Whitelist entire parameter from all body inspection
SecRuleUpdateTargetByTag "OWASP_CRS" "!ARGS:legit_html_content"
```

---

## Cloudflare WAF

### Managed Rulesets (Dashboard: Security → WAF → Managed Rules)

```
Cloudflare Managed Ruleset     — General web attacks (XSS, SQLi, RCE, etc.)
OWASP Core Ruleset             — CRS equivalent at Cloudflare edge
Exposed Credentials Check      — Block credential stuffing against known breached creds
```

Enable via Terraform:
```hcl
resource "cloudflare_ruleset" "zone_managed_waf" {
  zone_id     = var.zone_id
  name        = "Managed WAF"
  description = "Managed WAF rulesets"
  kind        = "zone"
  phase       = "http_request_firewall_managed"

  rules {
    action = "execute"
    action_parameters {
      id      = "efb7b8c949ac4650a09736fc376e9aee"  # Cloudflare Managed Ruleset ID
      version = "latest"
    }
    expression  = "true"
    description = "Cloudflare Managed Ruleset"
    enabled     = true
  }
}
```

### Custom WAF Rules (Cloudflare Expression Syntax)

```
# Block by ASN (used by known botnets)
(ip.gre.asn in {209242 202421 395082})

# Challenge traffic from high-threat countries (not block — to avoid false positives)
(ip.gre.src.country in {"CN" "RU" "KP"} and not ip.src in {203.0.113.0/24})

# Block specific URI patterns
(http.request.uri.path contains "/.env" or
 http.request.uri.path contains "/wp-admin" or
 http.request.uri.path contains "/phpmyadmin")

# Rate limit login endpoint — block IPs with > 10 req/min to /api/login
# (configured in Rate Limiting rules, see below)

# Challenge if threat score > 20
(cf.threat_score gt 20 and not ip.src in $trusted_ips_list)

# Block if User-Agent matches scanner patterns
(http.user_agent contains "sqlmap" or
 http.user_agent contains "nikto" or
 http.user_agent contains "nmap" or
 http.user_agent contains "masscan")

# Allow Cloudflare health checks
(ip.src in {103.21.244.0/22 103.22.200.0/22 103.31.4.0/22})
```

**Actions available**: `block` | `challenge` (CAPTCHA) | `managed_challenge` (adaptive) | `js_challenge` | `log` | `allow` | `skip`

### Cloudflare Rate Limiting Rules

```
# Rule: Protect login endpoint
Expression:  http.request.uri.path eq "/api/login" and http.request.method eq "POST"
Counting:    All requests from same IP
Period:      1 minute
Threshold:   10
Action:      Block (duration: 5 minutes)

# Rule: API global rate limit
Expression:  http.request.uri.path starts_with "/api/"
Counting:    All requests from same IP
Period:      1 minute
Threshold:   500
Action:      Managed Challenge

# Rule: Protect registration
Expression:  http.request.uri.path eq "/api/register"
Counting:    All requests from same IP
Period:      10 minutes
Threshold:   5
Action:      Block (duration: 1 hour)
```

### Cloudflare WAF Exceptions

Exceptions bypass managed rulesets for specific traffic.

```
# Skip WAF for known good internal monitoring IP
Expression: ip.src eq 203.0.113.42
Skip:       All managed rulesets

# Skip specific rule for a legitimate endpoint that triggers false positive
Expression: http.request.uri.path eq "/api/query" and cf.waf.score.sqli gt 0
Skip:       Rule ID CF-000001 (SQLi rule)
```

### Firewall Events Analysis

```bash
# Via Cloudflare API — recent firewall events
curl -s "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/security/events?since=${SINCE_DATE}&per_page=100" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" | jq '.result[] | {action, rule_id, client_ip, user_agent, uri}'

# Using cf-analytics CLI
cf-analytics firewall --zone example.com --since 2024-01-01T00:00:00Z
```

---

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|---|---|---|
| `SecRuleEngine DetectionOnly` left in production forever | WAF detects attacks but never blocks — provides false sense of security | Use DetectionOnly only during initial tuning (1-2 weeks); switch to `On` with proper exclusions |
| Paranoia level 1 with no further tuning | PL1 misses many attack vectors including second-order injections | Increase to PL2 after eliminating FPs at PL1; test in staging first |
| `SecRuleRemoveById` without scoping to a path | Globally disabling a rule creates a protection gap for the entire application | Scope exclusions with `<LocationMatch>` or `SecRuleUpdateTargetById` |
| No anomaly score threshold adjustment | Default thresholds may be too low for legitimate complex queries or too high for APIs | Tune `tx.inbound_anomaly_score_threshold` based on your observed scores in DetectionOnly mode |
| Audit log set to `On` (log everything) in production | Audit log fills disk within hours on busy servers | Use `SecAuditEngine RelevantOnly`; set up log rotation: `logrotate` with `compress` and `dateext` |
| Cloudflare WAF with action=`block` on managed ruleset immediately | High false positive rate blocks legitimate users on day one | Start with `log`, review events for 1 week, then switch to `managed_challenge`, then `block` |
| No WAF exceptions for internal monitoring / health check IPs | Monitoring probes get blocked or challenged | Add exceptions: `ip.src in $monitoring_ips → skip all managed rulesets` |
| Rate limiting too aggressive (block after 1 req) | Legitimate users blocked by overly tight rate limits | Start conservative (e.g., 100 req/min), observe analytics, tighten gradually |
| Trusting `X-Forwarded-For` for WAF rules without Cloudflare IP validation | Header can be spoofed — attacker bypasses IP-based rules | On origin server, only trust `X-Forwarded-For` from Cloudflare IP ranges; validate with `cf-ipranges` |
| Not testing WAF bypass before declaring protection complete | Known bypass techniques (e.g., encoding, chunked transfer) may evade rules | Run OWASP ZAP or Nuclei scanner against staging with WAF enabled; fix bypasses |

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| Legitimate form submissions blocked | CRS rule triggered by benign input (e.g., `SELECT` in a product description) | Check audit log for rule ID; add `SecRuleUpdateTargetById <id> "!ARGS:<param>"` exclusion |
| CRS rules not loading | Include path wrong or rules file syntax error | `nginx -t` will show ModSecurity load errors; check `/var/log/nginx/error.log` |
| Audit log not written | `SecAuditLog` path not writable by nginx user | `chown www-data /var/log/modsecurity/`; set directory permissions `750` |
| `nginx: [warn] ModSecurity: Failed to load`: | Connector version incompatible with libmodsecurity version | Match connector and libmodsecurity versions; rebuild connector from source |
| Audit log filling disk rapidly | `SecAuditEngine On` in prod | Switch to `RelevantOnly`; set up logrotate daily rotation with 7-day retention |
| Cloudflare WAF blocking API clients | Managed ruleset detects JSON payload patterns as attack | Create WAF exception for that URI; or switch ruleset action from `block` to `log` temporarily to identify rule |
| Rate limit rule not triggering | Period or threshold misconfigured; counting characteristic wrong | Use Cloudflare firewall events log to verify rule matches; check "Counting same" setting |
| False positive rate too high after enabling PL2 | Many legitimate requests scoring above threshold | Lower paranoia level back to 1; add specific exclusions at PL2 for known-good params |
| ModSecurity memory usage growing | In-memory collections (IP rate limiting) not expiring | Ensure `expirevar` is set on all collection variables; tune data dir cleanup |
| Cloudflare challenge loop | Client set to block JS/cookies — can't pass challenge | Use `block` action instead of JS challenge for known-bad traffic; use managed_challenge for uncertain traffic |

---

## Production Checklist

**ModSecurity:**
- [ ] `SecRuleEngine On` (not DetectionOnly)
- [ ] Audit log on `RelevantOnly` with logrotate configured
- [ ] CRS version pinned (not auto-updated)
- [ ] Custom exclusions file for known false positives
- [ ] Anomaly score threshold tuned for your app
- [ ] Request body limit set (`SecRequestBodyLimit`)
- [ ] Nginx `modsecurity on` enabled per-vhost
- [ ] Debug log level `0` in production
- [ ] Regular review of audit logs for new FPs and new attack patterns

**Cloudflare WAF:**
- [ ] Cloudflare Managed Ruleset enabled with `managed_challenge` or `block`
- [ ] OWASP CRS enabled at appropriate sensitivity
- [ ] Custom rules for known attack patterns specific to your app
- [ ] Rate limiting rules on all sensitive endpoints (login, register, password-reset)
- [ ] WAF exceptions for monitoring IPs and known-good traffic
- [ ] Bot Fight Mode enabled
- [ ] Firewall events exported to SIEM or reviewed weekly
- [ ] Threat score-based challenge rule in place
