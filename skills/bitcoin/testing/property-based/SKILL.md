---
name: bitcoin-testing-property-based
description: |
  Property-based testing: proptest / quickcheck (Rust), hypothesis
  (Python). Strategies for tx serialization, descriptor round-trip,
  miniscript satisfaction.
  USE WHEN: testing Bitcoin parsers, ensuring round-trip invariants,
  catching edge cases beyond example tests.
allowed-tools: Read, Grep, Glob
---

# Property-Based Testing

Test that **properties** (universal invariants) hold for all inputs,
not just specific examples.

## Properties for Bitcoin

Common properties:
- **Round-trip**: `decode(encode(x)) == x` for tx, script, address,
  descriptor, PSBT.
- **Sigops cost** of any script ≤ static analysis bound.
- **Miniscript satisfaction** of any policy produces a valid script.
- **Descriptor checksum** is preserved through canonical encoding.
- **Hash determinism**: `H(x) == H(x)` always; consistent across
  serialization.

## Rust (proptest)

```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn tx_roundtrip(tx in any_tx()) {
        let encoded = tx.consensus_encode_to_vec();
        let decoded = Transaction::consensus_decode(&mut &encoded[..]).unwrap();
        prop_assert_eq!(tx, decoded);
    }
}
```

## Rust (quickcheck)

```rust
#[quickcheck]
fn descriptor_checksum_invariant(desc: ValidDescriptor) -> bool {
    let s = desc.to_string();
    let with_checksum = with_checksum(&s);
    parse(&with_checksum).is_ok()
}
```

## Python (hypothesis)

```python
from hypothesis import given, strategies as st

@given(st.binary(min_size=1, max_size=520))
def test_script_roundtrip(data):
    s = Script(data)
    assert Script(bytes(s)) == s
```

## Coverage strategies

- **Custom strategies** for valid Bitcoin objects (txs with valid
  inputs/outputs, valid scripts, valid descriptors).
- **Shrinking** — when a counterexample is found, hypothesis/proptest
  reduce it to minimum failing case.

## Compared to example-based

| Aspect | Example tests | Property-based |
|--------|---------------|----------------|
| Coverage | known cases | random + edge |
| Setup effort | low | medium (writing strategies) |
| Bug discovery | misses unknowns | finds unknowns |
| Failure repro | trivial | needs shrinking |

## Use cases

- **Parser tests** for tx, script, descriptor, PSBT.
- **Crypto roundtrip** for Schnorr / ECDSA / sighash.
- **Mempool policy invariants**: any tx accepted must satisfy X.

## Common issues

- Custom strategies hard to get right (don't accidentally exclude
  important cases).
- Slow if too many runs; tune with `proptest_config!()`.
- Shrinking can give surprising results — verify the shrunk case
  actually triggers the bug.

## Above properties: formal verification

A property test samples the input space; a machine-checked proof
quantifies over all of it. For consensus code — where the failing input
is exactly the one no test suite imagined — the tier above proptest is a
proof assistant.

- **btc-verified** (Keagan McClelland, Apache-2.0) models Bitcoin
  protocol components in Lean 4 and re-checks the theorems on every
  build. As of September 2026 it covers serialization (decode inverts
  encode, and each value has exactly one accepted encoding, CompactSize
  included), a computable FIPS 180-4 SHA-256, merkle commitments, txids,
  block and witness commitments, Script as the raw bytes consensus
  validates, and the chainstate accounting identity. Announced on
  Delving Bitcoin 2026-07-03; covered by Optech 2026-07-17.
- **Its merkle result** is a machine-checked form of the CVE-2012-2459
  defense: Core's `ComputeMerkleRoot` (`src/consensus/merkle.cpp`),
  mutation scan included, is transcribed into Lean and proved to imply
  the spec's canonicality, so two nonempty equal-width leaf lists Core
  accepts with equal roots are equal — or a concrete double-SHA-256
  collision exists.
- **Declarative executable specs** sit between proptest and Lean. Toby
  Sharp reported a declarative specification of non-script block
  validation for Hornet Node — 34 semantic invariants composed with a
  simple algebra (Optech #402, 2026-04-24). Executable and
  differentially testable, not proved.
- **Verified crypto implementations** ship as well: `libshrincs` is a
  proof-of-concept (as of September 2026) tying a C implementation of
  SHRINCS' WOTS+C leaf signature to a game-based one-time-unforgeability
  bound via Rocq/VST plus SSProve, under six named SHA-256 hardness
  assumptions.

What a proof does **not** buy: it is about a model and its stated
assumptions. btc-verified's author is explicit that the repository
"is structurally incapable of giving guarantees about Bitcoin Core's
behavior" — a wrong model, an unproved axiom, or a compiler doing
something else all still bite. Property tests remain the cheap check
that the model matches the code you ship.

## See also

- [fuzz/SKILL.md](../fuzz/SKILL.md)
- [../libraries/rust-bitcoin/SKILL.md](../../libraries/rust-bitcoin/SKILL.md)
- [../libraries/bdk/SKILL.md](../../libraries/bdk/SKILL.md)
