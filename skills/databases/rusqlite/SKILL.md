---
name: rusqlite
description: |
  rusqlite — ergonomic Rust SQLite client with bundled SQLite (no system dep),
  prepared statements, parameter binding, transactions, custom types via traits,
  blob I/O, FTS5 full-text search, JSON1 extension, R-Tree spatial indexes,
  connection pooling (r2d2_sqlite or deadpool-sqlite), and SQLCipher integration
  via `bundled-sqlcipher` feature. Async wrapper via `tokio-rusqlite` or `sqlx`.

  USE WHEN: user mentions "rusqlite", "rust sqlite", "Connection::open", "params!",
  "rusqlite ToSql", "rusqlite FromSql", "bundled-sqlite", "tokio-rusqlite",
  "rusqlite migration"

  DO NOT USE FOR: SQLCipher specifics - use `databases/sqlcipher`
  DO NOT USE FOR: SQL language - use `databases/sql-fundamentals`
  DO NOT USE FOR: Server PostgreSQL/MySQL - use respective skills
  DO NOT USE FOR: ORM patterns (Diesel, SeaORM) - use ORM-specific skills
allowed-tools: Read, Grep, Glob, Write, Edit
---
# rusqlite — SQLite for Rust

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `rusqlite`.

## Setup

```toml
[dependencies]
rusqlite = { version = "0.32", features = ["bundled"] }
```

Features:
- `bundled` — compile SQLite from source, no system dep (recommended for portability)
- `bundled-sqlcipher` — SQLCipher (encrypted SQLite) — see `databases/sqlcipher`
- `bundled-sqlcipher-vendored-openssl` — SQLCipher with vendored OpenSSL
- `chrono`, `time`, `uuid`, `url`, `serde_json` — type integrations
- `blob` — blob I/O streaming
- `array` — query parameter as array
- `loadable_extension` — load runtime SQLite extensions
- `vtab` — virtual tables
- `backup` — online backup API
- `functions` — register custom SQL functions

## Quick Start

```rust
use rusqlite::{Connection, Result, params};

fn main() -> Result<()> {
    let conn = Connection::open("wallet.db")?;

    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS wallet (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            balance INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_wallet_created ON wallet(created_at);
    ")?;

    conn.execute(
        "INSERT INTO wallet (id, name, balance, created_at) VALUES (?1, ?2, ?3, ?4)",
        params!["abc123", "Main", 100_000, 1735689600i64],
    )?;

    let mut stmt = conn.prepare("SELECT id, name, balance FROM wallet WHERE balance > ?1")?;
    let rows = stmt.query_map([0i64], |row| {
        Ok(Wallet {
            id: row.get(0)?,
            name: row.get(1)?,
            balance: row.get(2)?,
        })
    })?;

    for wallet in rows {
        println!("{:?}", wallet?);
    }

    Ok(())
}

#[derive(Debug)]
struct Wallet {
    id: String,
    name: String,
    balance: i64,
}
```

## Connection Patterns

```rust
// In-memory (great for tests)
let conn = Connection::open_in_memory()?;

// File path
let conn = Connection::open("data.db")?;

// With flags
use rusqlite::OpenFlags;
let conn = Connection::open_with_flags(
    "data.db",
    OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
)?;

// Pragmas after open
conn.pragma_update(None, "journal_mode", "WAL")?;
conn.pragma_update(None, "synchronous", "NORMAL")?;
conn.pragma_update(None, "cache_size", -65536)?;        // 64MB cache
conn.pragma_update(None, "foreign_keys", "ON")?;
conn.pragma_update(None, "temp_store", "MEMORY")?;
```

For wallet apps, **WAL mode is essential** — concurrent reads + single writer without blocking.

## Parameter Binding

```rust
// Positional
conn.execute("INSERT INTO t (a, b) VALUES (?1, ?2)", params![1, "hello"])?;

// Named
use rusqlite::named_params;
conn.execute(
    "INSERT INTO t (a, b) VALUES (:a, :b)",
    named_params! { ":a": 1, ":b": "hello" },
)?;

// Single param shortcut
conn.execute("DELETE FROM t WHERE id = ?", [42])?;
```

**Always use parameters, never string-format SQL** — SQL injection vulnerable.

## Querying

```rust
// Single row, single column
let count: i64 = conn.query_row(
    "SELECT count(*) FROM wallet",
    [],
    |row| row.get(0),
)?;

// Single row, multiple columns
let (id, name): (String, String) = conn.query_row(
    "SELECT id, name FROM wallet WHERE id = ?",
    ["abc"],
    |row| Ok((row.get(0)?, row.get(1)?)),
)?;

// Optional row (handles "no rows")
use rusqlite::OptionalExtension;
let maybe_wallet: Option<Wallet> = conn
    .query_row(
        "SELECT id, name, balance FROM wallet WHERE id = ?",
        ["abc"],
        |row| Ok(Wallet {
            id: row.get(0)?,
            name: row.get(1)?,
            balance: row.get(2)?,
        }),
    )
    .optional()?;

// Iterate rows
let mut stmt = conn.prepare("SELECT id FROM wallet ORDER BY created_at")?;
let ids: Vec<String> = stmt
    .query_map([], |row| row.get(0))?
    .collect::<Result<Vec<_>, _>>()?;
```

## Transactions

```rust
let tx = conn.transaction()?;
tx.execute("UPDATE wallet SET balance = balance - ? WHERE id = ?",
    params![1000, "from_id"])?;
tx.execute("UPDATE wallet SET balance = balance + ? WHERE id = ?",
    params![1000, "to_id"])?;
tx.commit()?;                                     // OR tx.rollback()? OR drop (auto-rollback)
```

For deferred transactions:

```rust
use rusqlite::TransactionBehavior;
let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
// IMMEDIATE locks DB for write at tx start (vs DEFERRED at first write)
```

For wallet apps: use `IMMEDIATE` for transfer flows to avoid SQLITE_BUSY mid-transaction.

## Custom Types — `ToSql` / `FromSql`

For domain types stored as native SQLite types (TEXT, INTEGER, BLOB):

```rust
use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSql, ToSqlOutput, ValueRef};
use rusqlite::Result;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct Address(String);

impl ToSql for Address {
    fn to_sql(&self) -> Result<ToSqlOutput<'_>> {
        Ok(ToSqlOutput::from(self.0.as_str()))
    }
}

impl FromSql for Address {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        let s = value.as_str()?;
        if !s.starts_with("bc1") {
            return Err(FromSqlError::InvalidType);
        }
        Ok(Address(s.to_string()))
    }
}

// Use directly
let addr: Address = conn.query_row(
    "SELECT address FROM utxo WHERE txid = ?",
    ["abc"],
    |row| row.get(0),
)?;
```

For enums:

```rust
#[derive(Debug, Clone, Copy)]
enum NetworkKind { Bitcoin, Testnet, Signet, Regtest }

impl ToSql for NetworkKind {
    fn to_sql(&self) -> Result<ToSqlOutput<'_>> {
        let s = match self {
            NetworkKind::Bitcoin => "bitcoin",
            NetworkKind::Testnet => "testnet",
            NetworkKind::Signet => "signet",
            NetworkKind::Regtest => "regtest",
        };
        Ok(ToSqlOutput::from(s))
    }
}

impl FromSql for NetworkKind {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        match value.as_str()? {
            "bitcoin" => Ok(NetworkKind::Bitcoin),
            "testnet" => Ok(NetworkKind::Testnet),
            "signet" => Ok(NetworkKind::Signet),
            "regtest" => Ok(NetworkKind::Regtest),
            _ => Err(FromSqlError::InvalidType),
        }
    }
}
```

## JSON1 Support

```rust
// Stores JSON as TEXT, queryable via SQLite JSON1
conn.execute("CREATE TABLE labels (txid TEXT PRIMARY KEY, data TEXT)", [])?;

let label = serde_json::json!({
    "type": "tx",
    "label": "Coffee",
    "category": "food",
});

conn.execute(
    "INSERT INTO labels VALUES (?1, ?2)",
    params!["abc...", label.to_string()],
)?;

// Query via json_extract
let category: String = conn.query_row(
    "SELECT json_extract(data, '$.category') FROM labels WHERE txid = ?",
    ["abc..."],
    |row| row.get(0),
)?;
```

For BIP329 wallet labels: this is the perfect storage pattern.

## Blob I/O (Streaming Large Binary)

```rust
use std::io::{Read, Write};

// Insert blob with size, then stream
conn.execute(
    "INSERT INTO files (name, content) VALUES (?, ZEROBLOB(?))",
    params!["doc.pdf", 1024 * 1024],          // 1 MB blob
)?;

let rowid = conn.last_insert_rowid();

// Open for write
let mut blob = conn.blob_open(rusqlite::DatabaseName::Main, "files", "content", rowid, false)?;
blob.write_all(&data)?;
drop(blob);                                    // close

// Open for read
let mut blob = conn.blob_open(rusqlite::DatabaseName::Main, "files", "content", rowid, true)?;
let mut buf = vec![0u8; 4096];
loop {
    let n = blob.read(&mut buf)?;
    if n == 0 { break; }
    process(&buf[..n]);
}
```

## FTS5 Full-Text Search

```rust
conn.execute_batch("
    CREATE VIRTUAL TABLE tx_search USING fts5(
        txid, label, notes, tokenize='porter ascii'
    );
")?;

conn.execute(
    "INSERT INTO tx_search (txid, label, notes) VALUES (?, ?, ?)",
    params!["abc", "Coffee at Starbucks", "Morning latte"],
)?;

// Search
let mut stmt = conn.prepare("SELECT txid, label FROM tx_search WHERE tx_search MATCH ?")?;
let results = stmt
    .query_map(["coffee"], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?
    .collect::<Result<Vec<_>, _>>()?;
```

## Migrations

Use `rusqlite_migration` (or `refinery`):

```toml
rusqlite_migration = "1.3"
```

```rust
use rusqlite_migration::{Migrations, M};

let migrations = Migrations::new(vec![
    M::up("CREATE TABLE wallet (id TEXT PRIMARY KEY, name TEXT)"),
    M::up("ALTER TABLE wallet ADD COLUMN balance INTEGER DEFAULT 0"),
    M::up("CREATE INDEX idx_balance ON wallet(balance)"),
]);

migrations.to_latest(&mut conn)?;
```

For production: keep migrations as separate `.sql` files, version-controlled.

## Connection Pooling

For multi-threaded access (each thread needs own Connection — Connection is `Send` not `Sync`):

```toml
r2d2 = "0.8"
r2d2_sqlite = "0.25"
```

```rust
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;

let manager = SqliteConnectionManager::file("wallet.db")
    .with_init(|c| {
        c.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
    });

let pool = Pool::builder()
    .max_size(15)
    .build(manager)?;

// Per-task
let conn = pool.get()?;
let count: i64 = conn.query_row("SELECT count(*) FROM wallet", [], |row| row.get(0))?;
```

## Async (tokio-rusqlite)

rusqlite is sync — wrapping in `tokio-rusqlite` keeps connection on a dedicated thread:

```toml
tokio-rusqlite = "0.6"
```

```rust
use tokio_rusqlite::Connection;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let conn = Connection::open("wallet.db").await?;

    let count = conn.call(|conn| {
        let n: i64 = conn.query_row("SELECT count(*) FROM wallet", [], |row| row.get(0))?;
        Ok(n)
    }).await?;

    println!("Count: {}", count);
    Ok(())
}
```

Each query runs on the dedicated thread — no async/await contention with the SQLite C API.

For full async ORM: use **sqlx** with sqlite driver (separate skill).

## SQLCipher Integration

```toml
[dependencies]
rusqlite = { version = "0.32", features = ["bundled-sqlcipher"] }
```

```rust
let conn = Connection::open("wallet.db")?;
let key_hex: String = key_bytes.iter().map(|b| format!("{:02x}", b)).collect();
conn.pragma_update(None, "key", format!("x'{}'", key_hex))?;

// Verify key
conn.query_row("SELECT count(*) FROM sqlite_master", [], |_| Ok(()))?;

// Tune
conn.pragma_update(None, "journal_mode", "WAL")?;
```

See `databases/sqlcipher` for full SQLCipher details.

## Custom SQL Functions (Rust → SQL)

```toml
features = ["functions"]
```

```rust
use rusqlite::functions::FunctionFlags;

conn.create_scalar_function(
    "btc_to_sats",
    1,
    FunctionFlags::SQLITE_UTF8 | FunctionFlags::SQLITE_DETERMINISTIC,
    |ctx| {
        let btc: f64 = ctx.get(0)?;
        Ok((btc * 100_000_000.0) as i64)
    },
)?;

let sats: i64 = conn.query_row(
    "SELECT btc_to_sats(0.001)",
    [],
    |row| row.get(0),
)?;
assert_eq!(sats, 100_000);
```

## Backup API

```toml
features = ["backup"]
```

```rust
use rusqlite::backup::Backup;
use std::time::Duration;

let src = Connection::open("wallet.db")?;
let mut dst = Connection::open("wallet_backup.db")?;
let backup = Backup::new(&src, &mut dst)?;
backup.run_to_completion(5, Duration::from_millis(250), None)?;
```

For SQLCipher: backup target needs its own `PRAGMA key` after attach.

## Testing

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("schema.sql")).unwrap();
        conn
    }

    #[test]
    fn test_insert_wallet() {
        let conn = test_db();
        conn.execute(
            "INSERT INTO wallet (id, name) VALUES (?, ?)",
            params!["1", "Main"],
        ).unwrap();

        let count: i64 = conn.query_row("SELECT count(*) FROM wallet", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 1);
    }
}
```

## Mobile / Cross-Compile

`bundled` feature requires C compiler for cross-compile target. cargo-ndk handles this:

```bash
# Android
cargo ndk -t arm64-v8a -o jniLibs build --release

# iOS
cargo build --release --target aarch64-apple-ios
```

For SQLCipher mobile: use `bundled-sqlcipher-vendored-openssl` to avoid system OpenSSL hassles.

## Performance Tips

| Tip | Why |
|---|---|
| `PRAGMA journal_mode=WAL` | Concurrent reads, faster writes |
| `PRAGMA synchronous=NORMAL` | Faster (still durable enough with WAL) |
| `PRAGMA cache_size=-65536` | 64MB cache (negative = KB) |
| Use prepared statements (`prepare_cached`) for repeated queries | Skip SQL parsing each call |
| Wrap bulk inserts in transaction | 100x speedup for many INSERTs |
| Use `WITHOUT ROWID` for tables with non-INTEGER PK | Smaller, faster |
| Index columns used in WHERE/ORDER BY | Avoid full table scan |
| Use `EXPLAIN QUERY PLAN` to verify index usage | Debug slow queries |
| Use `INTEGER` for sat amounts (not REAL/TEXT) | Exact arithmetic, no float drift |
| `PRAGMA optimize` periodically | Updates query planner stats |

## Anti-Patterns

| Anti-pattern | Why it's bad | Correct approach |
|---|---|---|
| Concatenating SQL strings | Injection risk | Use `params!` |
| `f64` for sat amounts | Float precision lost | Use `i64` (sats fit easily) |
| Single Connection across threads | Not Sync | Pool with r2d2_sqlite |
| Connection per query | Slow, no PRAGMA persistence | Reuse connection |
| Missing transaction for bulk insert | 100x slower | Wrap in `transaction()` |
| Forgetting `WAL` for mobile/multi-reader | SQLITE_BUSY errors | Always WAL for app DB |
| Storing large blobs in main row | Bloats every read | Use blob I/O streaming |
| `prepare()` in tight loop | Re-parses SQL each call | `prepare_cached()` |
| Custom enums as TEXT without `FromSql` | Stringly-typed | Implement `ToSql`/`FromSql` |
| Not handling `SQLITE_BUSY` in concurrent app | Random failures | Set `busy_timeout` or use immediate transactions |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `database is locked` | Multi-writer or long read | WAL + `busy_timeout`; reduce tx duration |
| Slow inserts | No transaction | Wrap in `transaction()` |
| `no such function: json_extract` | JSON1 not enabled | Built-in since SQLite 3.38; use `bundled` feature for new-enough version |
| Cross-compile fails (libsqlite3-sys) | C compiler missing for target | Use `cargo-ndk` or `cross` |
| iOS app size +500KB after add | bundled SQLite size | Acceptable; native SQLite alternative is smaller but version uncertain |
| `OptionalExtension` not found | Forgot `use rusqlite::OptionalExtension` | Import the trait |
| `params![]` macro not found | Forgot import | `use rusqlite::params` |
| Custom function called too often | Not marked `DETERMINISTIC` | Add `FunctionFlags::SQLITE_DETERMINISTIC` |
| `Result<_, rusqlite::Error>` everywhere | No `?` operator | Use `anyhow::Result` or convert |
| Connection drop hangs | Pool config | Tune `Pool::builder().connection_timeout(...)` |

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| Encrypted SQLite (SQLCipher) | `databases/sqlcipher` |
| Server PostgreSQL/MySQL | respective skills |
| ORM (Diesel, SeaORM) | ORM-specific |
| Async-native ORM | sqlx |
| KMP shared DB | `mobile/kotlin-multiplatform` (SQLDelight) |
| Pure SQL knowledge | `databases/sql-fundamentals` |
