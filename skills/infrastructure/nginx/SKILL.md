---
name: nginx
description: |
  Nginx reverse proxy and web server configuration skill.

  USE WHEN:
  - Configuring Nginx as a reverse proxy in front of application servers (Node.js, Python, Ruby, Java)
  - Setting up HTTPS/TLS termination with certificates
  - Configuring virtual hosts, upstream load balancing, and rate limiting
  - Optimising static file serving, gzip compression, and cache headers
  - Adding security headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options)
  - Setting up WebSocket proxying
  - Diagnosing 502, 504, 413, or SSL handshake errors

  DO NOT USE FOR:
  - Application-level logic (belongs in the app server, not Nginx)
  - Container orchestration routing (use Kubernetes Ingress or a service mesh skill instead)
  - Full API gateway features (rate-limit-by-user, auth, JWT — use api-gateway skill)
  - Apache httpd configuration
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---

# Nginx — Reverse Proxy & Web Server

## Core Concepts

Nginx uses a **master/worker** process model. The master reads config and manages workers; workers handle connections. The event loop in each worker is non-blocking, so a single worker can handle thousands of concurrent connections.

Key config hierarchy:

```
http { ... }                # Global HTTP settings
  upstream backend { ... }  # Pool of app servers
  server { ... }            # Virtual host (vhost)
    location / { ... }      # URI matching block
```

Nginx evaluates `server` blocks by `listen` port and `server_name`. Inside a `server`, `location` blocks are matched in order: exact (`=`), prefix longest-match (`^~`), regex (`~`, `~*`), then implicit prefix.

---

## Production HTTPS Server Block (Full Template)

```nginx
# /etc/nginx/sites-available/myapp.conf

# --- Upstream pool -----------------------------------------------------------
upstream app_backend {
    least_conn;                        # Route to least-busy worker
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
    keepalive 64;                      # Persistent connections to upstream
}

# --- Rate limiting zones (defined in http{} context in nginx.conf) -----------
# limit_req_zone $binary_remote_addr zone=api:10m rate=20r/s;
# limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;

# --- HTTP → HTTPS redirect ---------------------------------------------------
server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;

    # Allow Let's Encrypt ACME challenge
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# --- Main HTTPS server -------------------------------------------------------
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;                          # Nginx ≥ 1.25.1 directive (older: listen 443 ssl http2)
    server_name example.com www.example.com;

    # --- TLS -----------------------------------------------------------------
    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/example.com/chain.pem;

    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;     # Let TLS 1.3 clients pick

    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;           # Disable for forward secrecy

    ssl_stapling        on;
    ssl_stapling_verify on;
    resolver            1.1.1.1 8.8.8.8 valid=300s;
    resolver_timeout    5s;

    ssl_dhparam         /etc/nginx/ssl/dhparam.pem;  # openssl dhparam -out dhparam.pem 2048

    # --- Security headers ----------------------------------------------------
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options           "SAMEORIGIN" always;
    add_header X-Content-Type-Options    "nosniff" always;
    add_header X-XSS-Protection          "1; mode=block" always;
    add_header Referrer-Policy           "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy        "geolocation=(), microphone=(), camera=()" always;
    add_header Content-Security-Policy   "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.example.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://api.example.com; frame-ancestors 'none';" always;

    # --- Gzip ----------------------------------------------------------------
    gzip              on;
    gzip_vary         on;
    gzip_proxied      any;
    gzip_comp_level   6;
    gzip_types        text/plain text/css text/xml text/javascript
                      application/json application/javascript application/xml+rss
                      application/atom+xml image/svg+xml;
    gzip_min_length   1024;

    # --- Logging -------------------------------------------------------------
    access_log /var/log/nginx/myapp.access.log combined buffer=4k flush=5s;
    error_log  /var/log/nginx/myapp.error.log warn;

    # --- Static assets with long-lived cache ---------------------------------
    location /static/ {
        alias /var/www/myapp/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # --- Rate-limited API endpoints ------------------------------------------
    location /api/auth/ {
        limit_req zone=login burst=10 nodelay;
        limit_req_status 429;
        proxy_pass http://app_backend;
        include /etc/nginx/proxy_params;
    }

    location /api/ {
        limit_req zone=api burst=50 nodelay;
        limit_req_status 429;
        proxy_pass http://app_backend;
        include /etc/nginx/proxy_params;
    }

    # --- WebSocket endpoint --------------------------------------------------
    location /ws/ {
        proxy_pass         http://app_backend;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_read_timeout 3600s;      # Keep WS connections open
        proxy_send_timeout 3600s;
    }

    # --- Default proxy -------------------------------------------------------
    location / {
        proxy_pass http://app_backend;
        include /etc/nginx/proxy_params;
    }

    # --- Error pages ---------------------------------------------------------
    error_page 404             /404.html;
    error_page 500 502 503 504 /50x.html;

    location = /404.html {
        root /var/www/myapp/errors;
        internal;
    }

    location = /50x.html {
        root /var/www/myapp/errors;
        internal;
    }
}
```

---

## /etc/nginx/proxy_params (shared include file)

```nginx
proxy_http_version 1.1;
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header Connection        "";   # Required for keepalive upstream
proxy_connect_timeout 10s;
proxy_send_timeout    60s;
proxy_read_timeout    60s;
proxy_buffering       on;
proxy_buffer_size     8k;
proxy_buffers         8 8k;
```

---

## Worker / Global Tuning (/etc/nginx/nginx.conf)

```nginx
user  www-data;
worker_processes      auto;           # One per CPU core
worker_rlimit_nofile  65535;          # Match system ulimit -n

error_log  /var/log/nginx/error.log warn;
pid        /var/run/nginx.pid;

events {
    worker_connections  4096;         # Max connections per worker
    multi_accept        on;
    use                 epoll;        # Linux only; Nginx selects automatically
}

http {
    sendfile            on;
    tcp_nopush          on;           # Batch send headers + start of file
    tcp_nodelay         on;           # Disable Nagle for keepalive connections
    keepalive_timeout   75s;
    keepalive_requests  1000;

    server_tokens       off;          # Don't reveal Nginx version in headers

    client_max_body_size 50m;         # Increase if file uploads are needed
    client_body_timeout  30s;
    client_header_timeout 30s;

    # Rate limit zones (referenced in server blocks)
    limit_req_zone $binary_remote_addr zone=api:10m   rate=20r/s;
    limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;
    limit_conn_zone $binary_remote_addr zone=addr:10m;

    include /etc/nginx/mime.types;
    default_type application/octet-stream;   # Not text/html — avoids MIME sniffing

    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}
```

---

## Rate Limiting with Zones

```nginx
# Zone definition (http context):
limit_req_zone $binary_remote_addr zone=api:10m rate=20r/s;

# Usage in location:
location /api/ {
    limit_req zone=api burst=100 nodelay;
    # burst=100 → allow up to 100 requests queued above rate
    # nodelay  → don't delay burst requests, reject immediately after burst
    limit_req_status 429;
    proxy_pass http://app_backend;
}
```

`$binary_remote_addr` uses 4 bytes (IPv4) or 16 bytes (IPv6) — much smaller than `$remote_addr` string, allowing more entries per MB of zone memory.

---

## Named Locations and try_files

```nginx
# Serve SPA with fallback to index.html
location / {
    root   /var/www/myapp/dist;
    try_files $uri $uri/ @index;
}

location @index {
    root /var/www/myapp/dist;
    add_header Cache-Control "no-cache";
    try_files /index.html =404;
}

# PHP-FPM example (for reference)
location ~ \.php$ {
    fastcgi_pass   unix:/run/php/php8.2-fpm.sock;
    fastcgi_index  index.php;
    include        fastcgi_params;
    fastcgi_param  SCRIPT_FILENAME $document_root$fastcgi_script_name;
}
```

---

## Custom Log Format

```nginx
# In http context
log_format main_ext '$remote_addr - $remote_user [$time_local] '
                    '"$request" $status $body_bytes_sent '
                    '"$http_referer" "$http_user_agent" '
                    'rt=$request_time uct=$upstream_connect_time '
                    'uht=$upstream_header_time urt=$upstream_response_time '
                    'cs=$upstream_cache_status';

access_log /var/log/nginx/access.log main_ext buffer=16k flush=10s;
```

---

## Common Commands

```bash
# Test config syntax before applying
nginx -t
nginx -T                             # Also dumps parsed config

# Reload without dropping connections
nginx -s reload

# Graceful shutdown (drain connections)
nginx -s quit

# Force stop
nginx -s stop

# Check Nginx version and compile-time modules
nginx -V 2>&1 | tr ' ' '\n'

# Follow logs
journalctl -u nginx -f
tail -f /var/log/nginx/myapp.access.log

# Check which process is bound to port 443
ss -tlnp | grep :443

# Inspect open file descriptors for Nginx workers
cat /proc/$(pgrep -o nginx)/limits | grep 'open files'

# Reload systemd unit and restart
systemctl daemon-reload && systemctl restart nginx

# Enable / disable site
ln -s /etc/nginx/sites-available/myapp.conf /etc/nginx/sites-enabled/
unlink /etc/nginx/sites-enabled/myapp.conf
```

---

## Anti-Patterns

| Anti-pattern | Why it's harmful | Fix |
|---|---|---|
| `default_type text/html` in `http {}` | Causes browsers to execute unknown files as HTML — XSS vector | Set `default_type application/octet-stream` |
| No `keepalive` in upstream block | New TCP connection per request to backend; high latency and FD usage | Add `keepalive 64;` and `proxy_set_header Connection ""` |
| Missing `worker_rlimit_nofile` | Nginx workers hit OS default (1024) FD limit under load → silent failures | Set `worker_rlimit_nofile 65535;` and raise `worker_connections` accordingly |
| Logging to `/var/log/nginx/access.log` without buffer | Synchronous disk writes per request; degrades throughput by 10–30% under load | Add `buffer=16k flush=10s` to `access_log` |
| No `proxy_read_timeout` | Uses Nginx default (60s); long-running API calls get killed silently | Set explicitly: `proxy_read_timeout 120s;` on affected locations |
| `server_tokens on` (default) | Exposes exact Nginx version in headers; aids targeted vulnerability scanning | Set `server_tokens off;` in `http {}` |
| `add_header` inside nested `location` without `always` | Headers dropped on 4xx/5xx responses — security headers missing on error pages | Always use `add_header ... always;` |
| No `client_max_body_size` increase for upload endpoints | Default is 1m; any file upload > 1 MB returns 413 | Raise to appropriate limit per location or globally |
| Using `if` blocks for proxy logic | `if` in Nginx is "evil" — can cause subtle bugs; context-dependent behaviour | Use `map`, `limit_except`, or separate `location` blocks |
| Wildcard `server_name *` | Matches all unintended hostnames; can serve private APIs to wrong vhosts | Use explicit names; set a catch-all default server that returns 444 |

---

## Troubleshooting

| Symptom | Likely cause | Diagnostic / Fix |
|---|---|---|
| **502 Bad Gateway** | Upstream app not running or listening on wrong port | `ss -tlnp \| grep 3000`; check app logs; verify `proxy_pass` URL |
| **504 Gateway Timeout** | App is running but too slow to respond | Increase `proxy_read_timeout`; profile app; check DB queries |
| **413 Request Entity Too Large** | `client_max_body_size` too low | Raise limit in location or globally; check upload endpoint |
| **SSL handshake errors** (in client) | Expired cert, wrong chain, TLS version mismatch | `openssl s_client -connect host:443 -servername host`; check `ssl_trusted_certificate` |
| **Mixed content warnings** | Backend returning HTTP links despite HTTPS termination | Set `proxy_set_header X-Forwarded-Proto $scheme;` and configure app to trust it |
| **HSTS blocks HTTP access after config rollback** | Browser has cached `Strict-Transport-Security` | Cannot be immediately undone; see ssl-tls skill HSTS section |
| **WebSocket connections drop after 60s** | Default `proxy_read_timeout` | Set `proxy_read_timeout 3600s;` in the WebSocket location |
| **Rate limit affects legitimate users** | Zone too small or rate too low; burst not set | Increase zone size, raise rate, add `burst` parameter; whitelist internal IPs with `geo` |
| **Static files returning 403** | Directory or file permissions incorrect | `ls -la /var/www/myapp/static`; ensure `www-data` can read; check `alias` vs `root` |
| **Nginx not reloading after `systemctl reload`** | Syntax error in new config | Always run `nginx -t` before reloading; check `journalctl -u nginx -n 50` |
