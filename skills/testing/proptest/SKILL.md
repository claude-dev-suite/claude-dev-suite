---
name: proptest
description: |
  proptest — property-based testing for Rust (Hypothesis-style). Generates
  thousands of random inputs to find counterexamples to invariants, with
  shrinking to minimal failing case. Critical for crypto, parsers, state
  machines, and finance code where edge cases matter. Includes strategies
  (gen functions), regression tracking, and integration with cargo test.
  Alternative: quickcheck (simpler API, less powerful).

  USE WHEN: user mentions "proptest", "property-based test", "proptest!",
  "Strategy", "Arbitrary", "shrink", "quickcheck", "regression file",
  "fuzz-light", "proptest-derive"

  DO NOT USE FOR: Generic Rust unit tests - use `testing/rust-testing`
  DO NOT USE FOR: Fuzzing with mutator (cargo-fuzz, AFL) - use bitcoin/testing/fuzz
  DO NOT USE FOR: KMP property testing - use `testing/kotest` (has built-in property)
allowed-tools: Read, Grep, Glob, Write, Edit
---
# proptest — Property-Based Testing in Rust

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `proptest`.

## Why Property-Based Testing

Unit tests check specific examples; property tests check **invariants** (must hold for ALL inputs):

```rust
// Unit test: one example
#[test]
fn add_examples() {
    assert_eq!(add(2, 3), 5);
}

// Property test: invariant for any pair
proptest! {
    #[test]
    fn add_commutative(a: i32, b: i32) {
        prop_assert_eq!(add(a, b), add(b, a));
    }
}
```

proptest generates ~256 random `(a, b)` pairs by default. If any fails, **shrinks** to minimal example. Catches edge cases (0, MAX, MIN, negative, etc.) you'd never write manually.

Critical for:
- **Crypto code** — encrypt/decrypt round-trip, signature verify
- **Parsers/serializers** — `parse(serialize(x)) == x` for any `x`
- **Finance** — total preserved across operations
- **State machines** — invariants hold across transitions
- **Wallet code** — coin selection, fee calculation, descriptor parsing

## Setup

```toml
[dev-dependencies]
proptest = "1.5"
proptest-derive = "0.5"        # for #[derive(Arbitrary)]
```

## Basic Property Test

```rust
use proptest::prelude::*;

fn reverse(s: &str) -> String {
    s.chars().rev().collect()
}

proptest! {
    #[test]
    fn reverse_twice_is_identity(s in ".*") {     // any string
        prop_assert_eq!(reverse(&reverse(&s)), s);
    }

    #[test]
    fn reverse_preserves_length(s in ".*") {
        prop_assert_eq!(reverse(&s).len(), s.len());
    }
}
```

`s in ".*"` is a regex strategy — generates strings matching the regex. Powerful for parsers.

## Strategies — Generating Inputs

### Primitives

```rust
proptest! {
    #[test]
    fn test_int(x in 0i32..=100) {                // bounded int
        prop_assert!(x >= 0 && x <= 100);
    }

    #[test]
    fn test_int_any(x in any::<i32>()) {          // any i32
        // ...
    }

    #[test]
    fn test_uint(x: u64) {                        // syntactic sugar for any::<u64>()
        // ...
    }

    #[test]
    fn test_float(f in -1000.0f64..1000.0) {
        // ...
    }
}
```

### Strings via Regex

```rust
proptest! {
    #[test]
    fn test_email(email in r"[a-z]{1,10}@[a-z]{1,10}\.(com|org|net)") {
        // valid-looking email strings
    }

    #[test]
    fn test_btc_addr(addr in r"bc1[a-z0-9]{38,42}") {
        // bech32-style strings
    }
}
```

### Collections

```rust
use proptest::collection::vec;

proptest! {
    #[test]
    fn test_vec(v in vec(0u32..1000, 0..100)) {   // Vec<u32>, len 0-100
        prop_assert!(v.iter().all(|&x| x < 1000));
    }

    #[test]
    fn test_btreemap(m in proptest::collection::btree_map(0u32..100, ".*", 1..10)) {
        // BTreeMap<u32, String> with 1-10 entries
    }
}
```

### Tuples and Combinations

```rust
proptest! {
    #[test]
    fn test_pair((a, b) in (0i32..100, 0i32..100)) {
        prop_assert!(a >= 0 && b >= 0);
    }

    #[test]
    fn test_either(x in prop_oneof![Just(0), Just(1), 2..=10]) {
        // 1/3 chance each: 0, 1, or random in 2..=10
        prop_assert!(x >= 0);
    }
}
```

### Custom Strategies

```rust
fn arb_wallet() -> impl Strategy<Value = Wallet> {
    (
        "[a-z]{1,20}",                            // name
        0u64..21_000_000_00000000,                // balance in sats
        prop::collection::vec(arb_address(), 1..10),
    ).prop_map(|(name, balance, addresses)| {
        Wallet { name, balance, addresses }
    })
}

fn arb_address() -> impl Strategy<Value = Address> {
    r"bc1[a-z0-9]{38,42}".prop_map(Address)
}

proptest! {
    #[test]
    fn wallet_balance_matches_addresses(w in arb_wallet()) {
        let computed: u64 = w.addresses.iter().map(|a| a.balance()).sum();
        prop_assert_eq!(computed, w.balance);
    }
}
```

### `#[derive(Arbitrary)]`

```rust
use proptest_derive::Arbitrary;

#[derive(Debug, Arbitrary)]
struct Tx {
    #[proptest(strategy = "0u64..21_000_000_00000000")]
    amount_sats: u64,

    #[proptest(regex = "bc1[a-z0-9]{38,42}")]
    address: String,

    #[proptest(strategy = "1u64..1000")]
    fee_rate: u64,
}

proptest! {
    #[test]
    fn tx_total_at_most_supply(tx: Tx) {
        prop_assert!(tx.amount_sats + tx.fee_rate * 250 <= 21_000_000_00000000);
    }
}
```

## Common Property Patterns

### Round-trip

```rust
proptest! {
    #[test]
    fn serialize_deserialize_roundtrip(w in arb_wallet()) {
        let json = serde_json::to_string(&w).unwrap();
        let parsed: Wallet = serde_json::from_str(&json).unwrap();
        prop_assert_eq!(parsed, w);
    }

    #[test]
    fn encrypt_decrypt_roundtrip(plaintext: Vec<u8>, key in arb_key()) {
        let ciphertext = encrypt(&plaintext, &key);
        let decrypted = decrypt(&ciphertext, &key).unwrap();
        prop_assert_eq!(decrypted, plaintext);
    }
}
```

### Invariants

```rust
proptest! {
    #[test]
    fn coin_selection_total_at_least_target(
        utxos in vec(0u64..1_000_000, 1..50),
        target in 1u64..500_000,
    ) {
        prop_assume!(utxos.iter().sum::<u64>() >= target);   // skip impossible cases

        let selected = select_coins(&utxos, target);
        let total: u64 = selected.iter().sum();
        prop_assert!(total >= target);
    }
}
```

`prop_assume!` skips invalid inputs without failing the test.

### Equivalence

```rust
proptest! {
    #[test]
    fn fast_sort_equals_std_sort(mut v: Vec<i32>) {
        let mut std_sorted = v.clone();
        std_sorted.sort();

        my_fast_sort(&mut v);
        prop_assert_eq!(v, std_sorted);
    }
}
```

### Idempotence

```rust
proptest! {
    #[test]
    fn normalize_is_idempotent(s in ".*") {
        let once = normalize(&s);
        let twice = normalize(&once);
        prop_assert_eq!(once, twice);
    }
}
```

## Shrinking

When a property fails, proptest tries to find the **minimal failing input**. Output:

```
proptest: TestCaseError: Property failed at "src/wallet.rs:42:9"
proptest: ... Original failure: input: "abcdef", balance: 1000000
proptest: ... Shrunk to: input: "", balance: 0
```

Shrunk values are easier to debug. proptest auto-shrinks integers toward 0, strings toward empty, collections toward shorter, etc.

## Regression Files

When proptest finds a failure, it saves the input to `proptest-regressions/<test_name>.txt`. On next run, it **always tests these inputs first** — ensures the fix holds.

```
proptest-regressions/wallet.txt:
# Seeds for failure cases proptest has generated in the past.
xx 6e7b3a92 1000 "" 0
```

Commit this file to git — provides regression suite for known bugs.

## Configuration

```rust
proptest! {
    #![proptest_config(ProptestConfig {
        cases: 1000,                              // default 256
        max_shrink_iters: 10000,
        timeout: 5000,                            // ms per test case
        .. ProptestConfig::default()
    })]

    #[test]
    fn slow_property(x: u64) { /* ... */ }
}
```

For CI: increase `cases` for thorough coverage, decrease for speed.

## Stateful Property Tests

For state machines (e.g., wallet operations):

```rust
use proptest_state_machine::*;

#[derive(Debug, Clone)]
enum Op {
    Deposit(u64),
    Withdraw(u64),
    GetBalance,
}

struct WalletStateMachine;

impl StateMachineTest for WalletStateMachine {
    type SystemUnderTest = Wallet;
    type Reference = u64;                         // model: just a balance

    fn init_test(_ref_state: &Self::Reference) -> Self::SystemUnderTest {
        Wallet::new()
    }

    fn apply(state: Self::SystemUnderTest, _: &Self::Reference, transition: Self::Transition)
        -> Self::SystemUnderTest
    {
        match transition {
            Op::Deposit(amount) => state.deposit(amount),
            Op::Withdraw(amount) => state.withdraw(amount),
            Op::GetBalance => state,
        }
    }

    fn check_invariants(state: &Self::SystemUnderTest, ref_state: &Self::Reference) {
        assert_eq!(state.balance(), *ref_state);
    }
}
```

## Common Domains for Wallet Apps

```rust
fn arb_sats() -> impl Strategy<Value = u64> {
    0u64..21_000_000_00000000
}

fn arb_btc_decimal() -> impl Strategy<Value = Decimal> {
    (0u64..21_000_000_00000000)
        .prop_map(|sats| Decimal::from(sats) / dec!(100_000_000))
}

fn arb_xpub() -> impl Strategy<Value = String> {
    r"xpub6[A-Za-z0-9]{107}".prop_map(String::from)
}

fn arb_psbt() -> impl Strategy<Value = Vec<u8>> {
    proptest::collection::vec(any::<u8>(), 100..2000)
}

fn arb_descriptor() -> impl Strategy<Value = String> {
    prop_oneof![
        // wpkh
        r"wpkh\(xpub[A-Za-z0-9]+/0/\*\)".prop_map(String::from),
        // tr
        r"tr\(xpub[A-Za-z0-9]+\)".prop_map(String::from),
        // sh-multi
        r"sh\(multi\(2,xpub[A-Za-z0-9]+,xpub[A-Za-z0-9]+\)\)".prop_map(String::from),
    ]
}
```

## Differential Testing (Compare 2 Implementations)

```rust
proptest! {
    #[test]
    fn bdk_matches_legacy_descriptor_parse(d in arb_descriptor()) {
        let bdk_result = bdk::Descriptor::from_str(&d);
        let legacy_result = legacy_lib::parse_descriptor(&d);

        match (bdk_result, legacy_result) {
            (Ok(_), Ok(_)) => {},
            (Err(_), Err(_)) => {},
            (Ok(_), Err(e)) => prop_assert!(false, "BDK accepts but legacy rejects: {}", e),
            (Err(e), Ok(_)) => prop_assert!(false, "BDK rejects but legacy accepts: {}", e),
        }
    }
}
```

Excellent for migrations: ensure new impl matches old behavior.

## proptest vs quickcheck

| Aspect | proptest | quickcheck |
|---|---|---|
| API ergonomics | Macros, `prop_oneof!` etc. | Trait-based |
| Shrinking quality | Excellent (semantic) | Basic (range) |
| Regression files | ✅ Auto-saved | ❌ Manual |
| Custom strategies | ✅ Powerful | ✅ Via Arbitrary trait |
| String generation | ✅ Regex | ✅ Lengths only |
| Adoption | Most modern Rust crates | Older codebases |
| Performance | Slightly slower (more generation logic) | Faster |

**For new code: proptest.** For maintaining existing quickcheck suites: keep them.

## Use in Bitcoin/Wallet Crates

| Crate | Uses proptest |
|---|---|
| **rust-bitcoin** | ✅ Extensive — script eval, transaction parsing |
| **bdk** | ✅ Coin selection, descriptor parsing |
| **secp256k1** | ✅ Internal |
| **rust-miniscript** | ✅ Policy compilation roundtrip |
| **rust-payjoin** | ✅ Protocol invariants |

For BHODL / wallet apps: **must-have** for any custom protocol parsing, fee math, key derivation logic.

## Integration with cargo-fuzz

For deeper bug discovery, complement proptest with fuzzing:

```rust
// fuzz/fuzz_targets/parse_descriptor.rs
#![no_main]
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if let Ok(s) = std::str::from_utf8(data) {
        let _ = bdk::Descriptor::from_str(s);    // panic-free required
    }
});
```

Run:
```bash
cargo +nightly fuzz run parse_descriptor -- -max_total_time=60
```

proptest finds bugs in seconds; fuzzing finds deeper bugs in hours/days. Use both.

## Anti-Patterns

| Anti-pattern | Why it's bad | Correct approach |
|---|---|---|
| Trivial properties (`prop_assert!(true)`) | Doesn't test anything | Make assertion meaningful |
| Property with side effects modifying global state | Tests interfere | Pure properties, no globals |
| `prop_assume!` filtering >50% of inputs | Slow — strategy too broad | Refine strategy to generate valid inputs |
| Using `unwrap()` in property (treated as panic) | Test fails on legitimate `None` | Use `prop_assert!(...)` for explicit failure |
| Strategy with unbounded growth (`vec(any::<u8>(), 0..100000)`) | Slow shrinking | Cap at reasonable size |
| Forgetting regression file in git | Lose discovered bugs across runs | Commit `proptest-regressions/` |
| Property tests as only test layer | Can miss specific edge cases by chance | Combine with handwritten unit tests |
| Network calls in property test | Slow + flaky | Mock or use in-memory deps |
| `no_shrink` strategies | Hard to debug failures | Allow shrinking unless absolutely necessary |
| Massive `cases = 100000` everywhere | CI takes forever | Tune per-test based on speed and importance |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `prop_assume too many discards` | Strategy generates mostly invalid inputs | Constrain strategy more tightly |
| Test passes locally, fails in CI | Different RNG seed | Commit regression file or set seed via `PROPTEST_SEED` env |
| Slow test runs | Many cases or slow property | Lower `cases` in dev, full in nightly CI |
| Shrinking takes forever | `max_shrink_iters` too low | Increase or accept partial shrink |
| Stack overflow in shrinking | Recursive strategy without depth limit | Use `prop::collection::vec(strategy, 0..MAX)` with bound |
| Floats compared with `==` | Float precision | Use `(a - b).abs() < eps` |
| Custom strategy compile error | Trait bounds | Look for `Strategy<Value = T>` |

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| Generic Rust unit tests | `testing/rust-testing` |
| Fuzzing with mutator | bitcoin/testing/fuzz, cargo-fuzz docs |
| Kotlin/JVM property testing | `testing/kotest` (built-in) |
| Python (Hypothesis) | Hypothesis-specific |
| Snapshot testing | `testing/compose-snapshot` (UI) |
