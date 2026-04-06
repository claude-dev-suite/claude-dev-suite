---
name: caddy
description: |
  Caddy v2 reverse proxy with automatic HTTPS. Covers Caddyfile syntax,
  directives, TLS configuration, DNS challenges, and API-based management.

  USE WHEN: user mentions "caddy", "caddyfile", "caddy server", "xcaddy",
  "caddy reverse proxy", asks about "automatic https", "let's encrypt caddy",
  "caddy tls", "caddy load balancing", "caddy websocket proxy", "caddy dns
  challenge", "caddy cloudflare", "caddy api", "caddy systemd"

  DO NOT USE FOR: Nginx-based setups - use `load-balancer` or a dedicated nginx skill,
  Traefik-based setups - use `traefik` skill,
  Kubernetes ingress controllers - use `kubernetes` skill,
  Application-level TLS termination inside app code
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---
# Caddy v2 Core Knowledge

## Why Caddy

Caddy v2 is the only production-grade reverse proxy that automatically obtains and
renews TLS certificates from Let's Encrypt or ZeroSSL without any extra configuration.
Compared to Nginx it trades fine-grained buffer/worker tuning for dramatically simpler
configuration and zero-touch certificate management.

| Capability | Caddy | Nginx |
|---|---|---|
| Automatic TLS (ACME) | Built-in, zero config | Requires certbot + cron |
| Certificate renewal | Automatic, in-process | External cronjob |
| HTTP/2 and HTTP/3 | Enabled by default | HTTP/3 requires extra build |
| Config syntax | Caddyfile (concise) | nginx.conf (verbose) |
| Dynamic config reload | API + `caddy reload` | `nginx -s reload` |
| Plugin ecosystem | xcaddy custom builds | Third-party modules |
| Worker/buffer tuning | Limited | Very granular |
| Established ecosystem | Growing | Mature, wide adoption |

**Choose Caddy when**: you want automatic cert management, a simpler config, or HTTP/3.
**Choose Nginx when**: you need granular buffer tuning, established module ecosystem,
or are joining an existing Nginx-heavy team.

---

## Caddyfile Structure

```caddyfile
# Global options block — applies to all sites
{
    email admin@example.com          # ACME registration email (REQUIRED for Let's Encrypt)
    acme_ca https://acme-v02.api.letsencrypt.org/directory   # default, can switch to ZeroSSL
    # acme_ca https://acme.zerossl.com/v2/DV90               # ZeroSSL alternative

    # Admin API endpoint (default: localhost:2019)
    admin localhost:2019

    # Global default log level
    log {
        level INFO
    }

    # Optional: use a specific ACME EAB for ZeroSSL
    # acme_eab key_id=<id> mac_key=<key>

    # Optional: staging CA for testing (avoids rate limits)
    # acme_ca https://acme-staging-v02.api.letsencrypt.org/directory
}

# Snippet definition — reusable block of directives
(secure_headers) {
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
        -Server                   # Remove Server header
    }
}

(gzip_encode) {
    encode zstd gzip {
        minimum_length 1024
    }
}

# Site block — matches by hostname
example.com {
    import secure_headers
    import gzip_encode

    reverse_proxy localhost:3000
}

# Multiple hostnames in one block
api.example.com api-v2.example.com {
    import secure_headers
    reverse_proxy localhost:4000
}

# Redirect www to non-www
www.example.com {
    redir https://example.com{uri} permanent
}
```

---

## Multi-App Server (Multiple Domains and Subdomains)

```caddyfile
{
    email devops@company.com
    admin localhost:2019
}

(common) {
    encode zstd gzip
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
        X-XSS-Protection "1; mode=block"
        -Server
    }
}

# Main marketing site (static files)
company.com www.company.com {
    redir https://company.com{uri} 308  # Permanent redirect www → apex
    import common
    root * /var/www/company
    file_server
    try_files {path} /index.html        # SPA fallback
}

# Node.js API backend
api.company.com {
    import common

    reverse_proxy localhost:3001 {
        health_uri   /health
        health_interval 10s
        health_timeout  5s
        health_status   200

        # Timeouts
        transport http {
            dial_timeout       5s
            response_header_timeout 30s
            keepalive          30s
            keepalive_idle_conns 32
        }

        # Headers passed to upstream
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up X-Request-ID {http.request.uuid}
        header_down -X-Powered-By    # Remove revealing header
    }
}

# Python Django admin app
admin.company.com {
    import common
    basicauth /* {
        # htpasswd -nbB admin password | cut -d: -f2
        admin $2y$10$...hashed_password_here...
    }
    reverse_proxy localhost:8000
}

# Grafana dashboard
grafana.company.com {
    import common
    reverse_proxy localhost:3000 {
        header_up Host {upstream_hostport}
    }
}

# Static asset CDN edge (file server with aggressive caching)
static.company.com {
    import common
    root * /var/www/static
    file_server {
        hide .git .env
    }
    header Cache-Control "public, max-age=31536000, immutable"
}
```

---

## WebSocket Proxy

```caddyfile
app.example.com {
    # Regular HTTP routes
    handle /api/* {
        reverse_proxy localhost:3000
    }

    # WebSocket route — Caddy auto-detects Upgrade header
    handle /ws/* {
        reverse_proxy localhost:3001 {
            transport http {
                # WebSocket connections need longer timeouts
                dial_timeout            5s
                response_header_timeout 0s   # 0 = no timeout (needed for WS)
                read_timeout            0s
                write_timeout           0s
            }
            # Keep WebSocket headers
            header_up Connection {http.request.header.Connection}
            header_up Upgrade    {http.request.header.Upgrade}
        }
    }

    # Catch-all — serve SPA
    handle {
        root * /var/www/app
        try_files {path} /index.html
        file_server
    }
}
```

---

## TLS and DNS Challenge (Cloudflare)

Wildcard certificates require a DNS challenge. Use `xcaddy` to build Caddy with the
Cloudflare DNS provider plugin.

```bash
# Build Caddy with Cloudflare DNS plugin
xcaddy build --with github.com/caddy-dns/cloudflare

# Move to PATH
sudo mv caddy /usr/local/bin/caddy
sudo setcap cap_net_bind_service=+ep /usr/local/bin/caddy
```

```caddyfile
# Environment variable substitution in Caddyfile
{
    email admin@example.com
    acme_dns cloudflare {env.CLOUDFLARE_API_TOKEN}
}

# Wildcard cert — works for all subdomains
*.example.com example.com {
    tls {
        dns cloudflare {env.CLOUDFLARE_API_TOKEN}
        # Optional: restrict to ZeroSSL
        # ca https://acme.zerossl.com/v2/DV90
    }

    @api host api.example.com
    handle @api {
        reverse_proxy localhost:3000
    }

    @app host app.example.com
    handle @app {
        reverse_proxy localhost:4000
    }

    # Default — 404
    handle {
        respond "Not Found" 404
    }
}
```

Environment file `/etc/caddy/caddy.env`:
```bash
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token_here
```

Systemd unit picks up env file:
```ini
[Service]
EnvironmentFile=/etc/caddy/caddy.env
```

---

## Load Balancing

```caddyfile
api.example.com {
    reverse_proxy {
        to localhost:3001 localhost:3002 localhost:3003

        # Load balancing policy
        lb_policy least_conn          # round_robin | least_conn | ip_hash | uri | random

        # Passive health checks (no extra requests)
        fail_duration     30s        # How long to mark upstream as down
        max_fails         3          # Fails before marking down
        unhealthy_latency 5s         # Mark down if response > 5 s

        # Active health checks (probe endpoint)
        health_uri      /health
        health_interval 15s
        health_timeout  3s
        health_status   200

        # Circuit breaker retry
        # Try next upstream on these errors
        transport http {
            dial_timeout 3s
            response_header_timeout 15s
        }
    }
}
```

---

## Rate Limiting (with caddy-ratelimit plugin)

```bash
xcaddy build --with github.com/mholt/caddy-ratelimit
```

```caddyfile
api.example.com {
    rate_limit {
        zone api_zone {
            key    {remote_host}
            window 1m
            events 100
        }
    }
    reverse_proxy localhost:3000
}
```

---

## Caddy Admin API

```bash
# Reload config without restart
caddy reload --config /etc/caddy/Caddyfile

# Validate config before reloading
caddy validate --config /etc/caddy/Caddyfile

# Adapt Caddyfile to JSON (inspect what Caddy actually runs)
caddy adapt --config /etc/caddy/Caddyfile | jq .

# Get current running config via API
curl -s http://localhost:2019/config/ | jq .

# Add a new route dynamically via API
curl -X POST http://localhost:2019/config/apps/http/servers/srv0/routes \
  -H "Content-Type: application/json" \
  -d '{"match":[{"host":["new.example.com"]}],"handle":[{"handler":"reverse_proxy","upstreams":[{"dial":"localhost:5000"}]}]}'

# Check certificate status
curl -s http://localhost:2019/pki/ca/local | jq .
curl -s http://localhost:2019/config/apps/tls/certificates | jq 'keys'

# Force renew a certificate
curl -X POST http://localhost:2019/certificates/example.com/renew
```

---

## Systemd Service

```bash
# If installed via package manager, service is already created.
# For manual xcaddy builds:

sudo useradd --system --home /var/lib/caddy --shell /bin/false caddy

cat <<'EOF' | sudo tee /etc/systemd/system/caddy.service
[Unit]
Description=Caddy Web Server
Documentation=https://caddyserver.com/docs/
After=network.target network-online.target
Requires=network-online.target

[Service]
Type=notify
User=caddy
Group=caddy
ExecStart=/usr/local/bin/caddy run --environ --config /etc/caddy/Caddyfile
ExecReload=/usr/local/bin/caddy reload --config /etc/caddy/Caddyfile --force
TimeoutStopSec=5s
LimitNOFILE=1048576
LimitNPROC=512
PrivateTmp=true
ProtectSystem=full
AmbientCapabilities=CAP_NET_BIND_SERVICE
EnvironmentFile=-/etc/caddy/caddy.env

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now caddy
sudo systemctl status caddy
```

---

## JSON Config (alternative to Caddyfile)

For programmatic or API-driven configuration, Caddy accepts JSON directly.

```json
{
  "admin": { "listen": "localhost:2019" },
  "apps": {
    "http": {
      "servers": {
        "main": {
          "listen": [":443"],
          "routes": [
            {
              "match": [{ "host": ["api.example.com"] }],
              "handle": [
                {
                  "handler": "reverse_proxy",
                  "upstreams": [{ "dial": "localhost:3000" }],
                  "health_checks": {
                    "active": { "uri": "/health", "interval": "10s", "timeout": "5s" }
                  }
                }
              ]
            }
          ]
        }
      }
    },
    "tls": {
      "automation": {
        "policies": [
          {
            "subjects": ["api.example.com"],
            "issuers": [{ "module": "acme", "email": "admin@example.com" }]
          }
        ]
      }
    }
  }
}
```

```bash
# Load JSON config via API
curl -X POST http://localhost:2019/load \
  -H "Content-Type: application/json" \
  -d @caddy.json
```

---

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|---|---|---|
| Omitting `email` in global block | ACME registration fails silently on some CAs; no renewal notifications | Always set `email admin@example.com` in global options |
| Serving HTTP on port 80 without HTTPS redirect | Traffic transmitted in plaintext | Add `redir https://{host}{uri} permanent` or let Caddy auto-redirect (it does by default) |
| Wildcard cert with HTTP challenge | HTTP challenge cannot prove DNS control for wildcards | Use DNS challenge (`acme_dns`) for wildcards |
| No health checks on reverse proxy | Caddy continues routing to dead upstream | Add `health_uri`, `health_interval`, and `fail_duration` |
| Not using `encode` directive | Responses not compressed — higher bandwidth cost | Add `encode zstd gzip` to all site blocks or a shared snippet |
| Hardcoding API tokens in Caddyfile | Secrets in version control | Use `{env.VAR_NAME}` substitution with a separate env file |
| Running Caddy as root | Security vulnerability | Use `AmbientCapabilities=CAP_NET_BIND_SERVICE` with a system user |
| No rate limiting on public APIs | DDoS / abuse exposure | Add `caddy-ratelimit` plugin or upstream rate limiting |
| Editing running JSON config by hand via API without backup | Config can become inconsistent | Use `caddy adapt` to generate and version-control JSON; reload with `caddy reload` |
| Using `:latest` docker image in prod | Unexpected breaking changes | Pin `caddy:2.8.4-alpine` exact version |
| Not setting `header_up X-Real-IP` | Application sees Caddy's loopback IP, not client IP | Always forward `{remote_host}` as `X-Real-IP` and `X-Forwarded-For` |

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| `ACME failed: 429 too many requests` | Hit Let's Encrypt rate limit | Switch to staging CA temporarily; wait 1 week for rate limit reset |
| `bind: address already in use` on port 443 | Another process (Nginx, Apache) holds the port | `sudo ss -tlnp | grep 443` → stop conflicting service |
| Certificate not renewing (expires < 30 days) | Firewall blocks ACME HTTP challenge on port 80 | Open port 80, or switch to DNS challenge |
| DNS challenge failing (Cloudflare) | Wrong API token scope | Token needs `Zone:DNS:Edit` permission on the target zone |
| `upstream: connection refused` | Backend not running or wrong port | `curl localhost:<port>` from server; check backend service status |
| WebSocket disconnects after 30 s | Response/read timeout too short | Set `response_header_timeout 0s`, `read_timeout 0s` on WS upstream |
| Caddy rewrites path unexpectedly | `handle_path` strips prefix when not wanted | Use `handle` instead of `handle_path` if you want to keep the path |
| HSTS causing redirect loops | Caddy and app both redirecting | Ensure app does not force HTTPS redirect; let Caddy own it |
| Admin API returns 403 | Admin bound to localhost but request from remote | Never expose admin on `0.0.0.0`; use SSH tunnel to manage remotely |
| `tls: no certificate for domain` | Domain doesn't match any site block | Check site block hostname matches DNS exactly; check for www vs non-www |
| Slow first request after deploy | ACME obtaining cert on first connection | Pre-obtain with `caddy run` before going live; verify cert in admin API |
| Environment variable not substituted | Systemd `EnvironmentFile` not loaded | Check unit has `EnvironmentFile=` line; use `systemctl show caddy \| grep Env` |

---

## Production Checklist

- [ ] Global `email` set for ACME registration
- [ ] HTTPS redirect in place (Caddy does this by default)
- [ ] DNS challenge configured for wildcard certs
- [ ] Security headers snippet applied to all site blocks
- [ ] `encode zstd gzip` enabled
- [ ] Health checks on all `reverse_proxy` upstreams
- [ ] Rate limiting on public-facing APIs
- [ ] `X-Real-IP` and `X-Forwarded-For` forwarded to upstreams
- [ ] Caddy running as non-root system user with `CAP_NET_BIND_SERVICE`
- [ ] Systemd unit with `EnvironmentFile` for secrets
- [ ] Admin API bound to `localhost` only
- [ ] Caddyfile under version control; tested with `caddy validate` in CI
