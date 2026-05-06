---
name: sentry-selfhosted
description: |
  Sentry self-hosted — error tracking, performance monitoring, and crash reporting,
  hosted on your own infrastructure (no third-party data sharing). Critical for
  privacy-respecting apps (wallets, healthcare, finance) where exfil to SaaS is
  unacceptable. Covers Docker Compose self-host install, SDKs (Rust, Kotlin/Android,
  Swift/iOS, JS), event sampling + scrubbing for PII redaction, source maps,
  release health, alert rules. Privacy patterns: opt-in only, route via Tor,
  scrub addresses/balances.

  USE WHEN: user mentions "Sentry", "Sentry self-hosted", "sentry-rust",
  "sentry-android", "sentry-cocoa", "Sentry Relay", "release health",
  "sentry beforeSend", "self-hosted error tracking", "GlitchTip"
  (lightweight Sentry alternative)

  DO NOT USE FOR: Logging - use `observability/rust-tracing` or platform loggers
  DO NOT USE FOR: Metrics (Prometheus) - use Prometheus skill
  DO NOT USE FOR: APM tracing only - use `observability/rust-tracing` (OTel)
  DO NOT USE FOR: Cloud Sentry SaaS - this skill focuses on self-hosted privacy
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Sentry Self-Hosted

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `sentry`.

## Why Self-Host

For wallet apps (BHODL-style) and any privacy-respecting product, sending crash data to a third party is a non-starter:

- Crash payloads can contain user data, addresses, balances
- SaaS retention policies vary; hard to audit
- Regulated environments (HIPAA, finance) often disallow third-party telemetry
- Users distrust apps that phone home

Self-hosted Sentry:
- Full control over retention, access, encryption
- Can run on private network or Tor onion
- Open source (under BSL → Apache 2 after 4 years)
- Same SDKs as cloud Sentry
- **Opt-in only** for sensitive apps — never on by default

For BHODL: Sentry is the right choice **if** crash reporting is enabled by user opt-in, telemetry routes via Tor, and PII is scrubbed.

## Alternatives

| Tool | Comparison |
|---|---|
| **GlitchTip** | Lightweight Sentry-API-compatible alternative, MIT licensed, simpler ops. Uses same SDKs. Best for small/medium apps. |
| **Bugsnag self-hosted** | Closed source after acquisition; not recommended |
| **Custom backend** | Receive raw events, store in DB. Lots of work. |
| **Cloud Sentry** | Easy setup, SaaS — wrong for privacy-respecting apps |

For BHODL-scale: **GlitchTip** if Sentry is overkill. Sentry self-hosted if you need full feature set (release health, performance, distributed tracing).

## Self-Host Setup (Docker Compose)

Sentry official self-host: https://github.com/getsentry/self-hosted

```bash
git clone https://github.com/getsentry/self-hosted.git sentry
cd sentry
git checkout 24.10.0                              # latest stable

# Requires: Docker + Docker Compose, ≥4GB RAM, ≥20GB disk
./install.sh
```

Installation creates:
- ClickHouse (event storage)
- Postgres (metadata)
- Redis (queues)
- Kafka (event ingestion buffer)
- Sentry web + worker

```bash
docker compose up -d
docker compose run --rm web createuser   # create admin
```

Access at `http://localhost:9000`.

For production: front with reverse proxy (Caddy, nginx), TLS via Let's Encrypt, restrict access.

### Resource Footprint

- **Minimum**: 4GB RAM, 4 vCPU, 20GB disk
- **Recommended**: 8GB RAM, 8 vCPU, 100GB+ disk for retention
- **Heavy**: 32GB RAM for high-volume apps

For low-volume wallet app: 4GB VPS works fine.

### GlitchTip (Lighter Alternative)

```bash
# docker-compose.yml
services:
  glitchtip:
    image: glitchtip/glitchtip:latest
    environment:
      DATABASE_URL: postgres://glitchtip:secret@postgres/glitchtip
      SECRET_KEY: <random-32-bytes>
      EMAIL_URL: consolemail://
    ports: ["8000:8000"]
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: glitchtip
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: glitchtip
    volumes: ["pgdata:/var/lib/postgresql/data"]
volumes: { pgdata: }
```

GlitchTip uses Sentry's protocol — all SDKs work unchanged. ~512MB RAM.

## Rust SDK

```toml
[dependencies]
sentry = "0.34"
sentry-tracing = "0.34"                            # bridge from tracing
```

```rust
fn main() {
    let _guard = sentry::init(sentry::ClientOptions {
        dsn: "https://abc@sentry.example.com/1".parse().ok(),
        release: sentry::release_name!(),
        environment: Some("production".into()),
        sample_rate: 1.0,                          // 100% errors
        traces_sample_rate: 0.1,                   // 10% performance
        send_default_pii: false,                    // CRITICAL: never send PII
        before_send: Some(Arc::new(|event| {
            // Scrub addresses, balances, etc.
            Some(scrub_event(event))
        })),
        ..Default::default()
    });

    // Bridge tracing events to Sentry
    let subscriber = tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(sentry_tracing::layer());
    tracing::subscriber::set_global_default(subscriber).unwrap();

    // App
    if let Err(e) = run_app() {
        sentry::capture_error(&*e);
    }
}

fn scrub_event(mut event: sentry::protocol::Event<'static>) -> sentry::protocol::Event<'static> {
    use sentry::protocol::Value;

    // Remove PII fields
    event.user = None;
    event.server_name = None;

    // Scrub message
    event.message = event.message.map(|m| scrub_addresses(&m));

    // Scrub breadcrumbs
    for crumb in &mut event.breadcrumbs {
        crumb.message = crumb.message.as_ref().map(|m| scrub_addresses(m));
        crumb.data.retain(|k, _| !is_sensitive_key(k));
    }

    event
}

fn scrub_addresses(s: &str) -> String {
    // Replace bc1q... and similar with [REDACTED]
    let re = regex::Regex::new(r"\b(bc1[a-z0-9]{38,42}|[13][a-zA-Z0-9]{25,34})\b").unwrap();
    re.replace_all(s, "[REDACTED_ADDR]").to_string()
}

fn is_sensitive_key(k: &str) -> bool {
    matches!(k, "wallet_id" | "address" | "balance" | "seed" | "key" | "txid")
}
```

### Capturing Errors Manually

```rust
match risky_operation() {
    Ok(v) => v,
    Err(e) => {
        sentry::with_scope(
            |scope| {
                scope.set_tag("operation", "wallet_sync");
                scope.set_level(Some(sentry::Level::Warning));
            },
            || sentry::capture_error(&e),
        );
        return Err(e);
    }
}
```

### Performance Monitoring

```rust
let tx = sentry::start_transaction(sentry::TransactionContext::new("wallet.sync", "task"));
sentry::configure_scope(|s| s.set_span(Some(tx.clone().into())));

// ... work ...

tx.finish();
```

## Android SDK (Kotlin)

```kotlin
// app/build.gradle.kts
dependencies {
    implementation("io.sentry:sentry-android:7.18.0")
    implementation("io.sentry:sentry-android-fragment:7.18.0")    // optional
    implementation("io.sentry:sentry-compose:7.18.0")              // Compose
    implementation("io.sentry:sentry-android-okhttp:7.18.0")       // network
}
```

`AndroidManifest.xml`:
```xml
<application>
    <meta-data android:name="io.sentry.dsn" android:value="https://abc@sentry.example.com/1" />
    <meta-data android:name="io.sentry.environment" android:value="production" />
    <meta-data android:name="io.sentry.send-default-pii" android:value="false" />
</application>
```

For programmatic init (recommended for opt-in pattern):

```kotlin
class BHODLApp : Application() {
    override fun onCreate() {
        super.onCreate()

        if (prefs.getBoolean("crash_reports_enabled", false)) {
            SentryAndroid.init(this) { options ->
                options.dsn = "https://abc@sentry.example.com/1"
                options.environment = "production"
                options.tracesSampleRate = 0.1
                options.isSendDefaultPii = false
                options.beforeSend = SentryOptions.BeforeSendCallback { event, hint ->
                    scrubEvent(event)
                }
                options.beforeBreadcrumb = SentryOptions.BeforeBreadcrumbCallback { breadcrumb, hint ->
                    scrubBreadcrumb(breadcrumb)
                }
            }
        }
    }
}

private fun scrubEvent(event: SentryEvent): SentryEvent {
    event.user = null
    event.serverName = null
    event.message?.message?.let { event.message?.message = scrubAddresses(it) }
    return event
}
```

For Compose:

```kotlin
@Composable
fun App() {
    SentryTraced(tag = "App") {
        // your composables — auto-traced
    }
}
```

## iOS SDK (Swift)

```swift
// Package.swift
.package(url: "https://github.com/getsentry/sentry-cocoa.git", from: "8.41.0")
```

```swift
import Sentry

@main
struct BHODLApp: App {
    init() {
        if UserDefaults.standard.bool(forKey: "crash_reports_enabled") {
            SentrySDK.start { options in
                options.dsn = "https://abc@sentry.example.com/1"
                options.environment = "production"
                options.tracesSampleRate = 0.1
                options.sendDefaultPii = false
                options.beforeSend = { event in
                    self.scrubEvent(event)
                }
            }
        }
    }
    var body: some Scene { WindowGroup { ContentView() } }

    func scrubEvent(_ event: Event) -> Event? {
        event.user = nil
        event.serverName = nil
        if let message = event.message?.formatted {
            event.message = SentryMessage(formatted: scrubAddresses(message))
        }
        return event
    }
}
```

## Privacy Patterns (Wallet App Critical)

### 1. Opt-In Only

Never enable crash reporting by default. Settings → "Help us improve" → toggle.

### 2. Scrub Addresses, Balances, Amounts

Use regex to redact Bitcoin addresses, large numbers, hashes. Apply in `beforeSend` and `beforeBreadcrumb`.

### 3. No User Identifiers

Never call `Sentry.setUser(...)` with real ID. Use anonymous device hash if needed for correlation:

```kotlin
options.isAttachStacktrace = true
options.isSendDefaultPii = false
options.setBeforeSend { event, _ ->
    event.user = User().apply { id = anonymousDeviceHash() }   // hashed device ID
    event
}
```

### 4. Route Via Tor (Optional)

For ultra-privacy: route Sentry traffic through Arti (`network/arti`):

```rust
let arti_client = ...;
let sentry_url = "http://sentry.your.onion".to_string();
// Configure HTTP client to use Arti proxy
let transport = SentryTransport::with_http_client(custom_arti_client);
```

### 5. Local Buffer + Manual Send

For BHODL:
- Crash captured locally
- User sees report preview before sending
- Sends only on user confirmation

```kotlin
options.isEnableAutoSessionTracking = false
options.isAttachServerName = false
options.isEnableUserInteractionBreadcrumbs = false   // user actions are sensitive

// Before sending, hold in queue and ask user
options.beforeSend = SentryOptions.BeforeSendCallback { event, hint ->
    queueForUserApproval(event)
    null   // skip auto-send
}
```

## Source Maps / DEBUG Symbols

For meaningful stack traces, upload symbols.

### Android (R8/ProGuard mappings)

```kotlin
// app/build.gradle.kts
sentry {
    autoUploadProguardMapping.set(true)
    includeProguardMapping.set(true)
    autoInstallation { sentryVersion.set("7.18.0") }
}
```

### iOS (dSYM)

```bash
# In Xcode Build Phases, add Run Script:
sentry-cli upload-dif --org bhodl --project ios "$DWARF_DSYM_FOLDER_PATH"
```

### Rust (debug info)

```bash
sentry-cli upload-dif --org bhodl --project rust target/release/bhodl
```

## Release Health

Track crash-free rate per release:

```kotlin
options.release = "bhodl@${BuildConfig.VERSION_NAME}+${BuildConfig.VERSION_CODE}"
options.environment = "production"
options.isEnableAutoSessionTracking = true   // OK for non-sensitive sessions
```

Sentry dashboard shows: % users without crash, % sessions without crash, regressions per release.

For BHODL: opt-in users only, but useful even with small sample.

## Alert Rules

In Sentry UI: Alerts → New Rule.

Examples:
- "Notify on Slack if crash rate >1% for 1 hour in current release"
- "Email maintainers if new error type appears"
- "Page on-call if WalletSync crash count >10/hour"

For a small team: a single Slack channel for high-severity errors is enough.

## Backups

Self-hosted = your responsibility:

```bash
# Backup Postgres
docker compose exec -T postgres pg_dump -U postgres > backup.sql

# Backup ClickHouse (events)
docker compose exec clickhouse clickhouse-client --query "BACKUP ALL TO Disk('backups', 'sentry-$(date +%F)')"
```

For a small wallet app, daily backup to S3-compatible storage is fine.

## Anti-Patterns

| Anti-pattern | Why it's bad | Correct approach |
|---|---|---|
| Crash reports on by default | Violates user trust | Opt-in only |
| Sending PII (`sendDefaultPii = true`) | Leaks user data | Always false; scrub manually |
| No `beforeSend` hook | Default events contain wallet state | Always implement scrubber |
| Logging full stack with secret variables | Stack frames may include args | Mark sensitive args with `@redact` annotations or strip in beforeSend |
| Using cloud Sentry for wallet app | Third-party data leak | Self-host (or GlitchTip) |
| Storing Sentry DSN in source | Allows others to spam your project | Env var or runtime config |
| 100% trace sample rate | Heavy ingestion + cost on self-host | 1-10% for production |
| Forgetting to upload symbols | Useless stack traces | Automate symbol upload in CI |
| No retention policy | Disk fills | Set retention (e.g., 30 days for events) |
| Single admin account, no MFA | Security risk | Multi-user, MFA, restricted access |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Self-host install fails (`Insufficient memory`) | <4GB RAM | Resize VPS or use GlitchTip |
| Events not appearing | DSN wrong, beforeSend returning null | Check Sentry network logs |
| Stack traces unsymbolicated | Symbols not uploaded | Run `sentry-cli upload-dif` |
| ClickHouse disk full | No retention | Configure event retention period |
| Slow Sentry web UI | Resource limits | Increase Docker resource quotas |
| Crash report includes wallet seed | Scrubbing missed it | Audit `beforeSend` thoroughly; redact strings broadly |
| Auto-session tracking enabled in privacy mode | Sessions tracked even when reports off | `isEnableAutoSessionTracking = false` for opt-out users |
| Network calls fail (firewall) | Sentry endpoint not whitelisted | Allow outbound to your Sentry server only |
| Compose / SwiftUI traces too verbose | Auto-instrumentation noisy | Disable auto-tracing; manual transaction wrapping |
| GitHub PR shows error trends | sentry-github integration | OK; or disable if too noisy |

## Migration: SaaS → Self-Hosted

1. Spin up self-host instance
2. Update SDK DSN in config
3. Deploy
4. Verify events appearing in self-host dashboard
5. Decommission SaaS account

Old events stay in SaaS — manual export if needed.

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| Logging (informational) | `observability/rust-tracing` or platform logger |
| Metrics (counters, histograms) | Prometheus / OpenMetrics |
| Distributed tracing only | OpenTelemetry |
| Cloud Sentry SaaS | Cloud Sentry docs (different threat model) |
| Apple's MetricKit | iOS-specific built-in |
| Google Crashlytics (Firebase) | Firebase docs (Google-hosted, similar privacy concerns) |
