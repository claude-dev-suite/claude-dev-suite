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
./configure --enable-module-recovery   # every other module is on by default
make
make install
```

CMake is a first-class build path since v0.7.0 (July 2025), which
dropped the "experimental" label from it and raised the minimum to
CMake 3.22.

```bash
cmake -B build -DSECP256K1_ENABLE_MODULE_RECOVERY=ON
cmake --build build
```

## Modules

Complete module set as of v0.8.0 (August 2026). Everything except
`recovery` defaults to on; `--disable-module-<name>` compiles one out.

- Default: ECDSA.
- `extrakeys` — x-only pubkeys (BIP340).
- `schnorrsig` — Schnorr signatures (BIP340).
- `recovery` — recoverable ECDSA; the one module defaulting to off.
- `ecdh` — ECDH.
- `ellswift` — ElligatorSwift encoding + x-only DH, added in v0.4.0
  (September 2023); the primitive behind BIP324 v2 transport.
- `musig` — MuSig2 (BIP327), added in v0.6.0 (November 2024). Not
  experimental — an ordinary default-on module.
- `silentpayments` — BIP352 silent payments, added in v0.8.0
  (August 2026). Sending and recipient scanning given full
  transaction data; light-client scanning is not implemented.

There is no `frost` and no `whitebox` module upstream. As of September
2026 FROST for this codebase exists only as open pull requests against
`BlockstreamResearch/secp256k1-zkp` (#138, #278); that fork also
carries `whitelist`, `rangeproof`, `generator`, `ecdsa_adaptor` and
other modules that never landed in `bitcoin-core/secp256k1`.

## Removed symbols

v0.8.0 (August 2026) deleted two long-deprecated names — code still
using them stops linking:

| Removed | Use instead |
|---------|-------------|
| `secp256k1_context_no_precomp` | `secp256k1_context_static` |
| `secp256k1_schnorrsig_sign` | `secp256k1_schnorrsig_sign32` |

v0.7.0 (July 2025) likewise removed `secp256k1_ec_privkey_negate`,
`secp256k1_ec_privkey_tweak_add` and `secp256k1_ec_privkey_tweak_mul`
in favour of the `_seckey_` spellings.

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
