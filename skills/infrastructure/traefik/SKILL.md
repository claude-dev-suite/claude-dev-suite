---
name: traefik
description: |
  Traefik v3 cloud-native reverse proxy. Covers providers, entrypoints, routers,
  middlewares, services, Docker labels, TLS/ACME, dashboard, and metrics.

  USE WHEN: user mentions "traefik", "traefik v3", "traefik docker", "traefik labels",
  "traefik middleware", "traefik dashboard", "traefik tls", "traefik acme",
  "traefik router", "traefik entrypoint", "traefik reverse proxy",
  "traefik cloudflare", "traefik let's encrypt", "traefik rate limit"

  DO NOT USE FOR: Caddy-based setups - use `caddy` skill,
  Nginx load balancing - use `load-balancer` skill,
  Kubernetes ingress with nginx-ingress - use `kubernetes` skill,
  Application-level TLS inside app code
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---
# Traefik v3 Core Knowledge

## Core Concepts

```
┌─────────────────────────────────────────────────────────────────┐
│  PROVIDERS          ENTRYPOINTS        ROUTERS         SERVICES │
│  ──────────         ───────────        ───────         ──────── │
│  Docker labels  →   :80  (web)    →   Host rule   →   LB pool  │
│  File provider  →   :443 (websecure)  PathPrefix       backend  │
│  Kubernetes     →   :8080 (dashboard) Headers          servers  │
└─────────────────────────────────────────────────────────────────┘
```

- **Provider**: Where Traefik reads configuration (Docker, file, Kubernetes, Consul…)
- **Entrypoint**: Network port + protocol that Traefik listens on
- **Router**: Matches requests by rule (Host, PathPrefix, Header) → sends to a service
- **Middleware**: Transforms requests/responses between router and service
- **Service**: The upstream backend (load balancer with one or more servers)

---

## Static Config — `traefik.yml`

Static config defines infrastructure-level settings. Requires restart to change.

```yaml
# /etc/traefik/traefik.yml  (or mounted at /traefik.yml in Docker)

# Global settings
global:
  checkNewVersion: false
  sendAnonymousUsage: false

# API & dashboard
api:
  dashboard: true
  insecure: false        # NEVER true in production

# Entrypoints
entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
          permanent: true
  websecure:
    address: ":443"
    http:
      tls:
        certResolver: letsencrypt
      middlewares:
        - security-headers@file    # Apply to all HTTPS routes
  metrics:
    address: ":8082"

# Certificate resolvers
certificatesResolvers:
  letsencrypt:
    acme:
      email: devops@company.com
      storage: /letsencrypt/acme.json        # Persistent volume required
      # HTTP challenge (default) — requires port 80 open
      httpChallenge:
        entryPoint: web

  letsencrypt-dns:
    acme:
      email: devops@company.com
      storage: /letsencrypt/acme-dns.json
      dnsChallenge:
        provider: cloudflare                  # Set CF_DNS_API_TOKEN env var
        delayBeforeCheck: 30                  # Wait for DNS propagation

# Providers
providers:
  docker:
    endpoint: "unix:///var/run/docker.sock"
    exposedByDefault: false                   # IMPORTANT: require explicit opt-in
    network: traefik-public                   # Default network for container comms
  file:
    directory: /etc/traefik/dynamic/          # Watch for changes automatically
    watch: true

# Logging
log:
  level: INFO                                 # DEBUG | INFO | WARN | ERROR
  filePath: /var/log/traefik/traefik.log

# Access logs
accessLog:
  filePath: /var/log/traefik/access.log
  bufferingSize: 100
  fields:
    headers:
      defaultMode: drop
      names:
        User-Agent: keep
        X-Forwarded-For: keep

# Metrics
metrics:
  prometheus:
    entryPoint: metrics
    addServicesLabels: true
    addRoutersLabels: true
```

---

## Docker Compose — Full Example

```yaml
# docker-compose.yml
version: "3.9"

services:
  traefik:
    image: traefik:v3.3
    container_name: traefik
    restart: unless-stopped
    security_opt:
      - no-new-privileges:true
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /etc/traefik/traefik.yml:/traefik.yml:ro
      - /etc/traefik/dynamic/:/etc/traefik/dynamic/:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - traefik-letsencrypt:/letsencrypt
    environment:
      - CF_DNS_API_TOKEN=${CF_DNS_API_TOKEN}
    networks:
      - traefik-public
    labels:
      - "traefik.enable=true"
      # Dashboard router
      - "traefik.http.routers.dashboard.rule=Host(`traefik.example.com`)"
      - "traefik.http.routers.dashboard.entrypoints=websecure"
      - "traefik.http.routers.dashboard.tls.certresolver=letsencrypt"
      - "traefik.http.routers.dashboard.service=api@internal"
      - "traefik.http.routers.dashboard.middlewares=dashboard-auth"
      # Dashboard basic auth: echo $(htpasswd -nbB admin 'password') | sed -e s/\\$/\\$\\$/g
      - "traefik.http.middlewares.dashboard-auth.basicauth.users=admin:$$2y$$10$$hash..."

  # Example application
  api:
    image: myapp/api:1.4.2
    restart: unless-stopped
    networks:
      - traefik-public
      - internal
    environment:
      - DATABASE_URL=postgres://user:pass@db:5432/app
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.api.rule=Host(`api.example.com`)"
      - "traefik.http.routers.api.entrypoints=websecure"
      - "traefik.http.routers.api.tls.certresolver=letsencrypt"
      - "traefik.http.routers.api.middlewares=rate-limit,security-headers"
      # Service port (required when container exposes multiple ports)
      - "traefik.http.services.api.loadbalancer.server.port=3000"
      # Health check
      - "traefik.http.services.api.loadbalancer.healthcheck.path=/health"
      - "traefik.http.services.api.loadbalancer.healthcheck.interval=10s"
      - "traefik.http.services.api.loadbalancer.healthcheck.timeout=3s"

  # Frontend app with path-based routing
  frontend:
    image: myapp/frontend:2.1.0
    restart: unless-stopped
    networks:
      - traefik-public
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.frontend.rule=Host(`example.com`) || Host(`www.example.com`)"
      - "traefik.http.routers.frontend.entrypoints=websecure"
      - "traefik.http.routers.frontend.tls.certresolver=letsencrypt"
      - "traefik.http.routers.frontend.middlewares=www-redirect,security-headers"
      - "traefik.http.services.frontend.loadbalancer.server.port=80"

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    networks:
      - internal                        # Not on traefik-public — no external routing
    volumes:
      - postgres-data:/var/lib/postgresql/data
    environment:
      - POSTGRES_PASSWORD=${DB_PASSWORD}

networks:
  traefik-public:
    external: true                      # Pre-created: docker network create traefik-public
  internal:
    driver: bridge

volumes:
  traefik-letsencrypt:
  postgres-data:
```

---

## Dynamic Config — File Provider

```yaml
# /etc/traefik/dynamic/middlewares.yml
http:
  middlewares:
    # HTTP → HTTPS redirect (also configured at entrypoint level above)
    redirect-to-https:
      redirectScheme:
        scheme: https
        permanent: true

    # HSTS + security headers
    security-headers:
      headers:
        stsSeconds: 31536000
        stsIncludeSubdomains: true
        stsPreload: true
        forceSTSHeader: true
        contentTypeNosniff: true
        browserXssFilter: true
        referrerPolicy: "strict-origin-when-cross-origin"
        frameDeny: true
        customResponseHeaders:
          X-Powered-By: ""
          Server: ""

    # Rate limiting
    rate-limit:
      rateLimit:
        average: 100          # Requests per second (average)
        burst: 50             # Burst allowance
        period: 1m            # Window period

    # Strip /api prefix before forwarding
    strip-api-prefix:
      stripPrefix:
        prefixes:
          - "/api"

    # Add /v1 prefix
    add-v1-prefix:
      addPrefix:
        prefix: "/v1"

    # Basic auth
    internal-auth:
      basicAuth:
        usersFile: /etc/traefik/users.htpasswd
        removeHeader: true    # Strip Authorization before passing to upstream

    # IP whitelist (Traefik v3: use ipAllowList)
    office-only:
      ipAllowList:
        sourceRange:
          - "10.0.0.0/8"
          - "203.0.113.42/32"

    # Retry on failure
    retry-middleware:
      retry:
        attempts: 3
        initialInterval: 100ms

    # www redirect
    www-redirect:
      redirectRegex:
        regex: "^https?://www\\.example\\.com/(.*)"
        replacement: "https://example.com/${1}"
        permanent: true

    # Circuit breaker
    circuit-breaker:
      circuitBreaker:
        expression: "ResponseCodeRatio(500, 600, 0, 600) > 0.25 || NetworkErrorRatio() > 0.10"
```

```yaml
# /etc/traefik/dynamic/services.yml — external services (not in Docker)
http:
  services:
    legacy-monolith:
      loadBalancer:
        servers:
          - url: "http://192.168.1.10:8080"
          - url: "http://192.168.1.11:8080"
        healthCheck:
          path: /status
          interval: 15s
          timeout: 5s
        sticky:
          cookie:
            name: SERVERID
            secure: true
            httpOnly: true

  routers:
    legacy:
      rule: "Host(`legacy.example.com`)"
      entryPoints:
        - websecure
      tls:
        certResolver: letsencrypt
      service: legacy-monolith
      middlewares:
        - security-headers
        - rate-limit
```

---

## Middleware Composition Example

Middlewares are applied in the order they are listed on the router label.

```
Request → rate-limit → ip-allowlist → strip-api-prefix → upstream
Response ← security-headers (applied on response) ←──────────────
```

```yaml
# Labels on a service container
- "traefik.http.routers.myapp.middlewares=rate-limit@file,office-only@file,strip-api-prefix@file,security-headers@file"
```

The `@file` suffix means the middleware is defined in the file provider.
Use `@docker` for middlewares defined via labels on another container.

---

## TCP Routing (non-HTTP)

```yaml
# /etc/traefik/dynamic/tcp.yml
tcp:
  routers:
    postgres:
      rule: "HostSNI(`*`)"             # TCP passthrough (no TLS inspection)
      entryPoints:
        - postgres                      # entryPoint address: ":5432"
      service: postgres-backend

  services:
    postgres-backend:
      loadBalancer:
        servers:
          - address: "10.0.1.5:5432"
```

---

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|---|---|---|
| `api.insecure: true` in production | Dashboard exposed on port 8080 with no auth | Set `api.insecure: false`; expose dashboard via router with `basicAuth` middleware |
| `exposedByDefault: true` in Docker provider | Every container automatically gets a route, including databases | Always set `exposedByDefault: false`; use `traefik.enable=true` label only where needed |
| Wildcard cert with HTTP challenge | HTTP challenge cannot prove DNS control for wildcards | Use `dnsChallenge` provider for wildcard domains |
| Not pinning Traefik version | `traefik:latest` can introduce breaking changes | Pin to exact version: `traefik:v3.3.4` |
| Missing `traefik.http.services.<name>.loadbalancer.server.port` when container exposes multiple ports | Traefik picks wrong port arbitrarily | Always specify the service port label explicitly |
| Storing `acme.json` on a non-persistent volume | Certificates lost on container restart → rate limit hit | Mount `acme.json` on a named Docker volume or bind mount on the host |
| Applying heavy middlewares (auth, rate-limit) only on some routes | Inconsistent security posture | Apply security-headers globally via entrypoint middleware; add auth/rate-limit to sensitive routers |
| Router rules without priority on overlapping paths | Non-deterministic routing when multiple rules match | Add `priority` label: `traefik.http.routers.myapp.priority=10` (higher wins) |
| Docker socket mounted as read-write with no protection | Container escape via Docker API | Use socket proxy (e.g., `tecnativa/docker-socket-proxy`) to restrict API access |
| No health checks on services | Traefik routes to unhealthy containers | Configure `healthcheck.path`, `interval`, and `timeout` on the loadbalancer |

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| Router not matching — 404 from Traefik | Label typo, wrong entrypoint name, container not on Traefik network | Check `traefik.http.routers.<name>.rule` label; verify container is on `traefik-public` network; check Traefik dashboard |
| Certificate not issued | Port 80 blocked (HTTP challenge) or DNS credentials wrong (DNS challenge) | `curl http://example.com/.well-known/acme-challenge/test` from external; check `CF_DNS_API_TOKEN` |
| Middleware not applied | `@file` vs `@docker` suffix mismatch, or middleware name typo | Use exact `name@provider` syntax; restart Traefik after file provider changes |
| "404 page not found" from upstream app | App routing issue, not Traefik | Bypass Traefik: `curl http://container_ip:port/path` directly from inside Docker network |
| Dashboard shows router but requests still fail | Middleware blocking (auth, IP whitelist) | Check access log; temporarily remove middlewares to isolate |
| `acme.json` has wrong permissions | Let's Encrypt client refuses to read file | `chmod 600 acme.json` — file must be readable only by owner |
| TLS certificate is self-signed (Traefik default) | ACME not configured, or cert resolver name wrong on router | Ensure `tls.certresolver=<name>` label matches exactly the `certificatesResolvers.<name>` key in static config |
| Container restarts but keeps same cert | acme.json not updated | Ensure acme.json volume is persistent; delete acme.json and restart to force re-issue (if not rate-limited) |
| High memory usage | Too many access log entries buffered | Increase `bufferingSize` or write to syslog; use log rotation |
| Sticky sessions not working | Cookie not forwarded by load balancer | Ensure `sticky.cookie.name` is set and that browsers allow cookies from the domain |

---

## Production Checklist

- [ ] Traefik version pinned (not `latest`)
- [ ] `exposedByDefault: false` in Docker provider
- [ ] `api.insecure: false` — dashboard behind router + basicAuth
- [ ] HTTP → HTTPS redirect on web entrypoint
- [ ] `acme.json` on persistent named volume, permissions `600`
- [ ] Security headers middleware applied globally or on all routers
- [ ] Rate limiting middleware on public-facing routers
- [ ] Health checks on all load balancer services
- [ ] Docker socket exposed via socket proxy (not raw `/var/run/docker.sock`)
- [ ] Access logs enabled with rotation
- [ ] Prometheus metrics endpoint restricted to internal network
- [ ] All middleware names use correct `@provider` suffix
