---
name: libsodium
description: |
  libsodium — modern, easy-to-use, audited crypto library. Provides authenticated
  encryption (XSalsa20-Poly1305, XChaCha20-Poly1305, AES-GCM), public-key
  cryptography (X25519, Ed25519), key derivation (Argon2id, HKDF, BLAKE2b),
  password hashing, and authenticated streams (secretstream). Wraps NaCl with
  better defaults. Bindings for Rust (sodiumoxide, libsodium-sys-stable, dryoc),
  Python (PyNaCl), JS (libsodium-wrappers), Java/Android (lazysodium-android),
  Swift (Sodium / Clibsodium).

  USE WHEN: user mentions "libsodium", "NaCl", "Sodium", "secretbox",
  "crypto_secretstream", "Argon2", "Argon2id", "X25519", "Ed25519", "PyNaCl",
  "lazysodium", "ChaCha20-Poly1305", "XSalsa20"

  DO NOT USE FOR: SQLite encryption - use `databases/sqlcipher`
  DO NOT USE FOR: File encryption format - use `security/age-encryption`
  DO NOT USE FOR: Bitcoin/secp256k1 crypto - use `bitcoin/cryptography/*`
  DO NOT USE FOR: TLS - use `security/rustls` or platform TLS stack
allowed-tools: Read, Grep, Glob, Write, Edit
---
# libsodium

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `libsodium`.

## Why libsodium

libsodium is the safest general-purpose crypto library for application-level use:
- **Modern primitives** with sensible defaults (XChaCha20-Poly1305, X25519, Ed25519, Argon2id)
- **Misuse-resistant API** — no nonce reuse traps, no IV management mistakes
- **Audited** by multiple third parties
- **Bindings everywhere** — C, Rust, Python, JS, Java/Kotlin, Swift, Go
- **Permissive license** (ISC)
- **Constant-time** implementations

For wallet apps, libsodium covers everything except secp256k1 (Bitcoin). Pair with `secp256k1` for full coverage.

## Primitives Cheat Sheet

| Need | Use | Function family |
|---|---|---|
| Symmetric authenticated encryption | XChaCha20-Poly1305 | `crypto_secretbox` |
| Streaming symmetric encryption | XChaCha20-Poly1305 + chunks | `crypto_secretstream` |
| Public-key encryption | X25519 + XSalsa20-Poly1305 | `crypto_box` |
| Hybrid (sealed) public-key encryption | X25519 anonymous | `crypto_box_seal` |
| Digital signatures | Ed25519 | `crypto_sign` |
| Key exchange | X25519 | `crypto_kx` |
| Password hashing | Argon2id | `crypto_pwhash` |
| Generic hashing | BLAKE2b | `crypto_generichash` |
| MAC | HMAC-SHA256/512 | `crypto_auth` |
| Key derivation from key | HKDF / BLAKE2b | `crypto_kdf` |
| Random bytes | ChaCha20 (CSPRNG) | `randombytes_buf` |
| Constant-time compare | — | `sodium_memcmp` |
| Memory wipe | — | `sodium_memzero` |

## Rust — `sodiumoxide` or `dryoc`

For new Rust code, prefer **`dryoc`** (pure Rust, no system deps):

```toml
[dependencies]
dryoc = "0.7"
```

```rust
use dryoc::dryocsecretbox::DryocSecretBox;
use dryoc::types::*;

fn encrypt_seed(seed: &[u8], key: &[u8; 32]) -> (Vec<u8>, Vec<u8>) {
    let nonce = dryoc::dryocsecretbox::Nonce::gen();
    let key_array: dryoc::dryocsecretbox::Key = dryoc::dryocsecretbox::Key::try_from(key).unwrap();
    let ciphertext = DryocSecretBox::encrypt_to_vecbox(seed, &nonce, &key_array);
    (nonce.to_vec(), ciphertext.to_vec())
}

fn decrypt_seed(ciphertext: &[u8], nonce: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, dryoc::Error> {
    let key_array: dryoc::dryocsecretbox::Key = dryoc::dryocsecretbox::Key::try_from(key).unwrap();
    let nonce_array: dryoc::dryocsecretbox::Nonce = dryoc::dryocsecretbox::Nonce::try_from(nonce).unwrap();
    let secret_box = DryocSecretBox::from_bytes(ciphertext)?;
    secret_box.decrypt_to_vec(&nonce_array, &key_array)
}
```

Or use **`sodiumoxide`** (binds the C lib):

```toml
[dependencies]
sodiumoxide = "0.2"
```

```rust
use sodiumoxide::crypto::secretbox;

sodiumoxide::init().unwrap();

let key = secretbox::gen_key();
let nonce = secretbox::gen_nonce();
let ciphertext = secretbox::seal(b"plaintext", &nonce, &key);
let plaintext = secretbox::open(&ciphertext, &nonce, &key).unwrap();
```

## SecretBox (Symmetric Authenticated Encryption)

```rust
use dryoc::dryocsecretbox::DryocSecretBox;

let key = dryoc::dryocsecretbox::Key::gen();      // 32 bytes
let nonce = dryoc::dryocsecretbox::Nonce::gen();  // 24 bytes (XSalsa20)

let ciphertext = DryocSecretBox::encrypt_to_vecbox(b"plaintext", &nonce, &key);
let plaintext = ciphertext.decrypt_to_vec(&nonce, &key).unwrap();
```

**Critical**: never reuse the same `(key, nonce)` pair. With XSalsa20's 24-byte nonce, random nonces are safe (~2^96 messages).

## SecretStream (Authenticated Streaming)

For encrypting files in chunks (constant memory, can stream from network):

```rust
use dryoc::dryocstream::*;

// Encrypt
let key = Key::gen();
let mut push_stream = DryocStream::init_push(&key);
let header = push_stream.header().clone();

let mut output = Vec::new();
output.extend_from_slice(header.as_array());

for chunk in chunks(input, 64 * 1024) {
    let tag = if chunk.is_last { Tag::FINAL } else { Tag::MESSAGE };
    let encrypted = push_stream.push_to_vec(chunk.data, None, tag).unwrap();
    output.extend_from_slice(&encrypted);
}

// Decrypt
let header_bytes = &input[0..Header::LEN];
let mut pull_stream = DryocStream::init_pull(&key, header_bytes.try_into().unwrap()).unwrap();

let mut decrypted = Vec::new();
let mut offset = Header::LEN;
while offset < input.len() {
    let chunk_end = (offset + chunk_size).min(input.len());
    let (data, tag) = pull_stream.pull_to_vec(&input[offset..chunk_end], None).unwrap();
    decrypted.extend_from_slice(&data);
    offset = chunk_end;
    if tag == Tag::FINAL { break; }
}
```

**Use case**: encrypted backups, log files, large blobs — anything you don't want to load entirely into memory.

## Password Hashing — Argon2id

For deriving keys from user passwords (or wrapping wallet seed encryption keys with a password).

```rust
use dryoc::pwhash::*;

let password = b"correct horse battery staple";
let salt = Salt::gen();

// Hash for storage (stretched with Argon2id)
let hash = VecPwHash::hash_with_salt(
    password,
    salt.clone(),
    Config::sensitive(),                             // OPSLIMIT=4, MEMLIMIT=1GB — for wallet master keys
).unwrap();

// Verify
let valid = hash.verify(password).is_ok();
```

`Config` presets:
- `interactive()` — fast (login, ~1s on phone, ~64MB RAM)
- `moderate()` — slower (~3s, 256MB)
- `sensitive()` — max security (~5s+, 1GB) — use for master wallet keys

For deriving a 32-byte key:

```rust
use dryoc::pwhash::PwHash;

let derived: [u8; 32] = PwHash::derive_key(
    password,
    &salt,
    Config::sensitive(),
).unwrap();
```

## Public-Key Encryption (X25519 + XSalsa20-Poly1305)

```rust
use dryoc::dryocbox::DryocBox;
use dryoc::keypair::*;

let alice_keypair: KeyPair = KeyPair::gen();
let bob_keypair: KeyPair = KeyPair::gen();

let nonce = dryoc::dryocbox::Nonce::gen();

// Alice encrypts for Bob
let ciphertext = DryocBox::encrypt_to_vecbox(
    b"hello bob",
    &nonce,
    &bob_keypair.public_key,
    &alice_keypair.secret_key,
).unwrap();

// Bob decrypts
let plaintext = ciphertext.decrypt_to_vec(
    &nonce,
    &alice_keypair.public_key,
    &bob_keypair.secret_key,
).unwrap();
```

For anonymous sender (sealed box):

```rust
use dryoc::dryocbox::DryocBox;

let bob_keypair = KeyPair::gen();

// Anyone can encrypt with Bob's public key (no sender identity needed)
let sealed = DryocBox::seal_to_vecbox(
    b"anonymous tip",
    &bob_keypair.public_key,
).unwrap();

// Only Bob can decrypt
let plaintext = sealed.unseal_to_vec(
    &bob_keypair.public_key,
    &bob_keypair.secret_key,
).unwrap();
```

## Digital Signatures — Ed25519

```rust
use dryoc::sign::*;

let signing_keypair = SigningKeyPair::gen();

let message = b"sign me";
let signed = SignedMessage::sign_to_vec(message, &signing_keypair.secret_key).unwrap();

// Verify
let verified_message = signed.verify_to_vec(&signing_keypair.public_key).unwrap();
assert_eq!(&verified_message, message);

// Detached signature
let signature = SigningKeyPair::sign_detached(message, &signing_keypair.secret_key);
let valid = SigningKeyPair::verify_detached(message, &signature, &signing_keypair.public_key);
```

## Generic Hashing — BLAKE2b

```rust
use dryoc::generichash::GenericHash;

let hash = GenericHash::hash_with_defaults_to_vec::<_, &[u8]>(b"input data", None).unwrap();
// 32-byte output by default; customizable

// Keyed (MAC-like)
let key: [u8; 32] = [0x42; 32];
let keyed_hash = GenericHash::hash_with_defaults_to_vec(b"input", Some(&key)).unwrap();
```

For HMAC use `crypto_auth_hmacsha256`/`hmacsha512` family.

## Key Derivation — HKDF / `crypto_kdf`

`crypto_kdf` derives subkeys from a master key (BLAKE2b-based):

```rust
use dryoc::kdf::*;

let master = Key::gen();
let context = *b"BHODL_v1";                       // 8 bytes

let subkey: [u8; 32] = master.derive_subkey(1, &context).into();
let another: [u8; 32] = master.derive_subkey(2, &context).into();
```

For HKDF (RFC 5869) use `crypto_kdf_hkdf_sha256_*` family directly.

## Random Bytes

```rust
use dryoc::rng::*;

let mut buf = [0u8; 32];
randombytes_buf(&mut buf);                        // CSPRNG, OS-backed
```

## Memory Hygiene

For wallet seeds and other ultra-sensitive material:

```rust
use dryoc::types::*;

let mut seed_bytes = vec![0u8; 64];
// ... use seed
sodium_memzero(&mut seed_bytes);                  // best-effort wipe
```

For long-lived secrets in memory, use `Protected<T>` types:

```rust
use dryoc::protected::*;

let key: Protected<[u8; 32], LockedReadWrite, NoAccess> = Protected::new();
// Memory locked (mlock), no swap, zeroed on drop
let key = key.unlock_readwrite().unwrap();
// Use key
drop(key);                                        // re-locks, eventually zeroed
```

## Python — PyNaCl

```python
import nacl.secret
import nacl.utils

key = nacl.utils.random(nacl.secret.SecretBox.KEY_SIZE)
box = nacl.secret.SecretBox(key)

ciphertext = box.encrypt(b"plaintext")           # nonce auto-prepended
plaintext = box.decrypt(ciphertext)
```

```python
# Argon2 password hashing
import nacl.pwhash

password = b"correct horse"
hashed = nacl.pwhash.argon2id.str(password)      # bytes ($argon2id$...)
nacl.pwhash.verify(hashed, password)              # raises on mismatch
```

## JavaScript — `libsodium-wrappers`

```js
await sodium.ready;

const key = sodium.randombytes_buf(sodium.crypto_secretbox_KEYBYTES);
const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);

const ciphertext = sodium.crypto_secretbox_easy(message, nonce, key);
const plaintext = sodium.crypto_secretbox_open_easy(ciphertext, nonce, key);
```

For browser: include via npm + bundler. For Node: `npm install libsodium-wrappers`.

## Java/Kotlin — lazysodium-android

```kotlin
implementation("com.goterl:lazysodium-android:5.1.0")
implementation("net.java.dev.jna:jna:5.13.0@aar")
```

```kotlin
val sodium = LazySodiumAndroid(SodiumAndroid())

val key = sodium.cryptoSecretBoxKeygen()
val nonce = sodium.nonce(SecretBox.NONCEBYTES)
val ciphertext = sodium.cryptoSecretBoxEasy("plaintext", nonce, key)
val plaintext = sodium.cryptoSecretBoxOpenEasy(ciphertext, nonce, key)
```

For KMP, write `expect`/`actual` wrapping `dryoc` (Rust via UniFFI) or platform-specific lazysodium/libsodium-swift bindings.

## Swift — `Sodium` (Clibsodium underneath)

```swift
import Sodium

let sodium = Sodium()

let key = sodium.secretBox.key()
let cipher: Bytes? = sodium.secretBox.seal(message: message.bytes, secretKey: key)

if let unencrypted = sodium.secretBox.open(nonceAndAuthenticatedCipherText: cipher!, secretKey: key) {
    let result = String(bytes: unencrypted, encoding: .utf8)
}
```

## Wallet Pattern (Encrypting Seed at Rest)

For BHODL-style storage on top of Keystore/Keychain:

```rust
fn encrypt_seed_for_storage(
    seed: &[u8],
    user_passphrase: &str,
) -> Result<EncryptedSeed> {
    // 1. Derive key from passphrase via Argon2id (ultra-strong)
    let salt = Salt::gen();
    let kek: [u8; 32] = PwHash::derive_key(
        user_passphrase.as_bytes(),
        &salt,
        Config::sensitive(),
    )?;

    // 2. Generate random nonce
    let nonce = dryoc::dryocsecretbox::Nonce::gen();

    // 3. Encrypt seed with derived key
    let ciphertext = DryocSecretBox::encrypt_to_vecbox(seed, &nonce, &Key::try_from(&kek).unwrap());

    Ok(EncryptedSeed {
        ciphertext: ciphertext.to_vec(),
        nonce: nonce.to_vec(),
        salt: salt.to_vec(),
    })
}
```

Layer with hardware-backed key (Keystore/Keychain) for defense in depth: store the Argon2-derived key wrapped in Keystore.

## Anti-Patterns

| Anti-pattern | Why it's bad | Correct approach |
|---|---|---|
| Reusing nonce across messages with same key | Catastrophic — recoverable plaintext | Random 24-byte nonce per message (XSalsa20) |
| Storing key alongside ciphertext | Defeats encryption | Wrap with hardware key (Keystore/Keychain/SEP) |
| Argon2 with `interactive()` for master key | Weaker than needed | Use `sensitive()` for master/wallet keys |
| Reducing PBKDF2/Argon2 iterations for "speed" | Brute-forceable | Keep defaults or higher |
| `==` on MAC/signature comparison | Timing leak | Use `sodium_memcmp` (constant-time) |
| Catching exception, retrying with same nonce | Defeats secretbox guarantees | Re-generate nonce |
| Custom curve choices (P-curves) for new code | Weaker than X25519/Ed25519 | Use libsodium defaults |
| Plain ChaCha20 / Salsa20 (no Poly1305) | No authentication — malleable | Use *Poly1305 variants always |
| Plain `RNG` not from libsodium | Quality varies | Use `randombytes_buf` |
| Calling `sodium_init()` after randomness use | Undefined behavior | Init at app startup |

## Troubleshooting

| Issue | Cause | Fix |
|---|---|---|
| `Verification failed` | Wrong key, wrong nonce, or tampered ciphertext | Verify all three are byte-identical to encrypt-side |
| `Ciphertext too short` | Missing nonce or MAC bytes | Ensure proper serialization (nonce + ciphertext) |
| Slow Argon2 on test machine | Memory limit too high for available RAM | Use `interactive()` or `moderate()` for tests, `sensitive()` for prod |
| JNA load fails on Android | Missing `.so` for ABI | Check JNA dep includes Android ABIs |
| iOS arm64 sim crash | Built for device only | Build for both arm64 device + arm64 sim |
| Memory not zeroed in core dump | `sodium_memzero` is best-effort | Combine with `Protected<T>` for stronger guarantees |
| dryoc version mismatch with libsodium-sys | Pin both to same version | Use one or the other consistently |

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| SQLite encryption | `databases/sqlcipher` |
| File encryption format (interop with `age` CLI) | `security/age-encryption` |
| Bitcoin secp256k1 (Schnorr/ECDSA) | `bitcoin/cryptography/*` |
| TLS | platform TLS or `rustls` |
| Password storage backend (server-side) | bcrypt/scrypt or platform-managed |
| Hardware-backed keys | `mobile/android-native` (Keystore) or `mobile/ios-native` (Keychain/SEP) |
