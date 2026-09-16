---
name: bitcoin-secp256k1
description: |
  secp256k1 elliptic curve: parameters, group law, key encoding, point
  serialization, library bindings (libsecp256k1 in C, Rust, Python).
  USE WHEN: low-level key/point operations, debugging signature failures,
  understanding why Bitcoin uses this curve specifically.
allowed-tools: Read, Grep, Glob
---

# secp256k1

The elliptic curve Bitcoin uses for all signatures (ECDSA + Schnorr).
Defined by SECG (`SEC 2: Recommended Elliptic Curve Domain Parameters`).

## Parameters

```
p = 2^256 - 2^32 - 977   (the field prime)
a = 0
b = 7
G = (0x79BE667E_F9DCBBAC_55A06295_CE870B07_029BFCDB_2DCE28D9_59F2815B_16F81798,
     0x483ADA77_26A3C465_5DA4FBFC_0E1108A8_FD17B448_A6855419_9C47D08F_FB10D4B8)
n = 0xFFFFFFFF_FFFFFFFF_FFFFFFFF_FFFFFFFE_BAAEDCE6_AF48A03B_BFD25E8C_D0364141
h = 1   (cofactor)
```

The curve equation: `y^2 = x^3 + 7  (mod p)`.

## Point operations

- **Point addition**: P + Q with chord-and-tangent rule mod p.
- **Scalar multiplication**: `k*G` is the public key for private scalar k.
- **Point doubling**: 2P via tangent line.
- **Point at infinity**: identity for the group.

## Key encoding

### Public key (full)
- **Uncompressed (65 bytes)**: `0x04 || x || y` (32-byte each).
- **Compressed (33 bytes)**: `0x02 || x` if y even, `0x03 || x` if y odd.

### x-only (BIP340, Taproot)
- **32 bytes**: just `x`. Implicit even-y convention.
- Used in Schnorr signatures and Taproot output keys.

## Why secp256k1 (not P-256)?

- **No NSA-derived seed** in the parameter generation (P-256 has
  the controversial Dual_EC seeds and the ad-hoc base point).
- **Endomorphism** `λ = ...` allows fast multiplication: any point P
  has a known `(λ·P)` derivable cheaply, used in optimized scalar mult.
- **Sufficient security**: ~128-bit *classical* security against
  discrete-log attacks, parity to symmetric-128. See the quantum
  caveat below.

## Quantum outlook (as of September 2026)

The ~128-bit figure above is classical security. Shor's algorithm
solves the discrete log on an elliptic curve in polynomial time, so no
secp256k1 key size helps against a cryptographically relevant quantum
computer; the exposed surface is any *published* public key (a Taproot
x-only key sits in the scriptPubKey, a reused-address ECDSA key sits in
a spent input). None of this changes how you sign or verify today.

Two consensus-track drafts frame the response. Both are **Draft** in
the BIPs repo as of September 2026, with no activation parameters:

- **BIP 360, "Pay-to-Merkle-Root (P2MR)"** (Beast, Heilman, Foxen Duke;
  Consensus soft fork, assigned 2024-12-18, spec version 0.12.1) — P2TR
  with the key path removed, so the output publishes no EC point. It
  targets *long exposure* attacks only and deliberately picks no
  post-quantum signature algorithm, deferring that to a later proposal.
- **BIP 361, "Post Quantum Migration and Legacy Signature Sunset"**
  (Lopp et al.; Consensus soft fork, Type: Informational, assigned
  2026-02-11) — a phased sunset that first disallows sending to
  quantum-vulnerable outputs, then encumbers ECDSA/Schnorr spends with
  a quantum-safe rescue protocol.

Detail lives in [schnorr/SKILL.md](../schnorr/SKILL.md) (BIP340 key
exposure) and [../../protocol/proposals/SKILL.md](../../protocol/proposals/SKILL.md)
(output types, migration policy, rescue mechanics). libsecp256k1 ships
no post-quantum module.

## Critical operations to never mess up

1. **Modular inverse**: Use Fermat's little theorem `a^(p-2) mod p` or
   extended Euclidean. Constant-time required for security.
2. **Scalar generation**: 32 bytes of CSPRNG, reduce mod n. **Reject
   zero**. On a signing device, show the raw device-generated entropy
   and mix in independent user entropy (dice/coin) — both practices
   were reinforced by the July 2026 Coldcard advisory below.
3. **Range check pubkey**: x in [0, p), y satisfies curve equation.
4. **Co-factor**: cofactor h = 1, so any non-zero point on curve is in
   the prime-order subgroup. No subgroup check needed.

## Recommended library: libsecp256k1

The C library maintained at `github.com/bitcoin-core/secp256k1`:
- Constant-time everywhere by default.
- Optimized scalar mult using endomorphism.
- Modular APIs: `secp256k1_ec_*`, `secp256k1_ecdsa_*`,
  `secp256k1_xonly_*` / `secp256k1_keypair_*` (extrakeys),
  `secp256k1_schnorrsig_*` (BIP340), `secp256k1_ecdh_*`,
  `secp256k1_recovery_*`, `secp256k1_musig_*` (MuSig2, BIP327 — the C
  prefix has no `2`), `secp256k1_ellswift_*` (BIP324),
  `secp256k1_silentpayments_*` (BIP352). All modules are configure-time
  options; as of master (September 2026) every one defaults to enabled
  except `recovery`, which is off by default.
- **There is no FROST module upstream** (checked against master,
  September 2026). `secp256k1-frost` is a third-party fork, not a
  libsecp256k1 module — see [frost/SKILL.md](../frost/SKILL.md).
- Bindings: `rust-secp256k1`, `python-bitcoinlib` (via cffi),
  `secp256k1-node`, etc.

**Avoid** rolling your own EC math in production. Subtle errors here
are catastrophic.

### Current release (as of September 2026)

**v0.8.0 (2026-08-03)**. Modules are exactly: ecdh, ellswift, extrakeys,
musig, recovery, schnorrsig, silentpayments.

- v0.8.0 added the `silentpayments` module (BIP352 send/receive; needs
  full transaction data, no light-client scanning yet) and
  `secp256k1_context_set_sha256_compression`. `secp256k1_ellswift_xdh`
  now rejects secret keys >= the curve order instead of silently
  reducing them.
- v0.8.0 **removed** `secp256k1_context_no_precomp` (use
  `secp256k1_context_static`), the `secp256k1_schnorrsig_sign` alias
  (use `secp256k1_schnorrsig_sign32`) and the `SECP256K1_GNUC_PREREQ`
  macro. The two symbols break old callers at link time; the macro
  breaks them at compile time.
- v0.7.0 (2025-07-21) made the static context pointers `const` and
  removed the deprecated `secp256k1_ec_privkey_*` aliases (use
  `secp256k1_ec_seckey_*`); CMake minimum rose to 3.22 and CMake builds
  stopped being experimental. v0.7.1 (2026-01-26) is maintenance: wider
  stack-secret clearing, a parallel unit-test framework, and a fix for
  an x86_64 assembly feature check that could silently fall back to the
  slower C implementation.
- `rust-secp256k1` (crate `secp256k1`) is at 0.33.1 on crates.io
  (2026-08-29). The 0.32 series added MuSig2 support and **removed the
  `Secp256k1` context from the public API** in favour of a global
  context — a breaking change for every caller.

## Common bugs

- Using a non-CT mod-inverse → side-channel key leak.
- Accepting public keys without curve-equation check → invalid-curve
  attack on `(P + Q)` operations.
- Confusing `n` (group order) with `p` (field prime) — they differ.
- Generating private keys from a buggy RNG (e.g., `Math.random()` in
  JS) → catastrophic. Shipped-hardware case: Coldcard's July 2026
  advisory — a build/link error routed `rng_get()` to MicroPython's
  Yasmarang PRNG from March 2021 on (~40 bits of effective search space
  on Mk2/Mk3, ~72 on Mk4/Mk5/Q, both preliminary). Fixed in 5.6.0
  (Mk4/Mk5), 1.5.0Q (Q), 4.2.0 (Mk2/Mk3), Edge 6.6.0X/6.6.0QX; updating
  does **not** repair an already-generated seed. Details in
  [../../hardware/coldcard/SKILL.md](../../hardware/coldcard/SKILL.md).

## See also

- [ecdsa/SKILL.md](../ecdsa/SKILL.md)
- [schnorr/SKILL.md](../schnorr/SKILL.md)
- [../../libraries/secp256k1-c/SKILL.md](../../libraries/secp256k1-c/SKILL.md)
- [../../libraries/secp256k1-rs/SKILL.md](../../libraries/secp256k1-rs/SKILL.md)
