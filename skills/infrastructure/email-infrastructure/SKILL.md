---
name: email-infrastructure
description: |
  Email deliverability and DNS-based email authentication covering SPF, DKIM, DMARC,
  MX, PTR, and BIMI records, SMTP relay service configuration (SendGrid, SES, Postmark,
  Mailgun), self-hosted Postfix relay basics, and deliverability testing.

  USE WHEN:
  - Setting up or auditing email DNS records (SPF, DKIM, DMARC, MX, PTR)
  - Configuring a transactional email relay service (SendGrid, Amazon SES, Postmark)
  - Rolling out a DMARC policy from p=none to p=reject
  - Debugging emails landing in spam or being rejected
  - Generating DKIM key pairs for a custom domain
  - Setting up Postfix as a smart relay host
  - Checking email blacklists and Google Postmaster Tools

  DO NOT USE FOR:
  - Building a full mail server (Dovecot IMAP, Postfix + Dovecot stack — scope is relay/deliverability)
  - Marketing email platform setup (Mailchimp, Klaviyo campaign workflows)
  - Email template design or HTML email rendering
  - Inbound email parsing pipelines (use SendGrid Inbound Parse, Mailgun Routes, etc.)
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---

# Email Infrastructure — Deliverability and DNS Authentication

## Why Email Authentication Matters

Without SPF + DKIM + DMARC, any server can forge `From: noreply@yourdomain.com`. Major providers (Google, Microsoft, Yahoo) now reject or spam-folder unauthenticated email. As of 2024, Gmail and Yahoo require DMARC for bulk senders.

| Record | What It Does | Where Set |
|--------|-------------|-----------|
| MX | Where to deliver inbound email | DNS |
| SPF | Which servers are authorized to send for this domain | DNS (TXT) |
| DKIM | Cryptographic signature verifying message origin | DNS (TXT) + mail server |
| DMARC | Policy for SPF/DKIM failures + reporting | DNS (TXT) |
| PTR | Reverse DNS for sending IP | Hosting provider |
| BIMI | Brand logo in inbox (requires DMARC reject) | DNS (TXT) |

---

## MX Records

```dns
; Priority lower = higher preference (10 < 20)
example.com.    3600    IN    MX    10    mail1.example.com.
example.com.    3600    IN    MX    20    mail2.example.com.
```

For relay-only setups (all outbound, no self-hosted inbound), set MX to your relay provider's receiving servers or use a catch-all:
```dns
; SendGrid inbound parse MX
example.com.    3600    IN    MX    10    mx.sendgrid.net.
```

Test MX records:
```bash
dig MX example.com
nslookup -type=MX example.com
# From MXToolbox:
# https://mxtoolbox.com/MXLookup.aspx
```

---

## SPF (Sender Policy Framework)

### SPF Mechanisms

| Mechanism | Meaning |
|-----------|---------|
| `ip4:1.2.3.4` | Authorize single IPv4 address |
| `ip4:1.2.3.0/24` | Authorize IPv4 CIDR range |
| `ip6:2001:db8::/32` | Authorize IPv6 CIDR |
| `include:spf.example.com` | Include another domain's SPF (counts as 1 lookup) |
| `a` | Authorize the domain's A record IP |
| `mx` | Authorize the domain's MX server IPs |
| `~all` | Softfail — treat unauthorized as suspicious (recommended during testing) |
| `-all` | Hardfail — reject unauthorized senders (use only with DMARC p=reject live) |
| `?all` | Neutral — no policy (avoid in production) |
| `+all` | Allow all — completely useless and dangerous, never use |

### SPF Record Examples

```dns
; Basic SPF for domain using only SendGrid
example.com.    3600    IN    TXT    "v=spf1 include:sendgrid.net ~all"

; Multiple authorized senders
example.com.    3600    IN    TXT    "v=spf1 ip4:203.0.113.10 include:sendgrid.net include:amazonses.com ~all"

; Include your hosting provider's IP range + relay
example.com.    3600    IN    TXT    "v=spf1 ip4:203.0.113.0/24 include:spf.mailgun.org ~all"
```

### SPF Lookup Limit

SPF allows a maximum of **10 DNS lookups** during evaluation. `include:`, `a`, `mx`, `ptr`, `exists` each count as a lookup. Exceeding 10 causes `permerror`, which DMARC treats as a failure.

```bash
# Check SPF record and count lookups
dig TXT example.com | grep spf

# Use spf-tools to flatten (replace includes with raw IPs)
# pip install pyspf
python3 -m spf example.com
```

SPF flattening: replace `include:sendgrid.net` with the actual IPs from SendGrid's SPF record. Must be re-flattened when SendGrid rotates IPs — use automation or a flattening service.

---

## DKIM (DomainKeys Identified Mail)

### DKIM Key Generation

```bash
# Generate 2048-bit RSA key pair
openssl genrsa -out dkim_private.key 2048
openssl rsa -in dkim_private.key -pubout -out dkim_public.key

# Extract public key content for DNS TXT record
openssl rsa -in dkim_private.key -pubout -outform der 2>/dev/null | base64 -w0
```

### DKIM DNS TXT Record Format

Selector naming convention: use `<year><month>` or service name (e.g., `sg2024`, `ses1`, `mail`).

```dns
; Full format: <selector>._domainkey.<domain>
sg2024._domainkey.example.com.    3600    IN    TXT    (
    "v=DKIM1; k=rsa; p="
    "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA..."
    "...rest of public key in base64..."
)
```

Split into multiple strings (DNS TXT records max 255 chars per string):
```bash
# Split public key for DNS (many DNS providers do this automatically)
openssl rsa -in dkim_private.key -pubout 2>/dev/null | \
  grep -v "^-" | tr -d '\n' | \
  fold -w 200
```

### DKIM Configuration in Relay Providers

**SendGrid:** Domains → Add Domain → CNAME records provided (SendGrid manages keys). Custom DKIM requires dedicated IP.

**Amazon SES:** Email Identities → Verify Domain → DKIM section → Create DKIM (SES manages 2048-bit keys). Three CNAME records provided.

**Postmark:** Sender Signatures → Add Domain → DKIM TXT records provided.

Test DKIM record:
```bash
dig TXT sg2024._domainkey.example.com

# Send a test email and check headers for:
# DKIM-Signature: v=1; a=rsa-sha256; d=example.com; s=sg2024; ...
# Authentication-Results: dkim=pass header.d=example.com
```

---

## DMARC (Domain-based Message Authentication, Reporting & Conformance)

### DMARC Record Structure

```dns
_dmarc.example.com.    3600    IN    TXT    (
    "v=DMARC1;"
    "p=quarantine;"           ; none | quarantine | reject
    "rua=mailto:dmarc-agg@example.com;"    ; Aggregate reports (daily)
    "ruf=mailto:dmarc-forensic@example.com;"  ; Forensic reports (per-failure)
    "pct=100;"                ; Percentage of messages to apply policy to
    "adkim=s;"                ; DKIM alignment: s=strict, r=relaxed
    "aspf=r;"                 ; SPF alignment: s=strict, r=relaxed
    "sp=reject;"              ; Subdomain policy
    "fo=1"                    ; Forensic options: 0=fail both, 1=fail either, d=DKIM, s=SPF
)
```

**Alignment modes:**
- `relaxed` (default): `example.com` DMARC aligns with `mail.example.com` DKIM/SPF — useful for subdomains
- `strict`: Must be exact domain match

### DMARC Rollout Sequence

**Step 1: Monitor (week 1–4)**
```dns
"v=DMARC1; p=none; rua=mailto:dmarc@example.com; pct=100"
```
Collect aggregate reports. Use dmarcian.com or Postmark DMARC Digests to parse reports. Identify all legitimate senders failing DMARC.

**Step 2: Fix Sending Sources**
- Ensure all authorized mail goes through DKIM-signed relay
- Add any missed senders to SPF
- Remove unknown/unauthorized sending sources

**Step 3: Quarantine (week 4–8)**
```dns
"v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com; pct=10"
```
Start at 10% — only 10% of failing mail goes to spam. Increase `pct` by 10% each week while monitoring reports.

**Step 4: Full Quarantine**
```dns
"v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com; pct=100"
```

**Step 5: Reject (week 8–12)**
```dns
"v=DMARC1; p=reject; rua=mailto:dmarc@example.com; pct=10"
```
Again, ramp `pct` up weekly.

**Step 6: Full Enforcement (target)**
```dns
"v=DMARC1; p=reject; rua=mailto:dmarc@example.com; ruf=mailto:dmarc-forensic@example.com; pct=100; adkim=s; aspf=r"
```

---

## PTR (Reverse DNS)

PTR is a reverse DNS record: `<reversed-IP>.in-addr.arpa.` → `hostname`.

Mail servers check PTR of the sending IP and compare to the `From:` or EHLO hostname. PTR mismatch is a strong spam signal.

```bash
# Check PTR for an IP
dig -x 203.0.113.10
nslookup 203.0.113.10

# Check what your IP's PTR resolves to
curl ifconfig.me   # Get your outbound IP
dig -x $(curl -s ifconfig.me)
```

To set PTR: contact your hosting provider or VPS control panel (e.g., DigitalOcean: Droplet → Settings → rDNS; Hetzner: Server → Networking → IP settings). PTR must match the EHLO hostname your mail server uses.

---

## BIMI (Brand Indicators for Message Identification)

Requires: DMARC `p=reject` + a Verified Mark Certificate (VMC from DigiCert/Entrust).

```dns
; BIMI record (hosted SVG logo + VMC certificate URL)
default._bimi.example.com.    3600    IN    TXT    (
    "v=BIMI1;"
    "l=https://cdn.example.com/logo.svg;"
    "a=https://cdn.example.com/vmc.pem"
)
```

SVG requirements: SVG Tiny PS format, square, brand-safe, publicly accessible HTTPS URL.

---

## Complete DNS Record Set: SendGrid Integration

```dns
; ── MX Records (using SendGrid inbound parse) ──────────────────────────────────
example.com.              3600    IN    MX     10    mx.sendgrid.net.

; ── SPF Record ──────────────────────────────────────────────────────────────────
example.com.              3600    IN    TXT    "v=spf1 include:sendgrid.net ~all"

; ── DKIM (SendGrid provides these CNAME records, not TXT) ────────────────────────
; SendGrid uses CNAME delegation to manage their own DKIM signing
em1234.example.com.       3600    IN    CNAME  u1234.wl.sendgrid.net.
s1._domainkey.example.com. 3600   IN    CNAME  s1.domainkey.u1234.wl.sendgrid.net.
s2._domainkey.example.com. 3600   IN    CNAME  s2.domainkey.u1234.wl.sendgrid.net.

; ── DMARC Record (start with p=none monitoring) ───────────────────────────────────
_dmarc.example.com.       3600    IN    TXT    "v=DMARC1; p=none; rua=mailto:dmarc@example.com; pct=100"

; ── PTR (set via hosting provider control panel) ─────────────────────────────────
; 10.113.0.203.in-addr.arpa. → mail.example.com
```

---

## SMTP Relay Services

### Amazon SES

```bash
# SMTP credentials (different from IAM credentials — generate in SES console)
# SES SMTP endpoint: email-smtp.us-east-1.amazonaws.com:587 (TLS)

# Verify domain in SES (generates DKIM CNAME records)
aws ses verify-domain-identity --domain example.com
aws ses get-identity-dkim-attributes --identities example.com

# Move out of sandbox (required for sending to unverified addresses)
# Request via SES console: Account dashboard → Request production access

# Configure bounce + complaint handling (critical for reputation)
aws ses set-identity-notification-topic \
  --identity example.com \
  --notification-type Bounce \
  --sns-topic arn:aws:sns:us-east-1:123456789:ses-bounces

aws ses set-identity-feedback-forwarding-enabled \
  --identity example.com \
  --forwarding-enabled    # Redirect to verified email if no SNS topic
```

### SendGrid

```bash
# API key (Settings → API Keys → Create)
# Scopes: Mail Send (minimum), plus Mail Settings for bounce management

# Test send via curl
curl -X POST https://api.sendgrid.com/v3/mail/send \
  -H "Authorization: Bearer $SENDGRID_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "personalizations": [{"to": [{"email": "test@example.com"}]}],
    "from": {"email": "noreply@example.com"},
    "subject": "Test",
    "content": [{"type": "text/plain", "value": "Test email"}]
  }'
```

### Postmark

Separate streams for **transactional** (receipts, passwords) and **broadcast** (newsletters). Transactional messages get priority delivery queues.

```bash
# SMTP: smtp.postmarkapp.com:587 (STARTTLS)
# API token: Server Settings → API Tokens
# From address must be verified sender signature
```

---

## Postfix Basics (Smart Relay Host)

`/etc/postfix/main.cf` (key relay settings):
```ini
myhostname = mail.example.com
mydomain = example.com
myorigin = $mydomain
inet_interfaces = loopback-only    # Only accept local submissions
mydestination =                    # Not a final destination — relay only

# Relay all mail through SendGrid SMTP
relayhost = [smtp.sendgrid.net]:587

# SASL authentication for relay
smtp_sasl_auth_enable = yes
smtp_sasl_password_maps = hash:/etc/postfix/sasl_passwd
smtp_sasl_security_options = noanonymous
smtp_tls_security_level = encrypt
smtp_tls_CAfile = /etc/ssl/certs/ca-certificates.crt

# Limits
smtp_destination_concurrency_limit = 5
smtp_destination_rate_delay = 1s
```

`/etc/postfix/sasl_passwd`:
```
[smtp.sendgrid.net]:587    apikey:YOUR_SENDGRID_API_KEY
```

```bash
sudo postmap /etc/postfix/sasl_passwd
sudo chmod 600 /etc/postfix/sasl_passwd /etc/postfix/sasl_passwd.db
sudo systemctl restart postfix

# Test send
echo "Test body" | mail -s "Test subject" test@example.com

# Check mail queue
mailq

# Force retry stuck queue
sudo postqueue -f

# Remove all queued mail (careful!)
sudo postsuper -d ALL
```

---

## Deliverability Testing Tools

| Tool | Purpose | URL |
|------|---------|-----|
| mail-tester.com | Score your email (1–10) for spam triggers | https://www.mail-tester.com |
| MXToolbox | DNS record lookup, blacklist check, email header analysis | https://mxtoolbox.com |
| Google Postmaster Tools | Domain/IP reputation, spam rate, DMARC compliance from Google's view | https://postmaster.google.com |
| dmarcian | DMARC aggregate report parser and visualization | https://dmarcian.com |
| DMARC Digests (Postmark) | Free DMARC weekly digest | https://dmarc.postmarkapp.com |
| MXToolbox Blacklist Check | Check if your IP is on any major blacklists | https://mxtoolbox.com/blacklists.aspx |

```bash
# Verify authentication results from a received email header:
# DKIM verification
dig TXT s1._domainkey.example.com

# Check SPF evaluation for a specific IP
dig TXT example.com | grep spf
# Use: https://www.kitterman.com/spf/validate.html

# Check DMARC policy
dig TXT _dmarc.example.com
```

---

## Anti-Patterns

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| No SPF record | Any server can send as your domain — phishing risk and deliverability failures | Add `v=spf1 include:relay.example.com ~all` immediately |
| `-all` in SPF before DMARC is live | Legitimate mail from forgotten senders hard-rejected immediately | Use `~all` until DMARC p=reject is proven at 100% |
| SPF exceeding 10 DNS lookups | `permerror` — DMARC treats it as SPF failure | Flatten includes to raw IPs using automation |
| Shared sending IP for transactional and marketing | Bounce/complaint from marketing campaigns tanks transactional IP reputation | Use separate IPs or streams (Postmark's separation, SES dedicated IPs) |
| No bounce/complaint handling | High bounce rate leads to IP blacklisting; SES auto-disables sending above threshold | Set up SNS bounce topic + handler to suppress bounced addresses |
| DMARC `p=reject` deployed overnight | Breaks all mail from sources not yet DKIM-signed | Always ramp with `pct=10` incrementally while monitoring reports |
| DKIM keys shorter than 2048 bits | 1024-bit RSA is factored by well-funded attackers | Generate 2048-bit keys; rotate annually |
| Not renewing/rotating DKIM keys | Compromised key with no rotation plan | Rotate keys annually; support two selectors simultaneously during rotation window |
| No PTR record for sending IP | Most spam filters penalize PTR mismatch heavily | Request PTR from hosting provider; must match EHLO hostname |
| Sending to purchased lists | Extremely high complaint rate → immediate blacklisting | Only send to confirmed opt-in subscribers |

---

## Troubleshooting

| Symptom | Likely Cause | Diagnostic & Fix |
|---------|--------------|------------------|
| Emails going to spam | Missing/failing DKIM or SPF, or content triggers | Check mail-tester.com score; review email headers `Authentication-Results:` field |
| DKIM failure in headers | Wrong selector in DNS, or relay not signing | `dig TXT <selector>._domainkey.example.com` — verify public key matches relay config |
| `SPF permerror` | Over 10 DNS lookups in SPF chain | Use `spf-tools` to count lookups; flatten `include:` directives to raw IPs |
| `SPF softfail` but DMARC pass | SPF fails but DKIM passes — DMARC passes if either aligns | This is fine; focus on getting SPF to pass for defense-in-depth |
| DMARC aggregate reports showing failures | Some sending source not in SPF or not DKIM-signing | Parse report XML (use dmarcian); identify failing source by IP; add to SPF or configure DKIM signing |
| High bounce rate in SES | Sending to stale/invalid addresses | SES dashboard → Bounce rate metric; implement real-time bounce handling; clean list |
| SES `MessageRejected: Email address not verified` | SES in sandbox mode or unverified recipient | Request production access via SES console; verify recipient in sandbox |
| Postfix queue building up | Relay auth failure, DNS problem, or rate limiting | `mailq` + `tail -f /var/log/mail.log`; check SASL credentials in `sasl_passwd.db` |
| PTR mismatch errors in bounce messages | PTR record doesn't match EHLO/HELO hostname | Request PTR update from hosting provider; set `myhostname` in Postfix to match PTR |
| Emails delivered but display no DKIM logo in Gmail | BIMI not configured or DMARC not at `p=reject` | BIMI requires DMARC p=reject at 100%; verify `_bimi.` DNS record and VMC certificate |
