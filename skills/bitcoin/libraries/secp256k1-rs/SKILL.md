---
name: bitcoin-libraries-secp256k1-rs
description: |
  rust-secp256k1: Rust bindings to libsecp256k1 (C). ECDSA, Schnorr,
  ECDH, key tweaking, MuSig2 (in newer versions).
  USE WHEN: low-level crypto in Rust, working with raw secp256k1
  operations.
allowed-tools: Read, Grep, Glob
---

# rust-secp256k1

Rust bindings to upstream libsecp256k1. Wraps the constant-time C
implementation; safe API.

Repo: `github.com/rust-bitcoin/rust-secp256k1`.

## Install

```toml
[dependencies]
secp256k1 = { version = "0.30", features = ["rand", "schnorr"] }
```

## Quick examples

### Key generation
```rust
use secp256k1::{Secp256k1, SecretKey, PublicKey, rand};

let secp = Secp256k1::new();
let (sk, pk) = secp.generate_keypair(&mut rand::thread_rng());
```

### ECDSA sign
```rust
let msg = secp256k1::Message::from_digest_slice(&[0u8; 32])?;
let sig = secp.sign_ecdsa(&msg, &sk);
secp.verify_ecdsa(&msg, &sig, &pk)?;
```

### Schnorr (BIP340)
```rust
use secp256k1::{Keypair, XOnlyPublicKey};

let kp = Keypair::from_secret_key(&secp, &sk);
let (xonly, _parity) = kp.x_only_public_key();
let sig = secp.sign_schnorr_no_aux_rand(&msg, &kp);
secp.verify_schnorr(&sig, &msg.as_ref(), &xonly)?;
```

### MuSig2 (experimental, with `musig` feature)
```rust
// see secp256k1's musig2 module documentation
```

## Use cases

- Low-level crypto without Bitcoin tx context.
- Building higher-level abstractions on top.
- Performance-critical paths where you avoid the rust-bitcoin layer.

## Compared

`rust-bitcoin` re-exports `secp256k1` types; for Bitcoin app code,
import from `bitcoin::secp256k1::*` for type compatibility.

## Common pitfalls

- `Message::from_digest_slice` requires exactly 32 bytes.
- Unsafe / `unstable` features have additional risk.
- `Keypair` types vary slightly across releases; pin version.

## See also

- [rust-bitcoin/SKILL.md](../rust-bitcoin/SKILL.md)
- [secp256k1-c/SKILL.md](../secp256k1-c/SKILL.md)
- [../../cryptography/secp256k1/SKILL.md](../../cryptography/secp256k1/SKILL.md)
- [../../cryptography/schnorr/SKILL.md](../../cryptography/schnorr/SKILL.md)
