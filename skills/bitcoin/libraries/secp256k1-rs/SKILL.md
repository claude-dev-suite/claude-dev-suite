---
name: bitcoin-libraries-secp256k1-rs
description: |
  rust-secp256k1: Rust bindings to libsecp256k1 (C). ECDSA, Schnorr,
  ECDH, key tweaking, MuSig2 (BIP327, since 0.33).
  USE WHEN: low-level crypto in Rust, working with raw secp256k1
  operations.
allowed-tools: Read, Grep, Glob
---

# rust-secp256k1

Rust bindings to upstream libsecp256k1. Wraps the constant-time C
implementation; safe API.

Repo: `github.com/rust-bitcoin/rust-secp256k1`. As of 0.33.1 (August 2026)
the crate's own metadata points at `git.rust-bitcoin.org/rust-bitcoin/rust-secp256k1`,
which is where upstream development now happens.

## Install

```toml
[dependencies]
secp256k1 = { version = "0.33", features = ["rand"] }
```

Current release: 0.33.1, published to crates.io 2026-08-29. There is no
`schnorr` or `musig` Cargo feature - both modules are compiled
unconditionally; the opt-in features are `std` (default), `alloc`,
`rand`, `recovery`, `lowmemory`, `global-context`,
`global-context-less-secure`, `serde`, `arbitrary`.
0.32.0 was never released: the `0.32.0-beta.*` crates are yanked and
0.33.0 (crates.io 2026-08-28) supersedes them.

## Quick examples

Since 0.33.0 the `Secp256k1` context is no longer threaded through the
public API - the free functions below use an internal global context.

### Key generation
```rust
use secp256k1::{rand, PublicKey, SecretKey}; // secp256k1 re-exports rand

let mut rng = rand::rng();          // rand 0.9 renamed `thread_rng()` to `rng()`
let (sk, pk) = secp256k1::generate_keypair(&mut rng);

// equivalently
let sk = SecretKey::new(&mut rng);
let pk = PublicKey::from_secret_key(&sk);
```

### ECDSA sign
```rust
use secp256k1::{ecdsa, Message};

let msg = Message::from_digest([0u8; 32]);      // 32-byte sighash
let sig = ecdsa::sign(msg, &sk);
ecdsa::verify(&sig, msg, &pk)?;
```

### Schnorr (BIP340)
```rust
use secp256k1::{schnorr, Keypair};

let kp = Keypair::from_secret_key(&sk);
let (xonly, _parity) = kp.x_only_public_key();
let sighash = [0u8; 32];                        // BIP340 signs any-length msg
let sig = schnorr::sign_no_aux_rand(&sighash, &kp);
schnorr::verify(&sig, &sighash, &xonly)?;
```

### MuSig2 (BIP327)
```rust
use secp256k1::musig::{
    new_nonce_pair, AggregatedNonce, KeyAggCache, Session, SessionSecretRand,
};

let mut pubkeys = [&pk_a, &pk_b];
secp256k1::sort_pubkeys(&mut pubkeys);          // BIP327 key sorting
let cache = KeyAggCache::new(&pubkeys);
let agg_pk = cache.agg_pk();                    // XOnlyPublicKey
// round 1: new_nonce_pair(...) per signer -> AggregatedNonce::new(&nonces)
// round 2: Session::new(&cache, agg_nonce, msg).partial_sign(...)
//          -> session.partial_sig_agg(&sigs).verify(&agg_pk, msg)
```

## Use cases

- Low-level crypto without Bitcoin tx context.
- Building higher-level abstractions on top.
- Performance-critical paths where you avoid the rust-bitcoin layer.

## Compared

`rust-bitcoin` re-exports `secp256k1` types; for Bitcoin app code,
import from `bitcoin::secp256k1::*` for type compatibility.

## Common pitfalls

- `Message::from_digest_slice` is deprecated (since 0.31.0) in favour of
  `Message::from_digest`, which takes a `[u8; 32]` array outright.
- `ecdsa::verify` takes `(sig, msg, pk)`: 0.33.0 reordered the old
  `verify_ecdsa(msg, sig, pk)` args to match `schnorr::verify`.
- Pre-0.33 code threaded a `Secp256k1` context through every call, and
  creating that context was expensive enough to hoist out of loops. The
  context methods (`secp.sign_ecdsa`, `secp.verify_schnorr`, ...) still
  exist but are deprecated since 0.33.0; the global context replacing them
  is rerandomized internally, and `rerandomize_global_context(&seed)` is
  the replacement for the old `Secp256k1::randomize`.
- 0.33.0 renamed `secret_bytes` to `to_secret_bytes` (on `Keypair` and
  `ecdh::SharedSecret`) and deprecated `SecretKey::from_slice` in favour
  of `SecretKey::from_secret_bytes`.
- Unsafe / `unstable` features have additional risk.
- `Keypair` types vary slightly across releases; pin version.

## See also

- [rust-bitcoin/SKILL.md](../rust-bitcoin/SKILL.md)
- [secp256k1-c/SKILL.md](../secp256k1-c/SKILL.md)
- [../../cryptography/secp256k1/SKILL.md](../../cryptography/secp256k1/SKILL.md)
- [../../cryptography/schnorr/SKILL.md](../../cryptography/schnorr/SKILL.md)
