---
name: sqlcipher
description: |
  SQLCipher — transparent AES-256 encryption for SQLite databases. Drop-in
  SQLite replacement used by mobile wallets, password managers, and offline-first
  apps storing sensitive data. Covers key derivation (PBKDF2), key rotation,
  performance tuning, integration in Rust (rusqlite + bundled-sqlcipher feature),
  Android (sqlcipher-android), iOS (SQLCipher.framework or Swift package),
  KMP (SQLDelight + SQLCipher driver), license model (community BSD-3 vs commercial).

  USE WHEN: user mentions "SQLCipher", "encrypted SQLite", "PRAGMA key", "PRAGMA rekey",
  "sqlite-cipher", "rusqlite bundled-sqlcipher", "encrypted database for mobile wallet",
  "SQLDelight encryption"

  DO NOT USE FOR: Plain SQLite without encryption - use `databases/sqlite` (or relevant skill)
  DO NOT USE FOR: Server-side encrypted DB (use TDE) - use `databases/postgresql` etc.
  DO NOT USE FOR: Encryption primitives outside SQLite - use `security/libsodium`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# SQLCipher

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `sqlcipher`.

## What SQLCipher Is

SQLCipher is a fork of SQLite that adds **transparent, page-level AES-256-CBC encryption** (default, configurable to GCM in 4.6+). Each database page is encrypted before write and decrypted after read, with HMAC-SHA512 authentication per page.

**Properties**:
- API-compatible with SQLite — same SQL, same C API, drop-in
- Key derivation: PBKDF2-HMAC-SHA512 with 256k iterations (default in 4.x)
- Random salt per database (stored in first 16 bytes of file)
- Per-page IV
- Slight performance overhead (~5-15% depending on workload)

**License**: BSD-3 community edition (everything you need for production wallets). Commercial license adds enterprise features (FIPS 140-2 validation, additional support).

**Used by**: Signal, Brave, Authy, Standard Notes, BlueWallet, many mobile wallets.

## Quick Start (CLI)

```bash
# Open encrypted DB
sqlcipher wallet.db
sqlite> PRAGMA key = 'my-strong-passphrase';
sqlite> SELECT count(*) FROM sqlite_master;     -- triggers decryption check

# Encrypt existing plain DB
sqlite> ATTACH DATABASE 'wallet_encrypted.db' AS encrypted KEY 'passphrase';
sqlite> SELECT sqlcipher_export('encrypted');
sqlite> DETACH DATABASE encrypted;

# Decrypt encrypted DB to plain (for migration testing)
sqlite> PRAGMA key = 'passphrase';
sqlite> ATTACH DATABASE 'plain.db' AS plaintext KEY '';
sqlite> SELECT sqlcipher_export('plaintext');
sqlite> DETACH DATABASE plaintext;
```

**Critical**: Always set `PRAGMA key` BEFORE any other query. The first query after open is what triggers decryption — wrong key → "file is not a database" error.

## Key Derivation Modes

### Passphrase-derived (default)

```sql
PRAGMA key = 'user-passphrase';
-- SQLCipher derives 256-bit AES key via PBKDF2-HMAC-SHA512(passphrase, salt, 256000 iter)
```

### Raw key (recommended for wallets)

For wallet apps, derive the key OUTSIDE SQLCipher (from Keychain/Keystore-stored material) and pass as raw hex:

```sql
PRAGMA key = "x'2DD29CA851E7B56E4697B0E1F08507293D761A05CE4D1B628AC60AFA59A4FA08'";
-- 64 hex chars = 32 bytes = 256-bit AES key
```

This bypasses PBKDF2 (faster open) and lets you use proper hardware-backed key storage.

## PRAGMA Reference

| PRAGMA | Purpose | Default (v4.x) |
|---|---|---|
| `PRAGMA key = '...'` | Set passphrase | (required) |
| `PRAGMA key = "x'...'"` | Set raw 32-byte key | (alternative) |
| `PRAGMA rekey = 'new'` | Change passphrase (re-encrypts whole DB) | — |
| `PRAGMA cipher_page_size = 4096` | DB page size | 4096 |
| `PRAGMA kdf_iter = 256000` | PBKDF2 iterations | 256000 (v4) |
| `PRAGMA cipher_kdf_algorithm = PBKDF2_HMAC_SHA512` | KDF algorithm | SHA512 |
| `PRAGMA cipher_hmac_algorithm = HMAC_SHA512` | HMAC | SHA512 |
| `PRAGMA cipher_use_hmac = ON` | Per-page HMAC | ON |
| `PRAGMA cipher_plaintext_header_size = 0` | Bytes left unencrypted at start (rare) | 0 |
| `PRAGMA cipher_settings` | Show all current settings | — |

For maximum compatibility with v3 databases (legacy):

```sql
PRAGMA cipher_compatibility = 3;
```

## Rust — rusqlite with `bundled-sqlcipher`

```toml
# Cargo.toml
[dependencies]
rusqlite = { version = "0.32", features = ["bundled-sqlcipher"] }
```

`bundled-sqlcipher` compiles SQLCipher from source, statically linked. No system dependency.

```rust
use rusqlite::{Connection, params};
use anyhow::Result;

pub struct WalletDb {
    conn: Connection,
}

impl WalletDb {
    pub fn open(path: &str, key: &[u8; 32]) -> Result<Self> {
        let conn = Connection::open(path)?;

        // Set raw key (hex-encoded)
        let key_hex: String = key.iter().map(|b| format!("{:02x}", b)).collect();
        conn.pragma_update(None, "key", format!("x'{}'", key_hex))?;

        // Verify key works (triggers decryption)
        conn.query_row("SELECT count(*) FROM sqlite_master", [], |_| Ok(()))?;

        // Optional tuning
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        conn.pragma_update(None, "cache_size", -65536)?;            // 64MB cache

        // Schema
        conn.execute_batch(include_str!("schema.sql"))?;

        Ok(Self { conn })
    }

    pub fn rekey(&self, new_key: &[u8; 32]) -> Result<()> {
        let key_hex: String = new_key.iter().map(|b| format!("{:02x}", b)).collect();
        self.conn.pragma_update(None, "rekey", format!("x'{}'", key_hex))?;
        Ok(())
    }
}
```

For BHODL-style wallet:
- Derive 32-byte AES key from Keystore-wrapped seed material (see `mobile/android-native` and `mobile/ios-native`)
- Pass to `WalletDb::open` as raw key — never store the key on disk

## Android — sqlcipher-android

```kotlin
// build.gradle.kts
implementation("net.zetetic:sqlcipher-android:4.6.1")
implementation("androidx.sqlite:sqlite:2.5.0-alpha10")    // shared interface
```

```kotlin
import net.zetetic.database.sqlcipher.SQLiteDatabase
import net.zetetic.database.sqlcipher.SupportFactory

// One-time init
SQLiteDatabase.loadLibs(applicationContext)

// Direct usage
val db = SQLiteDatabase.openOrCreateDatabase(
    File(filesDir, "wallet.db"),
    "passphrase",
    null,
    null
)
```

### With Room

```kotlin
val passphrase = getEncryptionKey()                       // from Keystore-wrapped storage
val factory = SupportFactory(passphrase)

val db = Room.databaseBuilder(context, AppDatabase::class.java, "wallet.db")
    .openHelperFactory(factory)
    .build()
```

### With SQLDelight

```kotlin
implementation("net.zetetic:sqlcipher-android:4.6.1")
implementation("androidx.sqlite:sqlite:2.5.0-alpha10")
implementation("app.cash.sqldelight:android-driver:2.0.2")
```

```kotlin
import app.cash.sqldelight.driver.android.AndroidSqliteDriver
import net.zetetic.database.sqlcipher.SupportFactory

val factory = SupportFactory(passphrase)
val driver = AndroidSqliteDriver(
    schema = AppDatabase.Schema,
    context = context,
    name = "wallet.db",
    factory = factory,
)
val db = AppDatabase(driver)
```

## iOS — SQLCipher (CocoaPods or SwiftPM)

### CocoaPods

```ruby
pod 'SQLCipher', '~> 4.6'
```

### SwiftPM

```swift
.package(url: "https://github.com/sqlcipher/sqlcipher-swift", from: "4.6.0")
```

### GRDB.swift with SQLCipher

For typed Swift access:

```ruby
pod 'GRDB.swift/SQLCipher', '~> 6.0'
pod 'SQLCipher', '~> 4.6'
```

```swift
import GRDB

var config = Configuration()
config.prepareDatabase { db in
    try db.usePassphrase(passphrase)
}

let dbQueue = try DatabaseQueue(path: dbPath, configuration: config)

try dbQueue.write { db in
    try db.execute(sql: """
        CREATE TABLE IF NOT EXISTS wallet (
            id TEXT PRIMARY KEY,
            name TEXT,
            balance INTEGER
        )
    """)
}
```

### Raw SQLite C API

```swift
import SQLite3

var db: OpaquePointer?
sqlite3_open(dbPath, &db)

let key = "passphrase"
sqlite3_key(db, key, Int32(key.utf8.count))

// Or raw key
let raw = "x'2DD29CA8...'"
sqlite3_exec(db, "PRAGMA key = \"\(raw)\";", nil, nil, nil)
```

## KMP — SQLDelight with SQLCipher

```kotlin
// shared/build.gradle.kts
sourceSets {
    androidMain.dependencies {
        implementation("net.zetetic:sqlcipher-android:4.6.1")
        implementation("androidx.sqlite:sqlite:2.5.0-alpha10")
        implementation("app.cash.sqldelight:android-driver:2.0.2")
    }
    iosMain.dependencies {
        // iOS Native driver doesn't bundle SQLCipher — use cinterop with SQLCipher.framework
        implementation("app.cash.sqldelight:native-driver:2.0.2")
    }
}
```

For iOS, you need a custom Native driver wrapping SQLCipher (community packages exist; or write minimal cinterop). The Android side works out-of-box.

## Key Rotation

```sql
PRAGMA rekey = 'new-passphrase';
-- or
PRAGMA rekey = "x'NEW_HEX_KEY'";
```

Rewrites every page with new key. **Long operation for large DBs** (10s of seconds for 100MB).

For atomic rotation with backup:

```sql
ATTACH DATABASE 'wallet_new.db' AS new KEY 'new-passphrase';
SELECT sqlcipher_export('new');
DETACH DATABASE new;
-- Then atomically replace old file
```

## Performance Tuning

| PRAGMA | Recommended for mobile wallet | Effect |
|---|---|---|
| `journal_mode = WAL` | ✅ | Concurrent reads + writes |
| `synchronous = NORMAL` | ✅ | Faster writes, still safe with WAL |
| `cache_size = -65536` | ✅ | 64MB page cache |
| `temp_store = MEMORY` | ✅ | Temp tables in RAM |
| `cipher_page_size = 4096` | (default) | Larger pages (8192) help large blob workloads |
| `cipher_use_hmac = ON` | ✅ | Per-page authentication (don't disable) |

## Backup & Verification

### Verify integrity

```sql
PRAGMA cipher_integrity_check;
PRAGMA integrity_check;
```

`cipher_integrity_check` validates HMACs page-by-page (catches tampering). `integrity_check` validates SQL structure.

### Backup

```rust
// rusqlite — backup API works with SQLCipher
let mut backup = Backup::new(&src_conn, &mut dst_conn)?;
backup.run_to_completion(5, Duration::from_millis(250), None)?;
```

The destination DB inherits the source's key (or set its own with `PRAGMA key` after attach).

### Export plain copy (for testing only — never in production)

```sql
PRAGMA key = '...';
ATTACH DATABASE 'plain.db' AS plaintext KEY '';
SELECT sqlcipher_export('plaintext');
DETACH DATABASE plaintext;
```

## Migration from Plain SQLite

```rust
fn encrypt_existing_db(plain_path: &str, encrypted_path: &str, key: &[u8; 32]) -> Result<()> {
    let conn = Connection::open(plain_path)?;
    let key_hex: String = key.iter().map(|b| format!("{:02x}", b)).collect();

    conn.execute_batch(&format!(
        "ATTACH DATABASE '{}' AS encrypted KEY \"x'{}'\";
         SELECT sqlcipher_export('encrypted');
         DETACH DATABASE encrypted;",
        encrypted_path, key_hex
    ))?;

    Ok(())
}
```

## Wallet Pattern (BHODL-style)

```
1. App generates wallet seed (BIP39, in Rust BDK)
2. App generates random 256-bit DB encryption key
3. App opens SQLCipher DB with that key
4. Stores wallet state, transactions, labels (BIP329) inside encrypted DB
5. Encrypts the DB key with Keystore (Android) / Secure Enclave (iOS) wrapped key
6. On unlock: biometric → unwrap DB key → open SQLCipher DB
```

```rust
pub struct EncryptedWallet {
    db: WalletDb,
    bdk_wallet: bdk::Wallet,
}

impl EncryptedWallet {
    pub fn unlock(
        db_path: &str,
        wrapped_db_key: &[u8],
        unwrap_fn: impl FnOnce(&[u8]) -> Result<[u8; 32]>,
    ) -> Result<Self> {
        let db_key = unwrap_fn(wrapped_db_key)?;
        let db = WalletDb::open(db_path, &db_key)?;
        let seed = db.load_encrypted_seed()?;
        let bdk_wallet = bdk::Wallet::new(&seed)?;
        Ok(Self { db, bdk_wallet })
    }
}
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "file is not a database" | Wrong key, or key set after first query | Set `PRAGMA key` IMMEDIATELY after open |
| "file is encrypted or is not a database" (v3 DB on v4) | Compatibility | `PRAGMA cipher_compatibility = 3` |
| Slow open (~500ms) | PBKDF2 with 256k iterations | Use raw key (`x'...'`) instead of passphrase |
| Slow inserts | No transaction wrap | `BEGIN; ... ; COMMIT;` |
| WAL files visible (-wal, -shm) | Normal — WAL mode | Include in backups, delete only via SQLite API |
| Crash on iOS arm64 sim | Wrong arch in static lib | Build SQLCipher for `aarch64-apple-ios-sim` separately |
| Unable to load library on Android | Missing `loadLibs(context)` | Call once at app startup |
| `PRAGMA rekey` hangs | Operating on huge DB | Schedule as background task; not on UI thread |
| HMAC error after corruption | Bit flip from disk | Restore from backup; integrity check before commit |
| Password change loses data | Forgot to `rekey` (just changed `key`) | `PRAGMA rekey` re-encrypts; `PRAGMA key` only sets for current connection |

## Anti-Patterns

| Anti-pattern | Why it's bad | Correct approach |
|---|---|---|
| Hardcoded passphrase in source | Key extractable | Derive at runtime from Keystore/Keychain |
| Storing DB key in SharedPreferences/UserDefaults | Plain text | Wrap with hardware-backed key |
| `PRAGMA key` after first SELECT | Won't take effect | Set immediately after `open` |
| Disabling `cipher_use_hmac` | No tamper detection | Keep HMAC ON |
| Reducing `kdf_iter` for "speed" | Brute-force easier | Keep ≥256k or use raw key |
| Reusing DB key across users | Data leak between accounts | One key per account |
| Sharing DB with extension via plain file | Unencrypted at rest | Use App Group + same key, not file copies |
| Not handling `KeyPermanentlyInvalidatedException` | Wallet bricks on biometric re-enroll | Plan recovery flow |
| Storing seed in same DB encrypted with same key | If DB key compromised, seed too | Layer: Keystore → DB key → DB → encrypted seed inside |

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| Plain SQLite | `databases/sql-fundamentals` (or relevant skill) |
| Server PostgreSQL TDE | PostgreSQL skill |
| KMP SQLDelight setup | `mobile/kotlin-multiplatform/quick-ref/libraries.md` |
| Keystore key derivation | `mobile/android-native/quick-ref/keystore-biometric.md` |
| Keychain key wrapping | `mobile/ios-native/quick-ref/secure-storage.md` |
| General-purpose encryption | `security/libsodium` |
