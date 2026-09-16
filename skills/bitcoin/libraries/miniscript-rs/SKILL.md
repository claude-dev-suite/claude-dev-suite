---
name: bitcoin-libraries-miniscript-rs
description: |
  rust-miniscript: Rust crate for Miniscript and descriptor handling.
  Policy compilation, satisfaction analysis, descriptor parsing for
  legacy + Tapscript.
  USE WHEN: working with descriptors / miniscript in Rust, building
  wallets that compose spending conditions.
allowed-tools: Read, Grep, Glob
---

# rust-miniscript

Reference implementation of Miniscript + descriptor language in Rust.

Repo: `github.com/rust-bitcoin/rust-miniscript`.

## Install

```toml
[dependencies]
miniscript = "13"
```

As of September 2026 the current line is 13.1.0 (June 2026); 13.0.0
landed October 2025. The 12.x line still gets patches (12.3.7, May
2026) but is no longer the current major. MSRV is Rust 1.63.0. Policy
compilation lives behind the non-default `compiler` cargo feature.

## Quick examples

### Parse descriptor
```rust
use miniscript::Descriptor;
use bitcoin::secp256k1::Secp256k1;

let desc_str = "wpkh([d34db33f/84h/0h/0h]xpub.../<0;1>/*)";
let desc: Descriptor<_> = desc_str.parse()?;

let secp = Secp256k1::new();
for i in 0..10 {
    let script = desc.at_derivation_index(i)?.script_pubkey();
    println!("script[{}]: {}", i, script);
}
```

### Compile policy → miniscript → script
```rust
use miniscript::policy::Concrete;
use miniscript::Segwitv0;

let policy: Concrete<bitcoin::PublicKey> =
    "and(pk(02abc...),older(144))".parse()?;
let ms = policy.compile::<Segwitv0>()?;   // `compiler` feature
let script = ms.encode();
```

### Satisfy
```rust
use miniscript::Satisfier;

let satisfier = ...;
let witness = ms.satisfy(&satisfier)?;
```

## Descriptor types supported

- `pkh`, `wpkh`, `sh(wpkh)`, `wsh()`, `tr()`.
- `multi`, `sortedmulti`, `multi_a`.
- `addr`, `raw`, `combo`.
- Multipath descriptors (`<0;1>`).

## Use cases

- Wallet that supports complex spending conditions.
- Coordinator for multisig / vault / time-locked schemes.
- Static analysis of scripts (sigops, max sat size).

## Common pitfalls

- Miniscript version mismatch with rust-bitcoin: pin compatible
  versions. As of September 2026 the pairing is miniscript 13.x and
  12.x -> `bitcoin = "0.32"` (13.1.0 pins `^0.32.6`), 11.x -> `0.31`,
  10.x -> `0.30`. The 13.0.0 break was miniscript's own API, not a
  rust-bitcoin bump.
- Tapscript miniscript different fragment set vs legacy.
- Descriptor checksum: re-add after modifications.

## See also

- [rust-bitcoin/SKILL.md](../rust-bitcoin/SKILL.md)
- [bdk/SKILL.md](../bdk/SKILL.md)
- [../../protocol/miniscript/SKILL.md](../../protocol/miniscript/SKILL.md)
- [../../protocol/descriptors/SKILL.md](../../protocol/descriptors/SKILL.md)
