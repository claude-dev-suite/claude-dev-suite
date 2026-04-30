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
miniscript = "12"
```

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
use miniscript::policy::{Concrete, Liftable};

let policy: Concrete<bitcoin::PublicKey> =
    "and(pk(02abc...),older(144))".parse()?;
let ms = policy.compile_to_miniscript_segwit_v0()?;
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
  versions.
- Tapscript miniscript different fragment set vs legacy.
- Descriptor checksum: re-add after modifications.

## See also

- [rust-bitcoin/SKILL.md](../rust-bitcoin/SKILL.md)
- [bdk/SKILL.md](../bdk/SKILL.md)
- [../../protocol/miniscript/SKILL.md](../../protocol/miniscript/SKILL.md)
- [../../protocol/descriptors/SKILL.md](../../protocol/descriptors/SKILL.md)
