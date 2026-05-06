---
name: rustls
description: |
  rustls — modern, safe TLS implementation in pure Rust. Drop-in replacement for
  OpenSSL/native-tls in Rust apps. No C dependencies — perfect for mobile cross-
  compile and embedded targets. Covers ClientConfig + ServerConfig, certificate
  verification with webpki-roots, mTLS, custom verifier (cert pinning), ALPN
  negotiation (HTTP/2, HTTP/3), session resumption, integration with hyper +
  reqwest + tokio.

  USE WHEN: user mentions "rustls", "ClientConfig", "ServerConfig", "webpki-roots",
  "rustls-pemfile", "rustls cert pinning", "rustls mTLS", "rustls Tokio",
  "rustls hyper"

  DO NOT USE FOR: OpenSSL specifics - use OpenSSL skill (or platform TLS)
  DO NOT USE FOR: Apple/Windows native TLS - use platform-specific skills
  DO NOT USE FOR: Tor anonymous transport - use `network/arti`
  DO NOT USE FOR: TLS protocol theory - use OWASP / RFC docs
allowed-tools: Read, Grep, Glob, Write, Edit
---
# rustls — Pure-Rust TLS

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `rustls`.

## Why rustls

| Feature | rustls | openssl-rs | native-tls |
|---|---|---|---|
| Implementation | Pure Rust | Bindings to OpenSSL C | Bindings to OS TLS (Sec/SChannel/OpenSSL) |
| Memory safety | ✅ | ❌ Periodic CVEs | Inherits OS TLS bugs |
| Cross-compile to mobile | ✅ Trivial | Requires OpenSSL build | Platform-dependent |
| TLS 1.3 | ✅ Default | ✅ | Depends on OS |
| TLS 1.2 | ✅ | ✅ | ✅ |
| TLS 1.0/1.1 | ❌ Removed | Configurable | Depends on OS |
| Audit | ✅ NCC + ISRG | C codebase | Platform-dependent |
| Adoption | Growing fast (Cloudflare, Deno, Tokio stack) | Legacy | Legacy |

For Rust libs targeting mobile (Android via cargo-ndk, iOS native Cargo): **rustls is the only sane choice** — OpenSSL cross-compile is painful, native-tls has different APIs per platform.

## Setup

```toml
[dependencies]
rustls = "0.23"
rustls-pemfile = "2"
webpki-roots = "0.26"                     # Mozilla CA bundle
tokio-rustls = "0.26"                      # async wrapper
rustls-pki-types = "1"

# Convenience: enable rustls in HTTP clients
reqwest = { version = "0.12", default-features = false, features = ["rustls-tls", "rustls-tls-webpki-roots"] }
hyper-rustls = "0.27"
```

`reqwest` with `default-features = false` is critical — otherwise it pulls in `native-tls` (= OpenSSL).

## Client — Connect Over TLS

```rust
use rustls::{ClientConfig, RootCertStore};
use rustls_pki_types::ServerName;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio_rustls::TlsConnector;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Use Mozilla's trust roots
    let mut root_store = RootCertStore::empty();
    root_store.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());

    let config = ClientConfig::builder()
        .with_root_certificates(root_store)
        .with_no_client_auth();

    let connector = TlsConnector::from(Arc::new(config));

    let tcp = TcpStream::connect("api.example.com:443").await?;
    let domain = ServerName::try_from("api.example.com")?;
    let mut tls = connector.connect(domain, tcp).await?;

    tls.write_all(b"GET / HTTP/1.0\r\nHost: api.example.com\r\n\r\n").await?;

    let mut response = String::new();
    tls.read_to_string(&mut response).await?;
    println!("{}", response);

    Ok(())
}
```

## Reqwest with rustls (Recommended for Most Apps)

```toml
[dependencies]
reqwest = { version = "0.12", default-features = false, features = ["rustls-tls", "json", "rustls-tls-webpki-roots"] }
```

```rust
let client = reqwest::Client::builder()
    .use_rustls_tls()
    .https_only(true)                              // refuse plain HTTP
    .build()?;

let resp: serde_json::Value = client
    .get("https://api.example.com/health")
    .send()
    .await?
    .json()
    .await?;
```

## Server — Listen with TLS

```rust
use rustls::ServerConfig;
use rustls::pki_types::{CertificateDer, PrivateKeyDer};
use std::fs::File;
use std::io::BufReader;
use tokio::net::TcpListener;
use tokio_rustls::TlsAcceptor;

fn load_certs(path: &str) -> Result<Vec<CertificateDer<'static>>, Box<dyn std::error::Error>> {
    let mut reader = BufReader::new(File::open(path)?);
    let certs: Vec<_> = rustls_pemfile::certs(&mut reader)
        .filter_map(Result::ok)
        .collect();
    Ok(certs)
}

fn load_key(path: &str) -> Result<PrivateKeyDer<'static>, Box<dyn std::error::Error>> {
    let mut reader = BufReader::new(File::open(path)?);
    let key = rustls_pemfile::private_key(&mut reader)?
        .ok_or("no private key found")?;
    Ok(key)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let certs = load_certs("server.crt")?;
    let key = load_key("server.key")?;

    let config = ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(certs, key)?;

    let acceptor = TlsAcceptor::from(Arc::new(config));
    let listener = TcpListener::bind("0.0.0.0:8443").await?;

    loop {
        let (tcp, _addr) = listener.accept().await?;
        let acceptor = acceptor.clone();
        tokio::spawn(async move {
            if let Ok(mut tls) = acceptor.accept(tcp).await {
                // handle TLS-wrapped stream
            }
        });
    }
}
```

## Mutual TLS (mTLS — Client Cert Auth)

```rust
// Server requires client cert
use rustls::server::WebPkiClientVerifier;

let mut client_root_store = RootCertStore::empty();
client_root_store.add_parsable_certificates(load_certs("ca.crt")?);

let verifier = WebPkiClientVerifier::builder(client_root_store.into()).build()?;

let config = ServerConfig::builder()
    .with_client_cert_verifier(verifier)
    .with_single_cert(server_certs, server_key)?;
```

```rust
// Client presents cert
let client_certs = load_certs("client.crt")?;
let client_key = load_key("client.key")?;

let config = ClientConfig::builder()
    .with_root_certificates(root_store)
    .with_client_auth_cert(client_certs, client_key)?;
```

## Certificate Pinning

For BHODL-style wallet apps, pin server cert hash to defend against MITM (rogue CA, compromised TLS termination).

```rust
use rustls::client::danger::{ServerCertVerified, ServerCertVerifier, HandshakeSignatureValid};
use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use rustls::DigitallySignedStruct;

#[derive(Debug)]
struct PinnedCertVerifier {
    expected_pins: Vec<[u8; 32]>,             // SHA-256 of leaf cert SPKI
}

impl ServerCertVerifier for PinnedCertVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer,
        _intermediates: &[CertificateDer],
        _server_name: &ServerName,
        _ocsp: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, rustls::Error> {
        use sha2::{Sha256, Digest};
        let leaf_hash: [u8; 32] = Sha256::digest(end_entity.as_ref()).into();

        if self.expected_pins.iter().any(|pin| pin == &leaf_hash) {
            Ok(ServerCertVerified::assertion())
        } else {
            Err(rustls::Error::General("cert not pinned".into()))
        }
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
        rustls::crypto::ring::default_provider()
            .signature_verification_algorithms
            .supported_schemes()
    }
}

let verifier = PinnedCertVerifier {
    expected_pins: vec![
        [0xab, 0xcd, /* ... 30 more bytes */],
        [0xff, 0xee, /* backup pin */],
    ],
};

let config = ClientConfig::builder()
    .dangerous()
    .with_custom_certificate_verifier(Arc::new(verifier))
    .with_no_client_auth();
```

**Critical for wallets**: pin SPKI hash, not full cert (allows cert rotation without app update if SPKI stays same). Always have backup pins.

## ALPN (HTTP/2, HTTP/3 Negotiation)

```rust
let mut config = ClientConfig::builder()
    .with_root_certificates(root_store)
    .with_no_client_auth();
config.alpn_protocols = vec![b"h2".to_vec(), b"http/1.1".to_vec()];
```

For h3 (QUIC): use `quinn` crate (separate, not raw TLS).

## Session Resumption

```rust
use rustls::client::Resumption;

let config = ClientConfig::builder()
    .with_root_certificates(root_store)
    .with_no_client_auth();
// session resumption is on by default
```

To customize:

```rust
config.resumption = Resumption::store(Arc::new(MyTicketStorage));
```

Speeds up reconnections (1-RTT vs 2-RTT handshake).

## Custom Crypto Provider (FIPS, AWS-LC-rs)

rustls 0.23+ separates crypto providers:

```toml
# Default: ring (BoringSSL crypto, well-audited)
rustls = "0.23"

# Alternative: aws-lc-rs (FIPS-validated, faster on x86_64)
rustls = { version = "0.23", default-features = false, features = ["aws-lc-rs"] }
```

```rust
use rustls::crypto::{ring, aws_lc_rs};

let provider = ring::default_provider();              // or aws_lc_rs::default_provider()
provider.install_default()?;
```

`ring` works everywhere (incl. mobile). `aws-lc-rs` faster on x86_64 server but heavier deps.

## Loading Certs from Various Formats

### From PEM file

```rust
let mut reader = BufReader::new(File::open("ca.pem")?);
let certs: Vec<CertificateDer> = rustls_pemfile::certs(&mut reader)
    .collect::<Result<Vec<_>, _>>()?;
```

### From DER bytes (binary)

```rust
let der_bytes: Vec<u8> = std::fs::read("cert.der")?;
let cert = CertificateDer::from(der_bytes);
```

### Embedded in binary (recommended for mobile)

```rust
const CA_PEM: &[u8] = include_bytes!("../certs/ca.pem");

let mut reader = std::io::Cursor::new(CA_PEM);
let certs: Vec<_> = rustls_pemfile::certs(&mut reader)
    .collect::<Result<Vec<_>, _>>()?;
```

## webpki-roots vs Native Roots

```toml
[dependencies]
webpki-roots = "0.26"                              # Mozilla NSS CA bundle, embedded
# OR
rustls-native-certs = "0.8"                        # Use OS trust store
```

```rust
// webpki-roots (recommended for cross-platform)
root_store.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());

// rustls-native-certs (use OS roots — Keychain on macOS, etc.)
for cert in rustls_native_certs::load_native_certs()? {
    root_store.add(cert)?;
}
```

| Strategy | Pros | Cons |
|---|---|---|
| `webpki-roots` | Consistent across platforms, audited bundle | Stale until app update |
| `rustls-native-certs` | OS-managed, fresh | Different per platform, OS bugs propagate |

For mobile wallets: `webpki-roots` + cert pinning for known endpoints.

## Mobile Cross-Compile

```bash
# Android (cargo-ndk)
cargo ndk -t arm64-v8a -o jniLibs build --release \
    --features="rustls,rustls/ring"

# iOS
cargo build --release --target aarch64-apple-ios \
    --features="rustls/ring"
```

`ring` cross-compiles cleanly to all common targets (Android ARM, iOS arm64, WASM in 2025+).

## Testing TLS

```rust
#[tokio::test]
async fn test_tls_handshake() {
    use rcgen::generate_simple_self_signed;

    // Generate self-signed cert for testing
    let cert = generate_simple_self_signed(vec!["localhost".into()]).unwrap();
    let cert_der = cert.cert.der().clone();
    let key_der = PrivateKeyDer::Pkcs8(cert.key_pair.serialize_der().into());

    // Server
    let server_config = ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(vec![cert_der.clone()], key_der)
        .unwrap();

    // Client trusts the test cert
    let mut root_store = RootCertStore::empty();
    root_store.add(cert_der).unwrap();
    let client_config = ClientConfig::builder()
        .with_root_certificates(root_store)
        .with_no_client_auth();

    // ... test handshake
}
```

## Performance

- TLS 1.3 handshake: 1-RTT (or 0-RTT with PSK)
- AES-GCM: hardware-accelerated on Intel/ARM via `ring`
- ChaCha20-Poly1305: better on ARM without AES-NI
- Memory: ~32-64 KB per connection
- Throughput: 1-10 Gbps on modern CPU (rivals OpenSSL)

## Anti-Patterns

| Anti-pattern | Why it's bad | Correct approach |
|---|---|---|
| `default-features = true` on reqwest | Pulls in OpenSSL | `default-features = false` + explicit `rustls-tls` feature |
| Disabling cert verification (`dangerous_accept_invalid_certs(true)`) | MITM trivial | Only in tests with self-signed cert |
| Pinning full cert (not SPKI) | Breaks on cert rotation | Pin SPKI hash |
| No backup pin | Locks app on cert change | Always 2+ pins |
| `rustls-native-certs` on mobile | Inconsistent OS behavior | `webpki-roots` for predictability |
| Sharing `Arc<ClientConfig>` across thousands of conns | Lock contention possible | Generally fine; profile if hot path |
| Custom verifier without `dangerous()` builder | Compile error | Use `.dangerous().with_custom_certificate_verifier(...)` |
| Mixing TLS 1.0/1.1 expectations | Removed from rustls | Negotiate 1.2+/1.3 |
| Forgetting ALPN for HTTP/2 server | Protocol negotiation fails | Set `alpn_protocols` |
| OpenSSL bindings for "performance" | rustls is competitive + safer | Use rustls unless benchmarks justify |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `UnknownIssuer` cert error | Trust roots empty | Add webpki-roots or pinned cert |
| `BadEncoding` for cert | PEM/DER format mismatch | Verify with `openssl x509 -in cert.pem -text` |
| Cross-compile failure: `ring` build error | Missing C toolchain on host | Install `clang`/`gcc` for cross-compile |
| `InvalidServerName` error | Wrong hostname format | Use raw hostname, no port |
| Slow handshake | TLS 1.2 forced | Enable TLS 1.3 (default in rustls) |
| Client cert rejected | CA chain incomplete | Verify intermediate certs in chain |
| `NoCipherSuitesInCommon` | Custom cipher list mismatch | Use defaults |
| reqwest pulls openssl despite `rustls-tls` feature | Transitive dep enables `default-tls` | Audit `cargo tree` for openssl-sys |
| OOM after many TLS connections | Session cache unlimited | Configure session cache size |
| Mobile app size increased | rustls + crypto provider added | Acceptable cost (~500KB-1MB), often replaces OpenSSL anyway |

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| OpenSSL-specific (FIPS legacy, EC engine) | OpenSSL skill |
| Apple SecureTransport / Windows SChannel | Platform skills |
| Tor anonymity | `network/arti` |
| QUIC / HTTP/3 | `quinn` crate (separate) |
| TLS protocol theory | RFC 8446 / OWASP |
| WebPKI parsing | `webpki` crate alone |
