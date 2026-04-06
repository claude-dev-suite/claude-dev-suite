---
name: dns
description: |
  DNS concepts, record types, and management skill: Cloudflare, Route 53,
  DNSSEC, debugging with dig/nslookup, TTL strategy, and split-horizon DNS.

  USE WHEN:
  - Adding or modifying DNS records for a web application, mail system, or API
  - Configuring Cloudflare proxy (orange cloud) or DNS-only mode
  - Setting up Route 53 hosted zones, health checks, and routing policies
  - Debugging DNS propagation, CNAME loops, MX failures, or SPF/DKIM issues
  - Planning a migration with minimal downtime (TTL strategy)
  - Configuring DNSSEC, CAA records, or reverse DNS (PTR)
  - Setting up split-horizon DNS for internal vs external resolution

  DO NOT USE FOR:
  - SSL/TLS certificate issuance (use ssl-tls skill)
  - Nginx or application-level routing (use nginx or api-gateway skill)
  - Service mesh internal DNS (use kubernetes or service-mesh skill)
  - Email server configuration beyond DNS records (use a dedicated email skill)
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---

# DNS — Concepts, Records, and Management

## Record Type Reference

| Type | Format | Example value | Use case | Key notes |
|---|---|---|---|---|
| **A** | IPv4 address | `93.184.216.34` | Map hostname to IPv4 | Most common record; can have multiple values for round-robin |
| **AAAA** | IPv6 address | `2606:2800:220:1:248:1893:25c8:1946` | Map hostname to IPv6 | Dual-stack: both A and AAAA on same name |
| **CNAME** | Fully-qualified hostname | `myapp.netlify.app.` | Alias one name to another | Cannot be used at zone apex; trailing dot = absolute FQDN |
| **MX** | Priority + hostname | `10 mail.example.com.` | Mail server routing | Lower priority number = higher preference; hostname must resolve via A/AAAA |
| **TXT** | Quoted string | `"v=spf1 include:_spf.google.com ~all"` | SPF, DKIM, DMARC, domain ownership verification | Multiple TXT records on same name are valid |
| **SRV** | Priority Weight Port Target | `10 5 5060 sip.example.com.` | Service discovery (SIP, XMPP, game servers) | Format: `_service._proto.name` e.g. `_sip._tcp.example.com` |
| **CAA** | Flags Tag Value | `0 issue "letsencrypt.org"` | Restrict which CAs can issue certs for domain | Protects against misissued certificates |
| **PTR** | Fully-qualified hostname | `host.example.com.` | Reverse DNS (IP → hostname) | Managed in `in-addr.arpa` zone; controlled by IP owner (ISP/cloud provider) |
| **NS** | Nameserver hostname | `ns1.cloudflare.com.` | Authoritative nameservers for zone | Set at registrar; changes propagate slowly (24-48h) |
| **SOA** | Serial Refresh Retry Expire Minimum | (auto-managed) | Zone metadata; used in AXFR transfers | Serial must increment on every change for NOTIFY to work |
| **ALIAS / ANAME** | Hostname | `myapp.netlify.app.` | Apex CNAME equivalent | Cloudflare: CNAME Flattening; Route 53: ALIAS record; resolves at zone apex |
| **DS** | Key tag Algorithm Digest type Digest | `12345 13 2 ABC123...` | DNSSEC — links parent zone to child zone signing key | Created in parent zone; references KSK in child |

---

## TTL Strategy

TTL (Time to Live, in seconds) controls how long resolvers cache a record. Higher TTL = fewer queries to your nameservers; lower TTL = faster propagation of changes.

### Standard TTL Values

| TTL | Seconds | Use case |
|---|---|---|
| 1 minute | 60 | Active incident response / testing |
| 5 minutes | 300 | Pre-migration staging |
| 1 hour | 3600 | Default for most records |
| 1 day | 86400 | Stable records (MX, NS) |
| 1 week | 604800 | Static infrastructure |

### Migration TTL Strategy (Zero-Downtime Record Change)

```
Day -7:   Lower TTL of the record from 86400 to 300 (5 minutes)
          Wait for caches to expire (1 full day at old TTL = 86400s)

Day 0:    Change the record to the new value
          Old value expires from caches within 300s (5 minutes)
          New value takes effect almost immediately

Day +1:   Restore TTL to 86400 once confident in new value
```

This pattern ensures no resolver is caching the old value when you make the switch.

---

## Cloudflare Setup for a Typical Web App

```
# Step-by-step zone configuration sequence

1. Add site to Cloudflare (free plan works for most apps)
   → Cloudflare scans existing records (import them)

2. Update NS records at your registrar to point to Cloudflare nameservers:
   ns1.cloudflare.com
   ns2.cloudflare.com
   (NS propagation: 24-48h)

3. Configure records in Cloudflare dashboard:

   Type  Name    Content              Proxy status   TTL
   A     @       93.184.216.34        Proxied (🟠)   Auto
   A     www     93.184.216.34        Proxied (🟠)   Auto
   CNAME api     backend.example.com  Proxied (🟠)   Auto
   MX    @       10 mail.example.com  DNS only (⬜)  Auto
   TXT   @       v=spf1 ...           DNS only (⬜)  Auto
   TXT   _dmarc  v=DMARC1; ...        DNS only (⬜)  Auto

4. SSL/TLS mode: Full (strict) — requires valid cert on origin
   Security > Settings: Enable HSTS (after app is stable)
   Speed > Optimization: Enable Brotli compression

5. Page rules (legacy) or Rules > Redirect rules:
   http://example.com/* → https://example.com/$1 (301)
```

### Cloudflare Proxy (Orange Cloud) vs DNS-Only (Grey Cloud)

| Setting | IP exposed | DDoS protection | Cloudflare CDN/cache | WebSockets | Use when |
|---|---|---|---|---|---|
| **Proxied** (orange) | Cloudflare IPs shown | Yes | Yes | Supported | Public web, APIs, static sites |
| **DNS-only** (grey) | Origin IP exposed | No | No | N/A | Mail (MX targets must be DNS-only), non-HTTP services, internal servers |

**Important:** A record being proxied hides your origin IP, but only if you never expose your origin IP elsewhere (e.g., in certificate transparency logs, email headers, or old DNS records).

---

## Route 53 — Key Concepts

```bash
# Install AWS CLI v2
pip install awscli --upgrade
aws configure  # Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, region

# List all hosted zones
aws route53 list-hosted-zones --output table

# Get hosted zone ID for example.com
ZONE_ID=$(aws route53 list-hosted-zones-by-name \
    --dns-name example.com \
    --query 'HostedZones[0].Id' \
    --output text | cut -d/ -f3)

# Upsert a record using change batch JSON
aws route53 change-resource-record-sets \
    --hosted-zone-id "$ZONE_ID" \
    --change-batch '{
        "Changes": [{
            "Action": "UPSERT",
            "ResourceRecordSet": {
                "Name": "api.example.com",
                "Type": "A",
                "TTL": 300,
                "ResourceRecords": [{"Value": "93.184.216.34"}]
            }
        }]
    }'

# Create an ALIAS record (apex CNAME equivalent) pointing to an ALB
aws route53 change-resource-record-sets \
    --hosted-zone-id "$ZONE_ID" \
    --change-batch '{
        "Changes": [{
            "Action": "UPSERT",
            "ResourceRecordSet": {
                "Name": "example.com",
                "Type": "A",
                "AliasTarget": {
                    "HostedZoneId": "Z35SXDOTRQ7X7K",
                    "DNSName": "my-alb-123.us-east-1.elb.amazonaws.com.",
                    "EvaluateTargetHealth": true
                }
            }
        }]
    }'
```

### Route 53 Routing Policies

| Policy | Use case | Notes |
|---|---|---|
| **Simple** | Single resource | Default; no health checks |
| **Weighted** | A/B testing, canary deployments | Set weights 0-255; 0 = no traffic |
| **Latency** | Multi-region lowest-latency routing | AWS measures latency between client and region |
| **Failover** | Active-passive HA | Requires health check on primary record |
| **Geolocation** | Serve different content by country/continent | Falls back to default if no match |
| **Multivalue Answer** | Poor-man's load balancing with health checks | Returns up to 8 healthy records |

---

## dig — Complete Command Reference

```bash
# Basic query (A record)
dig example.com

# Short output (just the answer)
dig +short example.com
dig +short example.com A

# Query a specific record type
dig example.com MX
dig example.com TXT
dig example.com AAAA
dig example.com NS
dig example.com SOA
dig example.com CAA
dig example.com SRV

# Query a specific nameserver (bypass system resolver)
dig @8.8.8.8 example.com A         # Google Public DNS
dig @1.1.1.1 example.com A         # Cloudflare
dig @ns1.cloudflare.com example.com A  # Query authoritative NS directly

# Trace the full delegation chain from root servers
dig +trace example.com

# Check TXT records (SPF, DKIM, DMARC)
dig +short example.com TXT
dig +short _dmarc.example.com TXT
dig +short mail._domainkey.example.com TXT

# Reverse DNS lookup (PTR)
dig -x 93.184.216.34
dig +short -x 93.184.216.34

# Check DNSSEC chain
dig +dnssec example.com
dig +sigchase example.com A  # Validate DNSSEC chain (requires dig ≥ 9.9)

# Show all sections (answer, authority, additional)
dig +all example.com

# Check propagation against multiple resolvers
for ns in 8.8.8.8 1.1.1.1 9.9.9.9 208.67.222.222; do
    echo "--- $ns ---"
    dig @$ns +short example.com A
done

# Query SRV record (format: _service._proto.domain)
dig _https._tcp.example.com SRV
```

---

## SPF / DKIM / DMARC Quick Reference

### SPF TXT record
```
"v=spf1 ip4:203.0.113.0/24 include:_spf.google.com include:sendgrid.net ~all"
```
- `ip4:` — explicitly authorise IP range
- `include:` — include another domain's SPF (counts toward the 10 DNS lookup limit)
- `~all` — soft fail (mark as spam); `-all` = hard fail (reject)
- `+all` — allow all (useless for security)

### DKIM TXT record (example with key)
```
Name:    mail._domainkey.example.com
Value:   "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ..."
```
Generated by your email provider; `p=` is the public key.

### DMARC TXT record
```
Name:    _dmarc.example.com
Value:   "v=DMARC1; p=reject; rua=mailto:dmarc@example.com; ruf=mailto:dmarc@example.com; pct=100"
```
- `p=none` → monitor only (start here)
- `p=quarantine` → send to spam
- `p=reject` → reject failing mail (fully enforced)
- `rua=` → aggregate report address
- `pct=100` → apply to 100% of mail

---

## Split-Horizon DNS

Split-horizon (or split-brain) DNS returns different answers for the same hostname depending on the source of the query — typically internal vs external.

### Implementation with systemd-resolved (Linux client)

```
# /etc/systemd/resolved.conf.d/split-horizon.conf
[Resolve]
DNS=10.0.0.53          # Internal DNS server for internal zone
Domains=~internal.example.com ~corp.internal
```

### Implementation with Bind9 (server-side)

```
# /etc/bind/named.conf.local
view "internal" {
    match-clients { 10.0.0.0/8; 172.16.0.0/12; localhost; };
    zone "example.com" {
        type master;
        file "/etc/bind/zones/example.com.internal";
    };
};

view "external" {
    match-clients { any; };
    zone "example.com" {
        type master;
        file "/etc/bind/zones/example.com.external";
    };
};
```

Internal zone can return private IPs (10.x.x.x) for `api.example.com` while the external zone returns the public IP or load balancer.

---

## DNS Propagation: How It Works

When you update a record, the authoritative nameserver immediately has the new value. But:

1. Your ISP's recursive resolver cached the old value for up to `TTL` seconds.
2. Other resolvers around the world have their own cached copies.
3. "DNS propagation" = waiting for all caches to expire their copies.

True propagation time = the TTL that was set **before** you made the change.

Check propagation across global resolvers:
- https://dnschecker.org — visual map of resolver responses
- https://mxtoolbox.com — MX, SPF, DKIM, DMARC lookup tools
- `dig @<resolver> +short <name>` — test specific resolvers

---

## Anti-Patterns

| Anti-pattern | Why it's harmful | Fix |
|---|---|---|
| **CNAME at zone apex** (`@`) | RFC 1034 violation; breaks NS and SOA records; some resolvers reject it | Use ALIAS/ANAME (Cloudflare CNAME Flattening) or Route 53 ALIAS record at apex |
| **TTL too high during migration** | Old value cached for days; impossible to roll back quickly | Lower TTL to 300s at least one full TTL cycle before any planned migration |
| **No CAA record** | Any CA can issue a cert for your domain; misissued certs possible | Add `CAA 0 issue "letsencrypt.org"` and optionally `CAA 0 iodef "mailto:security@example.com"` |
| **SPF with too many DNS lookups (> 10)** | Receivers fail SPF validation with `permerror` — mail gets rejected or marked spam | Flatten SPF using tools like dmarcian SPF Surveyor; replace `include:` chains with `ip4:`/`ip6:` |
| **DMARC `p=none` left in place indefinitely** | Monitoring-only mode never enforces; DMARC provides no protection | Progress to `p=quarantine` then `p=reject` over 2-4 weeks after reviewing aggregate reports |
| **Wildcard `*.example.com` without base domain record** | Subdomain takeover risk; attacker registers a dangling CNAME target | Ensure wildcard doesn't mask legitimate subdomains; add specific records where needed |
| **PTR record not set for mail server IP** | Many mail servers reject or spam-score mail from IPs without matching PTR (rDNS) | Request PTR record from your hosting provider / ISP pointing to `mail.example.com` |
| **Proxying all records through Cloudflare including mail** | MX records and their targets must resolve to origin; Cloudflare proxy on MX targets breaks SMTP | Set MX records and their A record targets to DNS-only (grey cloud) |
| **NS records changed at both registrar and zone** | Conflicting NS records cause intermittent resolution failures | NS records at registrar (glue records) must match NS records in the zone; change only at registrar |
| **Changing NS without checking current TTL** | Old NS cached at resolvers for up to 48h; some queries go to old nameservers | Lower NS TTL to 300s before changing, or accept 24-48h propagation |

---

## Troubleshooting

| Symptom | Likely cause | Diagnostic / Fix |
|---|---|---|
| **CNAME loop** | A points to B which points back to A | `dig +trace example.com`; trace the CNAME chain; break the loop at the registrar |
| **MX not resolving** | MX target is a CNAME (RFC violation) or MX target has no A/AAAA record | MX must point to a hostname with an A/AAAA record, not a CNAME |
| **SPF "permerror" / too many lookups** | Chain of `include:` directives exceeds 10 DNS lookups | Count with MXToolbox SPF check; flatten `include:` chains to `ip4:`/`ip6:` |
| **DKIM verification failure** | Key mismatch, key too short, or selector name wrong | `dig +short mail._domainkey.example.com TXT`; compare with key in email header `DKIM-Signature:` |
| **DNS not propagating after record change** | Resolver still serving cached old value | Wait for TTL; test with `dig @8.8.8.8 +short name`; check TTL was previously lowered |
| **`dig +trace` shows SERVFAIL** | DNSSEC validation failure, NS record mismatch, or zone transfer issue | Check DS record in parent zone; verify DNSSEC signatures; `dig +dnssec +multiline example.com DNSKEY` |
| **Subdomain returns wrong IP internally** | Split-horizon not configured; internal hosts resolving via public DNS | Set internal DNS server for the zone; configure clients to use internal resolver for that domain |
| **NXDOMAIN for `www` but `@` works** | `www` record not added when moving to new DNS provider | Add `CNAME www @ ` or `A www <IP>` explicitly; import all records when switching |
| **Mail rejected: "550 No PTR record"** | Sending mail server IP has no reverse DNS (PTR) | Request PTR from hosting provider; PTR must match mail server's FQDN |
| **Cloudflare 1xxx error after enabling proxy** | Origin IP block, origin firewall blocking Cloudflare IPs, or SSL mode mismatch | Whitelist Cloudflare IP ranges on origin; check SSL mode is "Full (strict)" not "Flexible" |
