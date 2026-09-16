---
name: bitcoin-libraries-rust-bitcoin
description: |
  rust-bitcoin: Rust crate for Bitcoin primitives. Tx, Block, Script,
  Address, Network, key types, PSBT, BIP32. Foundation for BDK, LDK,
  miniscript-rs.
  USE WHEN: building Bitcoin apps in Rust, parsing/constructing txs,
  working with addresses + scripts.
allowed-tools: Read, Grep, Glob
---

# rust-bitcoin

The foundation Rust crate for Bitcoin. Used by BDK, LDK, miniscript-rs,
electrs, etc. Stable, comprehensive.

Repo: `github.com/rust-bitcoin/rust-bitcoin`.

## Install

```toml
[dependencies]
bitcoin = "0.32"   # resolves to 0.32.102 (July 2026)
```

Two 0.32 lines ship in parallel as of September 2026: `0.32.11`
(2026-07-22, MSRV 1.56.1) for old toolchains, and the `0.32.10x` line
(latest `0.32.102`, 2026-07-15), which since `0.32.101` (2026-06-24)
has MSRV 1.60.0 and exposes the optional `encoding` feature wrapping
the sans-IO `consensus_encoding` crate — enabling that feature raises
the MSRV to 1.74.0. `0.32.100` was yanked because its blanket 1.74.0
MSRV bump was too aggressive.

## 0.33-beta and the 1.0 track

`0.33.0-beta` (2026-02-23) is the testing release for the next major
API; upstream states it will *never* release a plain `0.33.0` — the
next tag is `0.34.0-beta`, and the `-beta` suffix drops once
`bitcoin-units`, `bitcoin-primitives` and `bitcoin-consensus-encoding`
reach `1.0.0`. Of those three, only `bitcoin-consensus-encoding` has
shipped 1.x (1.2.0, 2026-08-13); as of September 2026
`bitcoin-primitives` is at 0.103.0 and `bitcoin-units` at 0.5.0
stable, with `1.0.0-rc` builds published.

Breaking changes already in `0.33.0-beta`:

- `Amount` enforces a `MAX_MONEY` invariant. `Amount::MAX` is now
  21 million BTC instead of `u64::MAX`, and `Amount::from_sat` returns
  `Result<Amount, OutOfRangeError>`.
- `Psbt` serde representation changed (breaking).
- MSRV bumped 1.63.0 -> 1.74.0 across every crate in the repo.

## Key types

- `Transaction`, `TxIn`, `TxOut`, `OutPoint`.
- `Script`, `ScriptBuf`, `Address`, `Network`.
- `Block`, `BlockHash`, `block::Header` (there is no `BlockHeader` at
  the crate root).
- `secp256k1::SecretKey`, `secp256k1::PublicKey`.
- `bip32::Xpriv`, `Xpub`, `DerivationPath` — `ExtendedPrivKey` /
  `ExtendedPubKey` survive only as aliases deprecated since 0.31.
- `psbt::Psbt` (BIP174).

## Quick examples

### Address generation
```rust
use bitcoin::{Address, CompressedPublicKey, Network};
use bitcoin::secp256k1::{Secp256k1, SecretKey, PublicKey};

let secp = Secp256k1::new();
let sk = SecretKey::from_slice(&[1u8; 32]).unwrap();
let pk = PublicKey::from_secret_key(&secp, &sk);
let addr = Address::p2wpkh(&CompressedPublicKey(pk), Network::Bitcoin);
println!("{}", addr);   // bc1q...
```

`Address::p2wpkh(pk: &CompressedPublicKey, hrp: impl Into<KnownHrp>)`
returns `Address` directly, not a `Result` — no `unwrap()`. A
`bitcoin::PublicKey` may be uncompressed, so converting one is fallible
(`CompressedPublicKey::try_from`).

### Parse + construct tx
```rust
use bitcoin::{Transaction, consensus::encode};

let raw = hex::decode("01000000...").unwrap();
let tx: Transaction = encode::deserialize(&raw).unwrap();
println!("txid: {}", tx.compute_txid());

let bytes = encode::serialize(&tx);
```

### Sign with secp256k1
```rust
let secp = Secp256k1::new();
let msg = bitcoin::secp256k1::Message::from_digest_slice(&hash).unwrap();
let sig = secp.sign_ecdsa(&msg, &sk);
```

## Modules

- `consensus` — wire format encode/decode.
- `blockdata` — block / tx / script.
- `network` — message types, magic bytes.
- `psbt` — partially-signed tx.
- `bip32` — HD derivation.
- `taproot` — Taproot (TaprootBuilder, ControlBlock).
- `address` — addr parsing + generation.

## Use cases

- Wallet / signer / explorer code in Rust.
- Backend services consuming Bitcoin data.
- Foundation for higher-level libs (BDK, LDK).

## Common pitfalls

- API churn between minor versions in 0.x range. Pin carefully.
- `Script` (zero-cost wrapper) vs `ScriptBuf` (owned) — most APIs
  take `&Script`.
- Network mismatch errors when building cross-network apps.

## See also

- [bdk/SKILL.md](../bdk/SKILL.md)
- [ldk/SKILL.md](../ldk/SKILL.md)
- [miniscript-rs/SKILL.md](../miniscript-rs/SKILL.md)
- [secp256k1-rs/SKILL.md](../secp256k1-rs/SKILL.md)
- [corepc/SKILL.md](../corepc/SKILL.md)
- [bitcoin-kernel/SKILL.md](../bitcoin-kernel/SKILL.md)
