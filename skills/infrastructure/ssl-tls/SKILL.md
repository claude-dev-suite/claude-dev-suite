---
name: ssl-tls
description: |
  SSL/TLS certificate management skill: Let's Encrypt, Certbot, certificate
  types, TLS version/cipher configuration, HSTS, OCSP stapling, renewal
  automation, and local development certificates.

  USE WHEN:
  - Obtaining and renewing Let's Encrypt certificates (standalone, webroot, DNS challenge)
  - Configuring TLS on Nginx or Apache (protocols, cipher suites, session parameters)
  - Setting up HSTS with preload, OCSP stapling, or DHParam generation
  - Automating certificate renewal via systemd timer and deploy hooks
  - Managing multi-domain (SAN) or wildcard certificates
  - Debugging TLS handshake failures, mixed content, or ACME challenge errors
  - Setting up mkcert for trusted local HTTPS development

  DO NOT USE FOR:
  - mTLS / client certificate authentication (use service-mesh or api-gateway skill)
  - Application-level JWT or session token management
  - SSH key management
  - Internal CA for Kubernetes clusters (use cert-manager)
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---

# SSL/TLS Certificate Management

## Certificate Types

| Type | Issued to | Validation | Browser trust | Wildcard support |
|---|---|---|---|---|
| **DV** (Domain Validated) | Domain owner | Automated DNS/HTTP | Yes | Via wildcard DV |
| **OV** (Organization Validated) | Legal entity | Manual org check | Yes | No |
| **EV** (Extended Validation) | Legal entity + strict checks | Extensive manual | Yes (green bar deprecated) | No |
| **Wildcard** (e.g. `*.example.com`) | Domain owner | DNS challenge only | Yes | Yes — one level only |
| **Self-signed** | Anyone | None | No — browser warning | Yes |
| **mkcert** (local CA) | Localhost, IPs | Local trust store | Yes (after trust-store install) | Yes |

Let's Encrypt issues **DV** certs only. Wildcard certs require the **DNS-01** challenge.

---

## ACME Protocol Basics

ACME (Automatic Certificate Management Environment, RFC 8555) works as follows:

1. Client (Certbot) contacts the CA (Let's Encrypt) and creates an **Order** for one or more domains.
2. CA issues a **Challenge** — either HTTP-01 (place a file at `/.well-known/acme-challenge/<token>`) or DNS-01 (create a `_acme-challenge.<domain>` TXT record).
3. Client completes the challenge.
4. CA verifies the challenge and issues the certificate.
5. Client stores `fullchain.pem` (cert + intermediates) and `privkey.pem`.

Certificates are valid for **90 days**; automate renewal to run at least every 60 days.

---

## Certbot — All Challenge Types

### Standalone (no existing web server on port 80)

```bash
# Install Certbot (Ubuntu/Debian)
sudo apt-get install -y certbot

# Obtain cert — Certbot spins up a temporary HTTP server on port 80
sudo certbot certonly \
  --standalone \
  --preferred-challenges http \
  -d example.com \
  -d www.example.com \
  --email admin@example.com \
  --agree-tos \
  --no-eff-email

# Files created in: /etc/letsencrypt/live/example.com/
#   fullchain.pem  — certificate + intermediates (use this in ssl_certificate)
#   privkey.pem    — private key
#   chain.pem      — intermediates only (use for OCSP stapling)
#   cert.pem       — leaf certificate only (rarely needed)
```

### Webroot (Nginx / Apache keeps running)

```bash
# Ensure the webroot is served by your web server at /.well-known/acme-challenge/
# Nginx: location /.well-known/acme-challenge/ { root /var/www/certbot; }

sudo certbot certonly \
  --webroot \
  --webroot-path /var/www/certbot \
  -d example.com \
  -d www.example.com \
  --email admin@example.com \
  --agree-tos \
  --no-eff-email
```

### DNS Challenge — Cloudflare (wildcard support)

```bash
# Install Certbot Cloudflare DNS plugin
sudo apt-get install -y python3-certbot-dns-cloudflare

# Create credentials file (readable only by root)
sudo mkdir -p /etc/letsencrypt/credentials
sudo tee /etc/letsencrypt/credentials/cloudflare.ini > /dev/null <<'EOF'
# Cloudflare API token (Zone:DNS:Edit permission, scoped to zone)
dns_cloudflare_api_token = YOUR_CF_API_TOKEN_HERE
EOF
sudo chmod 600 /etc/letsencrypt/credentials/cloudflare.ini

# Obtain wildcard + apex certificate
sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /etc/letsencrypt/credentials/cloudflare.ini \
  --dns-cloudflare-propagation-seconds 60 \
  -d example.com \
  -d "*.example.com" \
  --email admin@example.com \
  --agree-tos \
  --no-eff-email
```

---

## Nginx SSL Block (Production-Ready)

```nginx
# Inside server { listen 443 ssl; ... }

ssl_certificate         /etc/letsencrypt/live/example.com/fullchain.pem;
ssl_certificate_key     /etc/letsencrypt/live/example.com/privkey.pem;
ssl_trusted_certificate /etc/letsencrypt/live/example.com/chain.pem;  # OCSP stapling

# Protocol: drop TLS 1.0 and 1.1 (deprecated in RFC 8996)
ssl_protocols TLSv1.2 TLSv1.3;

# Cipher suites: TLS 1.3 ciphers are implicit and non-configurable.
# The list below applies to TLS 1.2 only.
ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256';

# Let clients (especially TLS 1.3) pick their preferred cipher
ssl_prefer_server_ciphers off;

# Session resumption (reduces handshake overhead for returning clients)
ssl_session_cache   shared:SSL:10m;   # 1MB ≈ 4000 sessions; 10m ≈ 40000 sessions
ssl_session_timeout 1d;
ssl_session_tickets off;              # Disable — tickets use a server-side key that
                                      # if leaked undermines forward secrecy

# DHE key exchange parameters (generated once; 2048-bit minimum)
ssl_dhparam /etc/nginx/ssl/dhparam.pem;

# OCSP Stapling: server fetches and caches the OCSP response;
# eliminates client round-trip to CA's OCSP responder
ssl_stapling        on;
ssl_stapling_verify on;
resolver            1.1.1.1 8.8.8.8 valid=300s;
resolver_timeout    5s;

# HSTS: tell browsers to always use HTTPS for this domain
# preload: submit to browser preload lists (irreversible for ~1 year)
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
```

---

## DHParam Generation

```bash
# Generate 2048-bit DH parameters (runs once; takes ~30 seconds)
sudo mkdir -p /etc/nginx/ssl
sudo openssl dhparam -out /etc/nginx/ssl/dhparam.pem 2048

# 4096-bit for highest security (takes several minutes — overkill for most apps)
sudo openssl dhparam -out /etc/nginx/ssl/dhparam.pem 4096
```

---

## Renewal Automation — systemd Timer

### /etc/systemd/system/certbot-renewal.service

```ini
[Unit]
Description=Certbot Renewal
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/bin/certbot renew \
    --quiet \
    --deploy-hook /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
StandardOutput=journal
StandardError=journal
```

### /etc/systemd/system/certbot-renewal.timer

```ini
[Unit]
Description=Run Certbot renewal twice daily

[Timer]
OnCalendar=*-*-* 03,15:00:00   # 3 AM and 3 PM UTC
RandomizedDelaySec=3600         # Spread load on Let's Encrypt's servers
Persistent=true                 # Run immediately if last run was missed (e.g. server was off)

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now certbot-renewal.timer
sudo systemctl list-timers certbot-renewal
```

### Deploy Hook — /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

```bash
#!/bin/bash
# Called by Certbot after a successful renewal.
# RENEWED_LINEAGE is set to the path of the renewed certificate.
set -euo pipefail

echo "[certbot-deploy] Reloading Nginx after renewal of ${RENEWED_LINEAGE}"

# Validate new config before reloading
nginx -t || { echo "[certbot-deploy] ERROR: Nginx config test failed"; exit 1; }

systemctl reload nginx
echo "[certbot-deploy] Nginx reloaded successfully"
```

```bash
sudo chmod 700 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

---

## Local Development — mkcert

```bash
# Install mkcert (Linux/macOS)
# macOS: brew install mkcert
# Linux: download binary from https://github.com/FiloSottile/mkcert/releases
sudo apt-get install -y libnss3-tools   # Required for Chrome/Firefox trust store
wget -q "https://dl.filippo.io/mkcert/latest?for=linux/amd64" -O mkcert
chmod +x mkcert && sudo mv mkcert /usr/local/bin/

# Install local CA into system and browser trust stores
mkcert -install

# Generate certificate for local domains and IPs
mkcert localhost 127.0.0.1 ::1 myapp.local "*.myapp.local"

# Output: localhost+5.pem + localhost+5-key.pem in current directory
# Reference these files in your local Nginx / dev server TLS config
```

---

## Certificate Inspection Commands

```bash
# Inspect the live certificate served by a host
openssl s_client -connect example.com:443 -servername example.com \
  </dev/null 2>/dev/null | openssl x509 -noout -text

# Check expiry date only
openssl s_client -connect example.com:443 -servername example.com \
  </dev/null 2>/dev/null | openssl x509 -noout -dates

# Inspect a cert file on disk
openssl x509 -in /etc/letsencrypt/live/example.com/fullchain.pem \
  -noout -text | grep -E 'DNS:|Not (Before|After)|Subject:|Issuer:'

# Verify cert chain
openssl verify -CAfile /etc/letsencrypt/live/example.com/chain.pem \
  /etc/letsencrypt/live/example.com/cert.pem

# Test OCSP stapling response
openssl s_client -connect example.com:443 -servername example.com \
  -status </dev/null 2>/dev/null | grep -A6 "OCSP Response"

# List all managed Certbot certificates and expiry
sudo certbot certificates

# Dry-run renewal test (does not modify files or contact Let's Encrypt production)
sudo certbot renew --dry-run

# Check certificate SANs
openssl x509 -in fullchain.pem -noout -ext subjectAltName

# Check that private key matches certificate
openssl x509 -noout -modulus -in cert.pem | md5sum
openssl rsa  -noout -modulus -in privkey.pem | md5sum
# Both MD5 hashes must match
```

---

## ssl_session_cache vs ssl_session_tickets

| Setting | Mechanism | Forward secrecy | Recommended |
|---|---|---|---|
| `ssl_session_cache shared:SSL:10m` | Server-side session store | Preserved (new ephemeral key per session) | Yes |
| `ssl_session_tickets on` | Client holds encrypted session token | Ticket key acts like a long-term secret — if leaked, all sessions exposed | **Off** (`ssl_session_tickets off`) |

---

## Anti-Patterns

| Anti-pattern | Why it's harmful | Fix |
|---|---|---|
| TLS 1.0 / 1.1 enabled | Both deprecated (RFC 8996); vulnerable to BEAST, POODLE | `ssl_protocols TLSv1.2 TLSv1.3;` only |
| Self-signed cert in production | Browser shows security warning; blocks automated clients | Use Let's Encrypt (free) or a paid CA |
| No renewal monitoring | Certificate expires without warning — site goes down | Monitor expiry: Prometheus `ssl_expiry_seconds`, UptimeRobot TLS check, or `certbot renew --dry-run` in CI |
| Weak DHParam (512/768-bit or none) | DHE key exchange vulnerable to Logjam | Generate 2048-bit: `openssl dhparam -out dhparam.pem 2048` |
| `ssl_session_tickets on` (default in Nginx) | Ticket key is rotated rarely; long-term key exposure breaks forward secrecy | `ssl_session_tickets off;` |
| No HSTS header | Browsers re-attempt HTTP on each visit; MITM downgrade possible | Add HSTS; start with short `max-age`; add `preload` only when stable |
| HSTS `preload` added too early | Preload list submission is hard to reverse (~1 year) | Test with short `max-age=300`, then extend to 63072000 before submitting |
| `ssl_prefer_server_ciphers on` with TLS 1.3 | TLS 1.3 ignores this directive; may penalise clients unnecessarily on TLS 1.2 | Set `off`; ensure cipher list is already strong |
| No CAA DNS record | Any CA can issue a cert for your domain | Add `CAA 0 issue "letsencrypt.org"` record to your DNS zone |
| Credential/API token in certbot ini file without chmod 600 | Anyone with shell access can read the token | `chmod 600 /etc/letsencrypt/credentials/cloudflare.ini` |

---

## Troubleshooting

| Symptom | Likely cause | Diagnostic / Fix |
|---|---|---|
| **ACME HTTP-01 challenge fails** | Port 80 not reachable from internet, or wrong webroot path | Check firewall; `curl http://example.com/.well-known/acme-challenge/test`; verify Nginx `root` for challenge location |
| **DNS-01 challenge fails** | TXT record not propagated within propagation-seconds window | Increase `--dns-cloudflare-propagation-seconds 120`; verify with `dig TXT _acme-challenge.example.com @8.8.8.8` |
| **Renewal error: "Problem binding to port 80"** | Another process (Nginx) is using port 80 during standalone challenge | Switch to webroot challenge; or stop Nginx, renew, restart |
| **"certificate verify failed" in client** | Missing intermediate in `fullchain.pem` | Use `fullchain.pem` (not `cert.pem`) in `ssl_certificate` |
| **HSTS lock-in on wrong redirect** | Preloaded or long `max-age` HSTS prevents HTTP access | Cannot be quickly undone — must wait for `max-age` to expire; test with fresh browser profile |
| **Mixed content warnings** | HTTPS page loading HTTP resources | Audit page with browser DevTools; set `Content-Security-Policy: upgrade-insecure-requests` as interim fix |
| **OCSP stapling "no response"** | Nginx can't reach OCSP responder (firewall or resolver missing) | Ensure `resolver` directive is set; verify outbound HTTPS is allowed from server |
| **Private key / cert mismatch** | Wrong cert installed or key regenerated | Compare modulus MD5: `openssl x509 -noout -modulus -in cert.pem \| md5sum` vs `openssl rsa -noout -modulus -in privkey.pem \| md5sum` |
| **"Too many certificates already issued"** | Let's Encrypt rate limit: 50 certs per registered domain per week | Use `--staging` flag for testing; wait for rate limit window to reset |
| **mkcert cert not trusted in Chrome** | `mkcert -install` not run, or browser uses its own trust store | Re-run `mkcert -install`; restart browser; for Chrome on Linux, also install in `~/.pki/nssdb` |
