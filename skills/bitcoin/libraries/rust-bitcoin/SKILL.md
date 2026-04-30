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
bitcoin = "0.32"   # check current; API stabilizing
```

## Key types

- `Transaction`, `TxIn`, `TxOut`, `OutPoint`.
- `Script`, `ScriptBuf`, `Address`, `Network`.
- `Block`, `BlockHash`, `BlockHeader`.
- `secp256k1::SecretKey`, `secp256k1::PublicKey`.
- `bip32::ExtendedPrivKey`, `ExtendedPubKey`, `DerivationPath`.
- `psbt::Psbt` (BIP174).

## Quick examples

### Address generation
```rust
use bitcoin::{Address, Network};
use bitcoin::secp256k1::{Secp256k1, SecretKey, PublicKey};
use bitcoin::PrivateKey;

let secp = Secp256k1::new();
let sk = SecretKey::from_slice(&[1u8; 32]).unwrap();
let pk = PublicKey::from_secret_key(&secp, &sk);
let addr = Address::p2wpkh(&PublicKey::new(pk), Network::Bitcoin).unwrap();
println!("{}", addr);   // bc1q...
```

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
