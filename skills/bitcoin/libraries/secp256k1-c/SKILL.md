---
name: bitcoin-libraries-secp256k1-c
description: |
  libsecp256k1: the canonical secp256k1 C library. Used by Bitcoin
  Core, rust-secp256k1, all major language bindings.
  USE WHEN: low-level crypto in C/C++, building bindings, performance-
  critical paths.
allowed-tools: Read, Grep, Glob
---

# libsecp256k1

The canonical C library for secp256k1. Maintained by Bitcoin Core
team; constant-time, optimized.

Repo: `github.com/bitcoin-core/secp256k1`.

## Build

```bash
git clone https://github.com/bitcoin-core/secp256k1
cd secp256k1
./autogen.sh
./configure --enable-module-recovery --enable-module-schnorrsig \
    --enable-module-extrakeys --enable-module-musig
make
make install
```

## Modules

- Default: ECDSA.
- `extrakeys` — x-only pubkeys (BIP340).
- `schnorrsig` — Schnorr signatures (BIP340).
- `recovery` — recoverable ECDSA.
- `ecdh` — ECDH.
- `musig` — MuSig2 (BIP327).
- `frost` — FROST (experimental).
- `whitebox` — internal testing.

## API

C API:
```c
#include <secp256k1.h>
#include <secp256k1_schnorrsig.h>

secp256k1_context* ctx = secp256k1_context_create(SECP256K1_CONTEXT_NONE);

unsigned char seckey[32] = {...};
secp256k1_pubkey pubkey;
secp256k1_ec_pubkey_create(ctx, &pubkey, seckey);

unsigned char sig[64];
secp256k1_schnorrsig_sign32(ctx, sig, msg32, &keypair, NULL);

int valid = secp256k1_schnorrsig_verify(ctx, sig, msg32, 32, &xonly);
```

## Properties

- Constant-time everywhere.
- Endomorphism-optimized scalar mult.
- Bindings: rust, python, JS (wasm), Go, JVM, etc.

## Use cases

- Bitcoin Core's signing engine.
- All language bindings build on this.
- Performance-critical apps.

## Common pitfalls

- `secp256k1_context_destroy` to avoid leaks.
- Compilation flags matter: enable required modules at build time.
- Keys / signatures must be byte-validated before passing to API
  (length, range).

## See also

- [secp256k1-rs/SKILL.md](../secp256k1-rs/SKILL.md)
- [../../cryptography/secp256k1/SKILL.md](../../cryptography/secp256k1/SKILL.md)
- [../../cryptography/schnorr/SKILL.md](../../cryptography/schnorr/SKILL.md)
- [../../cryptography/musig2/SKILL.md](../../cryptography/musig2/SKILL.md)
