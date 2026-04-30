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

## See also

- [fuzz/SKILL.md](../fuzz/SKILL.md)
- [../libraries/rust-bitcoin/SKILL.md](../../libraries/rust-bitcoin/SKILL.md)
- [../libraries/bdk/SKILL.md](../../libraries/bdk/SKILL.md)
