---
name: rust-decimal
description: |
  rust_decimal — fixed-point decimal arithmetic for Rust. 128-bit signed
  decimal, exact (no float rounding errors), suitable for finance, currency,
  Bitcoin sat ↔ fiat conversions, accounting. Up to 28 significant digits,
  arithmetic preserves precision. Includes RoundingStrategy for explicit
  truncation/rounding control. Integrates with serde, sqlx, postgres.

  USE WHEN: user mentions "rust_decimal", "Decimal", "dec!", "RoundingStrategy",
  "no float", "exact arithmetic", "fixed-point Rust", "currency math Rust",
  "sat to fiat conversion"

  DO NOT USE FOR: Crypto primitives - use `security/libsodium` or `bitcoin/cryptography/*`
  DO NOT USE FOR: BigInteger / arbitrary-precision math - use `num-bigint`
  DO NOT USE FOR: Time/duration math - use `chrono` or `time` crate
allowed-tools: Read, Grep, Glob, Write, Edit
---
# rust_decimal — Exact Decimal Arithmetic

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `rust-decimal`.

## Why Not f64 for Money

```rust
let total: f64 = 0.1 + 0.2;
println!("{}", total);                            // 0.30000000000000004 — WRONG

let cents: f64 = 100.50_f64;
let cents_int = (cents * 100.0) as i64;
println!("{}", cents_int);                        // 10049 — WRONG (should be 10050)
```

Floating-point cannot represent most decimal fractions exactly. For money, this is **unacceptable**: rounding bugs become real losses, audit failures, regulatory issues.

For Bitcoin specifically: **always use `i64` for sats** (1 BTC = 100,000,000 sats fits easily). For fiat conversions, multi-currency display, fee calculations involving rates → use `Decimal`.

## Setup

```toml
[dependencies]
rust_decimal = "1.36"
rust_decimal_macros = "1.36"

# Optional features
rust_decimal = { version = "1.36", features = ["serde-with-str", "db-postgres", "macros"] }
```

Useful features:
- `serde-with-str` — serialize as string (preserves precision in JSON)
- `serde-with-float` — serialize as float (loses precision, but compatible)
- `serde-with-arbitrary-precision` — preserve via serde_json's arbitrary precision
- `db-postgres`, `db-tokio-postgres`, `db-diesel` — DB integration
- `macros` — `dec!` literal macro
- `maths` — extra math functions (exp, ln, sin, etc.)
- `tokio-pg` — async postgres
- `borsh` — binary serialization for blockchain projects

## Basic Usage

```rust
use rust_decimal::Decimal;
use rust_decimal_macros::dec;

let a = dec!(0.1);
let b = dec!(0.2);
let c = a + b;
assert_eq!(c, dec!(0.3));                         // EXACT

let price = dec!(19.99);
let quantity = dec!(3);
let total = price * quantity;
assert_eq!(total, dec!(59.97));

// Division
let avg = total / quantity;
assert_eq!(avg, dec!(19.99));
```

`dec!` macro creates Decimal at compile time, validates literal.

## From Strings

```rust
use std::str::FromStr;

let amount = Decimal::from_str("0.00012345")?;
let amount: Decimal = "12345.6789".parse()?;
```

For untrusted input always parse — never `as` from float.

## From Integers

```rust
let sats = Decimal::from(100_000_000_i64);
let btc = sats / dec!(100_000_000);
assert_eq!(btc, dec!(1));
```

## To Various Types

```rust
let d = dec!(123.456);

let s: String = d.to_string();                     // "123.456"
let f: f64 = d.try_into()?;                        // 123.456 (lossy)
let i: i64 = d.try_into()?;                        // ERROR — has fractional part
let i: i64 = (d * dec!(1_000)).round().try_into()?; // 123456 (scaled)
```

## Bitcoin sats ↔ fiat Conversion

```rust
use rust_decimal::Decimal;
use rust_decimal_macros::dec;

const SATS_PER_BTC: i64 = 100_000_000;

fn sats_to_fiat(sats: i64, btc_to_fiat_rate: Decimal) -> Decimal {
    let btc = Decimal::from(sats) / Decimal::from(SATS_PER_BTC);
    btc * btc_to_fiat_rate
}

fn fiat_to_sats(fiat: Decimal, btc_to_fiat_rate: Decimal) -> i64 {
    let btc = fiat / btc_to_fiat_rate;
    let sats = btc * Decimal::from(SATS_PER_BTC);
    sats.round().to_i64().unwrap_or(0)
}

// Example: at $60,000/BTC
let rate = dec!(60000);
let sats = 100_000;                                // 0.001 BTC
let usd = sats_to_fiat(sats, rate);
assert_eq!(usd, dec!(60.00));

let euro_amount = dec!(100);
let euro_rate = dec!(55000);                       // €55,000/BTC
let needed_sats = fiat_to_sats(euro_amount, euro_rate);
assert_eq!(needed_sats, 181_818);                  // sats
```

## Rounding

```rust
use rust_decimal::RoundingStrategy;

let d = dec!(2.5);

let rounded = d.round();                                          // banker's rounding by default → 2
let rounded_half_up = d.round_dp_with_strategy(0, RoundingStrategy::MidpointAwayFromZero);  // 3
let truncated = d.round_dp_with_strategy(0, RoundingStrategy::ToZero);  // 2

// Specific decimal places
let price = dec!(19.9999);
let display_2dp = price.round_dp(2);                              // 20.00
let display_4dp = price.round_dp(4);                              // 19.9999
```

`RoundingStrategy` variants:
- `MidpointAwayFromZero` — "round half up" (most intuitive)
- `MidpointTowardZero` — "round half down"
- `MidpointNearestEven` — banker's rounding (default for `round()`)
- `ToZero` — truncate
- `AwayFromZero` — always round away from zero
- `ToNegativeInfinity` — floor
- `ToPositiveInfinity` — ceiling

For fiat display: typically `MidpointAwayFromZero` to 2 decimal places.

For Bitcoin fee calculations: use `ToPositiveInfinity` (always pay enough fee).

## Comparison

```rust
let a = dec!(1.0);
let b = dec!(1.00);

assert_eq!(a, b);                                  // ✅ equal in value
assert_eq!(a.scale(), 1);                          // a has scale 1
assert_eq!(b.scale(), 2);                          // b has scale 2

// Hash works correctly even with different scales
use std::collections::HashSet;
let mut set = HashSet::new();
set.insert(a);
assert!(set.contains(&b));
```

## Serde

```rust
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize)]
struct Transaction {
    amount: Decimal,
    fee: Decimal,
    rate_at_send: Decimal,
}

let tx = Transaction {
    amount: dec!(0.001),
    fee: dec!(0.00001),
    rate_at_send: dec!(60000),
};

let json = serde_json::to_string(&tx)?;
println!("{}", json);
// Default: {"amount":0.001,"fee":0.00001,"rate_at_send":60000}
// With "serde-with-str" feature: amounts as strings
```

For wallet apps storing tx history in JSON, use `serde-with-str` to preserve exact values:

```toml
rust_decimal = { version = "1.36", features = ["serde-with-str"] }
```

## SQLite / SQLCipher Storage

`rust_decimal` doesn't have native rusqlite support, but easy pattern:

```rust
use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSql, ToSqlOutput, ValueRef};
use rust_decimal::Decimal;
use std::str::FromStr;

// Storage as TEXT (preserves precision)
struct DecimalSql(Decimal);

impl ToSql for DecimalSql {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        Ok(ToSqlOutput::from(self.0.to_string()))
    }
}

impl FromSql for DecimalSql {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        let s = value.as_str()?;
        Decimal::from_str(s)
            .map(DecimalSql)
            .map_err(|_| FromSqlError::InvalidType)
    }
}
```

For SQLite **always store as TEXT** — `REAL` (float) loses precision.

For Postgres: use `db-postgres` feature → maps to NUMERIC type natively.

## Custom Display Formatting

```rust
use rust_decimal::Decimal;

let amount = dec!(1234567.89);

println!("{}", amount);                            // 1234567.89
println!("{:.2}", amount);                          // 1234567.89

// Locale-aware (manual)
fn format_eu(d: Decimal) -> String {
    let s = d.to_string();
    let parts: Vec<&str> = s.split('.').collect();
    let integer = parts[0];
    let decimal = parts.get(1).copied().unwrap_or("");

    // Add thousand separators
    let chars: Vec<char> = integer.chars().rev().collect();
    let with_seps: String = chars
        .chunks(3)
        .map(|chunk| chunk.iter().collect::<String>())
        .collect::<Vec<_>>()
        .join(".")
        .chars().rev().collect();

    if decimal.is_empty() {
        with_seps
    } else {
        format!("{},{}", with_seps, decimal)        // EU: 1.234.567,89
    }
}
```

For real i18n use `unic-langid` + `icu` crate.

## Math Operations

```rust
let a = dec!(10);
let b = dec!(3);

let q = a / b;
println!("{}", q);                                 // 3.3333333333333333333333333333

// Limit precision
let q_truncated = q.round_dp(2);                  // 3.33

// Power
let n = dec!(2).powi(10);                          // 1024

// Absolute, sign
assert_eq!(dec!(-5).abs(), dec!(5));
assert!(dec!(-1).is_sign_negative());

// MIN/MAX
let max = Decimal::MAX;                            // 79228162514264337593543950335
let min = Decimal::MIN;                            // -79228162514264337593543950335

// Constants
assert_eq!(Decimal::ZERO, dec!(0));
assert_eq!(Decimal::ONE, dec!(1));
assert_eq!(Decimal::TWO, dec!(2));
assert_eq!(Decimal::TEN, dec!(10));
assert_eq!(Decimal::ONE_HUNDRED, dec!(100));
assert_eq!(Decimal::ONE_THOUSAND, dec!(1000));
```

With `maths` feature:

```rust
use rust_decimal::MathematicalOps;

let e = Decimal::E;
let pi = Decimal::PI;
let exp = dec!(1).exp();                           // 2.71828...
let ln = dec!(2.71828).ln();                       // 1
```

## Wallet Pattern (BHODL Cost-Basis Tracking)

```rust
use rust_decimal::Decimal;
use rust_decimal_macros::dec;

struct Lot {
    sats_acquired: i64,
    cost_basis_per_sat: Decimal,                   // fiat / sat at acquisition
    timestamp: i64,
}

struct CapitalGain {
    proceeds: Decimal,
    cost_basis: Decimal,
    gain: Decimal,
    long_term: bool,
}

fn calculate_gain(
    lot: &Lot,
    sats_sold: i64,
    sale_price_per_sat: Decimal,
    sale_timestamp: i64,
) -> CapitalGain {
    let proceeds = Decimal::from(sats_sold) * sale_price_per_sat;
    let cost_basis = Decimal::from(sats_sold) * lot.cost_basis_per_sat;
    let gain = proceeds - cost_basis;

    let one_year_secs = 365 * 24 * 60 * 60;
    let long_term = sale_timestamp - lot.timestamp >= one_year_secs;

    CapitalGain { proceeds, cost_basis, gain, long_term }
}
```

Critical: never compute capital gains in float. Real money, real tax exposure.

## Anti-Patterns

| Anti-pattern | Why it's bad | Correct approach |
|---|---|---|
| `f64` for money | Precision loss compounds | Always `Decimal` (or integer cents/sats) |
| `as i64` from `Decimal` (no rounding) | Truncates silently | Explicit `.round().to_i64()` |
| Mixing `Decimal` and `f64` | Silent conversions lose precision | Stay in Decimal end-to-end |
| Storing as REAL in SQLite | Loses precision | Store as TEXT, parse on read |
| Comparing with `==` after float roundtrip | False positives | Stay in Decimal; or compare with epsilon (rare) |
| Hardcoded "$" in app strings | i18n bug | Use locale-aware formatter |
| `Decimal` for sat amounts | Overkill, slower | Use `i64` (sats fit easily in 64-bit) |
| Re-creating `Decimal::from_str("60000")` in hot loop | Slow | Use `dec!(60000)` literal |
| Forgetting `.round_dp(2)` for display | Long fractional digits leak | Format for display vs storage |
| Using `unwrap()` on `try_into::<i64>()` | Panic on out-of-range | Handle the error |

## Performance

- 128-bit operations are fast (1-3ns on modern CPU)
- Slower than `i64` arithmetic (~5-10x) — for large bulk math, consider integer
- Allocation-free (Decimal is `Copy`)
- For BHODL-scale apps (single user, hundreds of txs/day), zero perf concern

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `dec!(1.234567890123456789012345)` compile error | Exceeds 28-digit precision | Reduce precision or use `Decimal::from_str_exact` |
| `try_into::<i64>()` fails | Decimal too large or has fraction | Check magnitude; round first |
| Serde serializes as float | Default behavior | Enable `serde-with-str` feature |
| SQLite query returns wrong value | Stored as REAL | Store as TEXT, custom ToSql/FromSql |
| `.round()` gives unexpected result | Banker's rounding (default) | Use `round_dp_with_strategy` for explicit |
| Postgres NUMERIC mismatch | Driver feature missing | Enable `db-postgres` |
| `dec!(0.1) + dec!(0.2) != 0.3_f64` | Comparing Decimal to f64 | Stay in Decimal (`dec!(0.3)`) |
| Slow JSON parsing | `serde-with-arbitrary-precision` overhead | `serde-with-str` is faster |

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| Crypto primitives (signatures, hashes) | `security/libsodium` / `bitcoin/cryptography/*` |
| Arbitrary-precision integers | `num-bigint` |
| Time/duration math | `chrono` / `time` |
| Sat amounts only (no fractional) | `i64` directly |
| Server-side accounting (full ERP) | SQL NUMERIC / dedicated decimal lib |
| Heavy floating-point science | `f64` is correct |
