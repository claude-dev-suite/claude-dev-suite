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
- **Sufficient security**: ~128-bit security against discrete-log
  attacks, parity to symmetric-128.

## Critical operations to never mess up

1. **Modular inverse**: Use Fermat's little theorem `a^(p-2) mod p` or
   extended Euclidean. Constant-time required for security.
2. **Scalar generation**: 32 bytes of CSPRNG, reduce mod n. **Reject
   zero**.
3. **Range check pubkey**: x in [0, p), y satisfies curve equation.
4. **Co-factor**: cofactor h = 1, so any non-zero point on curve is in
   the prime-order subgroup. No subgroup check needed.

## Recommended library: libsecp256k1

The C library maintained at `github.com/bitcoin-core/secp256k1`:
- Constant-time everywhere by default.
- Optimized scalar mult using endomorphism.
- Modular APIs: `secp256k1_ec_*`, `secp256k1_ecdsa_*`, `secp256k1_schnorrsig_*`,
  `secp256k1_musig2_*`, `secp256k1_frost_*` (experimental).
- Bindings: `rust-secp256k1`, `python-bitcoinlib` (via cffi),
  `secp256k1-node`, etc.

**Avoid** rolling your own EC math in production. Subtle errors here
are catastrophic.

## Common bugs

- Using a non-CT mod-inverse → side-channel key leak.
- Accepting public keys without curve-equation check → invalid-curve
  attack on `(P + Q)` operations.
- Confusing `n` (group order) with `p` (field prime) — they differ.
- Generating private keys from a buggy RNG (e.g., `Math.random()` in
  JS) → catastrophic.

## See also

- [ecdsa/SKILL.md](../ecdsa/SKILL.md)
- [schnorr/SKILL.md](../schnorr/SKILL.md)
- [../../libraries/secp256k1-c/SKILL.md](../../libraries/secp256k1-c/SKILL.md)
- [../../libraries/secp256k1-rs/SKILL.md](../../libraries/secp256k1-rs/SKILL.md)
