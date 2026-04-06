---
name: load-balancer
description: |
  Load balancing with Nginx and HAProxy. Covers upstream configuration, balancing
  algorithms, health checks, SSL termination, session persistence, and monitoring.

  USE WHEN: user mentions "load balancer", "nginx upstream", "haproxy", "nginx load
  balancing", "round robin", "least_conn", "ip_hash", "haproxy backend", "haproxy
  frontend", "haproxy acl", "haproxy stats", "ssl termination", "sticky session",
  "upstream health check", "nginx proxy", "haproxy health check"

  DO NOT USE FOR: Caddy reverse proxy — use `caddy` skill,
  Traefik service mesh — use `traefik` skill,
  Kubernetes Ingress or Service resources — use `kubernetes` skill,
  DNS-level load balancing (Route 53, Cloudflare LB)
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---
# Load Balancing: Nginx & HAProxy Core Knowledge

## Nginx vs HAProxy — When to Use Each

| Dimension | Nginx | HAProxy |
|---|---|---|
| Primary role | Web server + reverse proxy + LB | Dedicated load balancer + proxy |
| Config complexity | Low-medium | Medium-high |
| HTTP modes | HTTP/1.1, HTTP/2 | HTTP/1.1, HTTP/2 (enterprise), HTTP/3 (1.9+) |
| TCP/UDP LB | Nginx Plus or stream module | Native, very mature |
| Active health checks | Nginx Plus only (open-source: passive only) | Built-in, free |
| Stats/metrics UI | Third-party (nginx-lua, stub_status) | Built-in stats page |
| Sticky sessions | Nginx Plus (cookie) or ip_hash | Stick tables (any key), free |
| Connection reuse | Keepalive to upstream | Reuse connections, queue management |
| Dynamic reconfiguration | Nginx Plus (`upstream_conf` API) | Runtime API (HAProxy 2.0+) |
| Ecosystem / docs | Very mature, massive | Mature, industry standard for pure LB |

**Use Nginx when**: you already use Nginx as your web server, you want a single tool for
serving files + proxying + LB, or your team knows Nginx.

**Use HAProxy when**: you need advanced health checks, fine-grained ACL routing, TCP load
balancing, or maximum LB performance and observability.

---

## Nginx Upstream Configuration

### Basic Upstream Block

```nginx
# /etc/nginx/nginx.conf or included conf

http {
    # Shared memory zone for upstream state across workers
    # Required for proper load balancing with multiple workers
    upstream app_backend {
        zone app_zone 256k;         # Shared state (round_robin works without it too)

        # Balancing method (default is round_robin if nothing specified)
        # least_conn;               # Route to backend with fewest active connections
        # ip_hash;                  # Sticky: same client IP always → same backend
        # hash $request_uri consistent;  # Consistent hashing by URI (good for caching)
        # random two least_conn;    # Pick 2 random servers, send to less-loaded one

        server 10.0.1.10:3000 weight=3 max_fails=3 fail_timeout=30s;
        server 10.0.1.11:3000 weight=1 max_fails=3 fail_timeout=30s;
        server 10.0.1.12:3000 weight=1 max_fails=3 fail_timeout=30s;

        # Backup server — only used when all primaries are down
        server 10.0.1.20:3000 backup;

        # Permanently excluded (maintenance)
        # server 10.0.1.13:3000 down;

        # Keepalive connections to upstream (dramatically reduces TCP overhead)
        keepalive 64;               # Max idle keepalive connections per worker
        keepalive_requests 1000;    # Max requests per keepalive connection
        keepalive_timeout 60s;
    }

    server {
        listen 80;
        server_name api.example.com;

        # Logging with upstream info
        log_format upstream_log '$remote_addr - $upstream_addr [$time_local] '
                                 '"$request" $status $body_bytes_sent '
                                 'rt=$request_time urt=$upstream_response_time';
        access_log /var/log/nginx/api_access.log upstream_log;

        location / {
            proxy_pass         http://app_backend;
            proxy_http_version 1.1;                     # Required for keepalive
            proxy_set_header   Connection "";           # Required for keepalive
            proxy_set_header   Host              $host;
            proxy_set_header   X-Real-IP         $remote_addr;
            proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
            proxy_set_header   X-Forwarded-Proto $scheme;

            # Timeouts
            proxy_connect_timeout  5s;
            proxy_send_timeout     30s;
            proxy_read_timeout     30s;

            # Passive health check: try next upstream on errors
            proxy_next_upstream     error timeout http_502 http_503 http_504;
            proxy_next_upstream_tries 3;
            proxy_next_upstream_timeout 10s;

            # Buffering
            proxy_buffering    on;
            proxy_buffer_size  16k;
            proxy_buffers      8 16k;
        }

        # Health check endpoint for external monitors
        location /nginx-health {
            access_log off;
            return 200 "OK\n";
        }
    }
}
```

### Active Health Check Workaround (Open-Source Nginx)

Nginx OSS only supports passive health checks. Simulate active checks with a small
service or use the `nginx_upstream_check_module` (third-party).

```bash
# Install lua-nginx-module + lua-resty-upstream-healthcheck
# OR use OpenResty (Nginx + LuaJIT bundle)
# Simple approach: use a separate monitoring tool (Consul, HAProxy) alongside Nginx
```

### SSL Termination at Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name api.example.com;

    # Certificate (from Let's Encrypt / Certbot)
    ssl_certificate     /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

    # Modern TLS settings
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # HSTS
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

    location / {
        proxy_pass http://app_backend;      # Plain HTTP to backend (internal network)
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# HTTP → HTTPS redirect
server {
    listen 80;
    server_name api.example.com;
    return 301 https://$host$request_uri;
}
```

### Stub Status (Metrics Endpoint)

```nginx
server {
    listen 127.0.0.1:8080;   # Bind to localhost only
    location /nginx_status {
        stub_status;
        allow 127.0.0.1;
        deny all;
    }
}
```

---

## HAProxy Configuration

### Full HTTP Load Balancer Config

```haproxy
# /etc/haproxy/haproxy.cfg

global
    log         /dev/log local0 info
    log         /dev/log local0 notice notice
    chroot      /var/lib/haproxy
    pidfile     /var/run/haproxy.pid
    maxconn     50000               # Total concurrent connections
    user        haproxy
    group       haproxy
    daemon
    stats socket /run/haproxy/admin.sock mode 660 level admin expose-fd listeners

defaults
    log         global
    mode        http                # http | tcp
    option      httplog             # Structured HTTP log format
    option      dontlognull         # Don't log health checks
    option      forwardfor          # Add X-Forwarded-For header
    option      http-server-close   # Close server-side connection after each request
    option      redispatch          # Retry on different server if session fails
    timeout     connect  5s
    timeout     client   30s
    timeout     server   30s
    timeout     http-request 10s    # Max time to receive full HTTP request
    timeout     http-keep-alive 5s
    timeout     queue   1m          # Max wait in queue when all servers full
    timeout     tunnel  1h          # For WebSocket / long-lived connections
    retries     3

#──────────────────────────────────────
# Stats page
#──────────────────────────────────────
frontend stats
    bind *:8404
    stats enable
    stats uri /stats
    stats refresh 10s
    stats auth admin:strongpassword    # CHANGE THIS
    stats show-legends
    stats show-node
    # Restrict to internal IPs
    acl internal_nets src 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16
    tcp-request connection reject if !internal_nets

#──────────────────────────────────────
# HTTPS frontend (SSL termination)
#──────────────────────────────────────
frontend https_in
    bind *:443 ssl crt /etc/ssl/certs/example.com.pem  # Combined cert+key PEM
    bind *:80
    http-request redirect scheme https unless { ssl_fc }

    # Define ACLs for routing
    acl host_api   hdr(host) -i api.example.com
    acl host_app   hdr(host) -i app.example.com
    acl path_admin path_beg /admin

    # Security headers
    http-response set-header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    http-response set-header X-Content-Type-Options    nosniff
    http-response set-header X-Frame-Options           DENY
    http-response del-header Server

    # ACL-based routing to backends
    use_backend api_servers  if host_api
    use_backend app_servers  if host_app !path_admin
    use_backend admin_server if host_app path_admin

    default_backend app_servers

#──────────────────────────────────────
# API backend
#──────────────────────────────────────
backend api_servers
    balance leastconn               # roundrobin | leastconn | source | uri | random

    # Active HTTP health checks
    option httpchk GET /health HTTP/1.1\r\nHost:\ api.example.com
    http-check expect status 200
    default-server inter 10s fastinter 2s downinter 5s rise 2 fall 3

    # Connection limits per server
    default-server maxconn 100 maxqueue 50

    # Keepalive to backends
    option http-server-close
    timeout connect 3s
    timeout server  15s

    server api1 10.0.1.10:3000 check weight 10
    server api2 10.0.1.11:3000 check weight 10
    server api3 10.0.1.12:3000 check weight 5   # Lower weight — less powerful
    server api_backup 10.0.1.20:3000 check backup

#──────────────────────────────────────
# App backend with sticky sessions
#──────────────────────────────────────
backend app_servers
    balance roundrobin
    option httpchk GET /health
    http-check expect status 200

    # Cookie-based sticky sessions
    cookie SERVERID insert indirect nocache httponly secure

    default-server inter 10s rise 2 fall 3
    server app1 10.0.1.30:8080 check cookie app1
    server app2 10.0.1.31:8080 check cookie app2
    server app3 10.0.1.32:8080 check cookie app3

#──────────────────────────────────────
# Admin backend — IP restricted
#──────────────────────────────────────
backend admin_server
    # IP whitelist using TCP-request (set in frontend ACL)
    option httpchk GET /admin/health
    server admin1 10.0.1.50:8080 check

#──────────────────────────────────────
# TCP mode example (e.g., PostgreSQL)
#──────────────────────────────────────
frontend postgres_in
    bind *:5432
    mode tcp
    default_backend postgres_servers

backend postgres_servers
    mode tcp
    balance leastconn
    option tcp-check
    server pg_primary 10.0.2.10:5432 check
    server pg_replica 10.0.2.11:5432 check backup
```

### HAProxy Runtime API

```bash
# Enable in global section: stats socket /run/haproxy/admin.sock mode 660 level admin

# Show current server states
echo "show servers state" | socat stdio /run/haproxy/admin.sock

# Drain a server (stop sending new requests, finish existing)
echo "set server api_servers/api1 state drain" | socat stdio /run/haproxy/admin.sock

# Bring server back online
echo "set server api_servers/api1 state ready" | socat stdio /run/haproxy/admin.sock

# Change weight dynamically
echo "set server api_servers/api2 weight 20" | socat stdio /run/haproxy/admin.sock

# Show backend health
echo "show health" | socat stdio /run/haproxy/admin.sock
```

### Error Pages

```haproxy
errorfile 400 /etc/haproxy/errors/400.http
errorfile 403 /etc/haproxy/errors/403.http
errorfile 408 /etc/haproxy/errors/408.http
errorfile 500 /etc/haproxy/errors/500.http
errorfile 502 /etc/haproxy/errors/502.http
errorfile 503 /etc/haproxy/errors/503.http
errorfile 504 /etc/haproxy/errors/504.http
```

---

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|---|---|---|
| No health checks (Nginx passive only, never configured) | Dead backends receive traffic → client errors | Configure `proxy_next_upstream` in Nginx; use `option httpchk` in HAProxy |
| `ip_hash` with clients behind shared NAT / CDN | Uneven distribution — all clients from same office go to one server | Use `least_conn` or cookie-based stickiness instead of IP hash |
| No `proxy_http_version 1.1` + `Connection ""` with Nginx keepalive | Keepalive not actually enabled — new TCP connection per request | Always pair `proxy_http_version 1.1` with `proxy_set_header Connection ""` |
| Setting `timeout client 30s` for WebSocket connections | WebSocket connections dropped after 30 seconds idle | Use `timeout tunnel 1h` (HAProxy) or `proxy_read_timeout 0` (Nginx) for WS paths |
| Not logging `$upstream_addr` and `$upstream_response_time` | Can't diagnose which backend is slow | Add to Nginx log_format; use HAProxy `%b/%s` log variables |
| `maxconn` not tuned in HAProxy global | HAProxy queues or rejects connections under load | Set `maxconn` based on RAM: ~1 MB per 1000 connections; adjust per server too |
| No `proxy_buffering` tuning in Nginx | Slow clients cause upstream to wait | Keep `proxy_buffering on`; tune `proxy_buffers` for your response sizes |
| Nginx `upstream` without `zone` directive | Round-robin per-worker only, no true least_conn across workers | Always add `zone <name> 256k` to upstream block |
| HAProxy stats page exposed on public interface | Stats reveal server IPs, health, and allow admin actions | Bind stats to `127.0.0.1` or restrict with ACL `src 10.0.0.0/8` |
| TLS termination without `ssl_session_cache` | Full TLS handshake on every request → high CPU | Add `ssl_session_cache shared:SSL:10m` and `ssl_session_timeout 1d` |

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| Uneven traffic distribution with `least_conn` | Single Nginx worker handles one backend; workers share if `zone` is set | Add `zone` directive to upstream block for shared state |
| Backend marked down immediately | Health check URL returns non-200 or times out | `curl http://10.0.1.10:3000/health` from load balancer host; adjust `rise`/`fall` thresholds |
| `502 Bad Gateway` on all requests | All backends down or proxy_pass pointing to wrong address | Check backend process; verify port; test `curl backend_ip:port` from LB |
| Session drops when scaling backends | No sticky sessions configured | Add `ip_hash` (Nginx) or `cookie` directive (HAProxy) |
| Keepalive not working (new TCP per request) | Missing `proxy_http_version 1.1` or `Connection ""` header | Add both headers; verify with `netstat -an | grep ESTABLISHED` counting |
| HAProxy shows "no server available" | All servers DOWN in health checks | `echo "show servers state" | socat stdio /run/haproxy/admin.sock`; fix health endpoint |
| Nginx returns 504 (gateway timeout) | Backend too slow; `proxy_read_timeout` too short | Increase `proxy_read_timeout`; investigate backend performance |
| SSL handshake errors | Cipher mismatch or TLS version too old | Check client TLS support; ensure `ssl_protocols TLSv1.2 TLSv1.3` |
| HAProxy rate higher than expected CPU | Too many health check connections | Increase `inter` interval: `inter 30s` for stable backends |
| X-Forwarded-For shows load balancer IP | `option forwardfor` not set (HAProxy) or `proxy_set_header X-Forwarded-For` missing (Nginx) | Add the respective directive; restart LB |

---

## Production Checklist

**Nginx:**
- [ ] `zone` directive in all `upstream` blocks
- [ ] `proxy_http_version 1.1` + `proxy_set_header Connection ""`
- [ ] `proxy_next_upstream` with appropriate error codes
- [ ] `X-Real-IP` and `X-Forwarded-For` headers set
- [ ] `keepalive` set on upstream block
- [ ] `$upstream_addr` and `$upstream_response_time` in access log format
- [ ] SSL session cache and modern TLS settings

**HAProxy:**
- [ ] `option httpchk` on all backends with correct URL and `Host` header
- [ ] `inter`, `rise`, `fall` tuned for your SLO
- [ ] `maxconn` set globally and per server
- [ ] Stats page on internal interface with auth
- [ ] Runtime API socket configured
- [ ] `timeout tunnel` set for WebSocket backends
- [ ] Error files configured for all 4xx/5xx codes
- [ ] Log format includes backend server name
