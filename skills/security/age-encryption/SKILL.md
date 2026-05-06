---
name: age-encryption
description: |
  age — modern file encryption format and tool by Filippo Valsorda. Replaces GPG
  for most use cases (encrypted backups, exports, secrets in CI). Covers age CLI,
  X25519 + Scrypt-based recipients, SSH key recipients, plugin system (YubiKey,
  Secure Enclave, age-keyring), Rust (`age` crate), Go (filippo.io/age),
  encrypted backup workflows for wallets.

  USE WHEN: user mentions "age", "age-encryption", "rage", "filippo.io/age",
  "ssh-rsa age", "age plugin", "age-yubikey", "age recipient", "age identity",
  ".age file", "age-keygen"

  DO NOT USE FOR: SQLite encryption - use `databases/sqlcipher`
  DO NOT USE FOR: General crypto primitives - use `security/libsodium`
  DO NOT USE FOR: GPG-specific workflows - use GPG-specific tooling
  DO NOT USE FOR: Real-time stream encryption - use `security/libsodium` (secretstream)
allowed-tools: Read, Grep, Glob, Write, Edit
---
# age (and rage) — Modern File Encryption

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `age`.

## What age Is

`age` (pronounced "ah-gay" 🦗) is a simple, modern, secure file encryption tool. Spec at https://age-encryption.org. Implementations:
- **Go reference** — `filippo.io/age` (CLI: `age`)
- **Rust port** — `str4d/rage` (CLI: `rage`, `rage-keygen`)
- **JS** — `age-encryption` npm package

**Properties**:
- One-line API for encrypt/decrypt
- X25519-based public-key recipients (32-byte short string `age1...`)
- Scrypt-based passphrase recipients
- SSH key recipients (Ed25519 and RSA) — encrypt to existing GitHub `~/.ssh/authorized_keys`
- Plugin system: YubiKey, Secure Enclave, TPM, age-keyring (passwordstore)
- Streaming format (constant memory, supports very large files)
- Authenticated encryption (ChaCha20-Poly1305 chunks + HMAC)

For BHODL-style wallets: ideal for **encrypted backups** (seed + descriptors + labels exported as a single `.age` file).

## CLI Quick Start

### Generate keypair

```bash
age-keygen -o key.txt
# Public key: age1qz5j...
```

`key.txt` contains:
```
# created: 2026-05-04T10:00:00Z
# public key: age1qz5jksw7g7e9q...
AGE-SECRET-KEY-1XYZ...
```

### Encrypt (one or more recipients)

```bash
# To public key
age -r age1qz5jksw7g7e9q... -o secret.age secret.txt

# To passphrase (Scrypt-derived)
age -p -o secret.age secret.txt
# Enter passphrase: ***

# Multiple recipients (any can decrypt)
age -r age1abc... -r age1def... -r ssh-ed25519... -o backup.age backup.tar
```

### Decrypt

```bash
age -d -i key.txt -o secret.txt secret.age

# Passphrase
age -d -o secret.txt secret.age
# Enter passphrase: ***
```

### Pipe usage (UNIX-friendly)

```bash
tar czf - ./wallet | age -r age1abc... > backup.age

age -d -i key.txt backup.age | tar xzf -
```

## SSH Recipients

age can encrypt directly to existing SSH public keys (Ed25519 or RSA):

```bash
# To one specific SSH key
age -R ~/.ssh/id_ed25519.pub -o file.age file.txt

# To everyone in your GitHub authorized keys
curl https://github.com/USERNAME.keys | age -R - -o file.age file.txt

# Decrypt with corresponding SSH private key
age -d -i ~/.ssh/id_ed25519 file.age
```

Useful for sharing secrets with collaborators without setting up new keys.

## Plugins (YubiKey, Secure Enclave, TPM)

age plugins handle non-software identities. Install plugin → use as identity/recipient with prefix.

### age-yubikey

```bash
brew install age-plugin-yubikey

age-plugin-yubikey                              # interactive setup
# Generates identity bound to YubiKey, prints recipient: age1yubikey1...

age -r age1yubikey1abc... -o secret.age secret.txt
age -d -i ~/.config/age/yubikey.txt secret.age  # touches YubiKey for confirm
```

### age-plugin-se (Apple Secure Enclave)

```bash
brew install age-plugin-se

age-plugin-se keygen --access-control=any-biometry-or-passcode -o se-key.txt
# Emits: age1se1abc...

age -r age1se1abc... -o secret.age secret.txt
age -d -i se-key.txt secret.age                # prompts Touch/FaceID
```

For BHODL desktop wallet companion: encrypt a seed backup that **only your YubiKey can decrypt** — no passphrase to forget.

### age-plugin-tpm

```bash
age-plugin-tpm                                  # bind to system TPM
```

## File Format (High Level)

```
age-encryption.org/v1
-> X25519 KEY_AGREEMENT...
WRAPPED_FILE_KEY...
-> X25519 KEY_AGREEMENT...
WRAPPED_FILE_KEY...
-> scrypt SALT WORK_FACTOR
WRAPPED_FILE_KEY...
--- HEADER_HMAC

[binary ChaCha20-Poly1305 chunks]
```

Each recipient gets its own wrapped file key. The body is encrypted once with a random 16-byte file key, split into 64KB authenticated chunks. Streaming-friendly: decrypt without buffering whole file.

## Rust — `age` crate

```toml
[dependencies]
age = "0.10"
```

```rust
use age::{Encryptor, Decryptor, x25519};
use std::io::{Read, Write};

fn encrypt_to_recipient(plaintext: &[u8], recipient: &x25519::Recipient) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let encryptor = Encryptor::with_recipients(vec![Box::new(recipient.clone())])
        .ok_or("no recipients")?;

    let mut encrypted = vec![];
    let mut writer = encryptor.wrap_output(&mut encrypted)?;
    writer.write_all(plaintext)?;
    writer.finish()?;

    Ok(encrypted)
}

fn decrypt_with_identity(ciphertext: &[u8], identity: &x25519::Identity) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let decryptor = match Decryptor::new(ciphertext)? {
        Decryptor::Recipients(d) => d,
        _ => return Err("not a recipient-encrypted file".into()),
    };

    let mut decrypted = vec![];
    let mut reader = decryptor.decrypt(std::iter::once(identity as &dyn age::Identity))?;
    reader.read_to_end(&mut decrypted)?;

    Ok(decrypted)
}

fn generate_identity() -> x25519::Identity {
    x25519::Identity::generate()
    // identity.to_public() returns Recipient
}
```

## Streaming (Large Files)

```rust
use age::stream::StreamWriter;
use std::fs::File;
use std::io::BufReader;

let recipient: x25519::Recipient = "age1abc...".parse()?;
let encryptor = Encryptor::with_recipients(vec![Box::new(recipient)]).unwrap();

let input = BufReader::new(File::open("backup.tar")?);
let output = File::create("backup.age")?;
let mut writer = encryptor.wrap_output(output)?;

std::io::copy(&mut input, &mut writer)?;
writer.finish()?;
```

Constant memory — works for multi-GB files.

## Passphrase Encryption

```rust
use age::scrypt;
use secrecy::Secret;

let passphrase = Secret::new("correct horse".to_owned());
let recipient = scrypt::Recipient::new(passphrase.clone());

let encryptor = Encryptor::with_recipients(vec![Box::new(recipient)]).unwrap();
// ... encrypt as above

// Decrypt
let decryptor = match Decryptor::new(&ciphertext[..])? {
    Decryptor::Passphrase(d) => d,
    _ => return Err("not passphrase-encrypted".into()),
};
let mut reader = decryptor.decrypt(&passphrase, None)?;
```

`work_factor` parameter (Scrypt N) defaults to 18 (~1s on phone). Increase for higher-value secrets.

## SSH Key Identities

```rust
use age::ssh;

let recipient: ssh::Recipient = "ssh-ed25519 AAAA...".parse()?;
// or read from file:
let recipient = ssh::Recipient::from_pubkey_file("/path/to/key.pub")?;

// Identities (private keys)
let identity = ssh::Identity::from_buffer(BufReader::new(File::open("~/.ssh/id_ed25519")?), Some("comment"))?;
```

## Wallet Backup Pattern

For BHODL: export full wallet (seed, descriptors, BIP329 labels, transaction metadata) as a single age-encrypted blob.

```rust
use age::{Encryptor, x25519};
use serde::Serialize;
use std::io::Write;

#[derive(Serialize)]
struct WalletBackup {
    version: u32,
    seed_phrase: String,
    descriptors: Vec<String>,
    labels: serde_json::Value,        // BIP329
    metadata: BackupMetadata,
}

fn create_backup(
    wallet: &Wallet,
    recipients: Vec<Box<dyn age::Recipient + Send + 'static>>,
) -> Result<Vec<u8>> {
    let backup = WalletBackup {
        version: 1,
        seed_phrase: wallet.seed_phrase()?,
        descriptors: wallet.descriptors(),
        labels: wallet.export_labels()?,
        metadata: BackupMetadata::now(),
    };
    let json = serde_json::to_vec(&backup)?;

    let encryptor = Encryptor::with_recipients(recipients)
        .ok_or("no recipients")?;

    let mut encrypted = vec![];
    let mut writer = encryptor.wrap_output(&mut encrypted)?;
    writer.write_all(&json)?;
    writer.finish()?;

    Ok(encrypted)
}

// Multi-recipient backup: passphrase + YubiKey + companion's age key
let recipients: Vec<Box<dyn age::Recipient + Send + 'static>> = vec![
    Box::new(scrypt::Recipient::new(passphrase)),
    Box::new("age1yubikey1abc...".parse::<YubiKeyRecipient>()?),
    Box::new("age1xyz...".parse::<x25519::Recipient>()?),
];

let backup_bytes = create_backup(&wallet, recipients)?;
std::fs::write("bhodl-backup.age", backup_bytes)?;
```

User can decrypt with **any one** of: their passphrase, their YubiKey, or their companion's key. Defense in depth without single point of failure.

## age vs GPG

| Aspect | age | GPG |
|---|---|---|
| Spec age | Modern (2019+) | Old (1991+) |
| Algorithms | Modern (X25519, ChaCha20-Poly1305, Scrypt) | Configurable, default OK |
| Identity format | 32-byte short string | Long fingerprint, web of trust |
| Key file format | Single line | Complex keyring |
| CLI ergonomics | Simple | Notoriously complex |
| Streaming | Yes, native | Yes |
| Recipient encryption | Yes | Yes |
| Signing | No (use minisign or ssh-keygen) | Yes |
| Web of trust | No | Yes |
| Interop with old systems | No | Yes |

For new projects: **age**. For legacy/compliance: GPG. For signing: minisign or ssh signatures.

## Header Inspection

```bash
age --help                                       # show all options
file backup.age                                  # detects "age encrypted file"

# Read header (first ~1KB)
head -c 1024 backup.age
```

For programmatic header parsing:

```rust
let decryptor = Decryptor::new(&ciphertext[..])?;
match decryptor {
    Decryptor::Recipients(_) => println!("recipient-encrypted"),
    Decryptor::Passphrase(_) => println!("passphrase-encrypted"),
}
```

## Format Versioning

age uses `age-encryption.org/v1` header — stable since v1.0. Future versions will be backward-incompatible (intentionally) but provide migration tools.

For backups: include your own version field inside the encrypted payload (don't rely on age format version for app schema migration).

## Anti-Patterns

| Anti-pattern | Why it's bad | Correct approach |
|---|---|---|
| Single passphrase recipient with no backup | Lost passphrase = lost data | Multi-recipient: passphrase + YubiKey + paper key derived from seed |
| Hardcoded age recipient in app | Updates break encrypted-at-rest data | Allow user-configured recipients |
| Encrypting with age over an unencrypted SQLite file | Plain DB exists in temp | Use SQLCipher for DB; age for export |
| Using age for streaming protocols | Not designed for it (chunked finalization) | Use libsodium `secretstream` |
| Encrypting key file with age | Recursive key management | Use Keystore/Keychain/SEP for key wrapping |
| Treating `.age` files as opaque blobs | Header readable | Don't store sensitive metadata in plaintext (filename, date) — encrypt at OS level too |
| Using age for inter-process IPC | Overhead | Use libsodium `crypto_box` directly |
| `age -p` with weak passphrases | Brute-force | Use diceware (≥6 words) or passphrase manager |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "no identity matched any of the recipients" | Wrong key for ciphertext | Try other identities; check recipient list during encrypt |
| Plugin not found | Plugin binary not in PATH | Install plugin via `cargo install` or `brew install`, ensure `age-plugin-*` is in PATH |
| Slow decrypt | Large file or weak Scrypt work factor | Streaming should be fast; check disk I/O |
| Checksum verification failure | Truncated/corrupted file | Re-download or restore from backup |
| Cannot decrypt on different machine | Identity tied to hardware (YubiKey, SEP) | Need same hardware OR additional fallback recipient |
| `parsing recipient` error | Wrong format | Recipients start `age1...` (X25519) or `ssh-ed25519/...` (SSH) |
| Empty output | `--armor` was set during encrypt but not detected on decrypt | Use `-a` flag (armor) consistently |

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| SQLite encryption | `databases/sqlcipher` |
| Real-time symmetric encryption (libsodium-style API) | `security/libsodium` |
| Bitcoin signing/keys | `bitcoin/cryptography/*` |
| TLS | platform TLS / `rustls` |
| Code signing | minisign or sigstore |
| GPG-specific workflows (web of trust, signing email) | GPG-specific tooling |
| Hardware key wrapping for app-internal use | Keystore (Android), Keychain/SEP (iOS) |
