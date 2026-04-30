---
name: bitcoin-schnorr
description: |
  BIP340 Schnorr signatures over secp256k1: sign/verify, x-only pubkeys,
  tagged hashes, batch verification, key tweaking. Building block for
  Taproot, MuSig2, FROST, adaptor signatures, DLCs.
  Quick refs: signing pseudocode, batch verification, common mistakes.
  USE WHEN: signing/verifying Taproot key-path or Tapscript spends,
  designing aggregation protocols, reading BIP340.
allowed-tools: Read, Grep, Glob
---

# BIP340 Schnorr Signatures

> **Quick refs**: [pseudocode.md](quick-ref/pseudocode.md), [batch-verify.md](quick-ref/batch-verify.md), [pitfalls.md](quick-ref/pitfalls.md)

Schnorr is the signature scheme used in Taproot. Discovered in 1989,
patent-encumbered until 2008, finally proposed for Bitcoin in 2018
(BIP340), activated 2021.

## Why Schnorr over ECDSA

| Property | ECDSA | Schnorr (BIP340) |
|----------|-------|------------------|
| Signature size | ~71-72 bytes (DER) | 64 bytes flat |
| Linearity | No | **Yes** |
| Batch verification | No | **Yes** (sub-linear) |
| Malleability | Yes (low-s normalization required) | No (canonical by construction) |
| Provable security | requires assumption | reducible to ECDLP in ROM |
| Key aggregation | impossible | enables MuSig2 / FROST |

**Linearity** is the killer feature: `Sig(k1+k2, m) ≠ Sig(k1,m) + Sig(k2,m)`
in ECDSA, but `... = ...` in Schnorr (in a precise sense). This enables
n-of-n key aggregation, MuSig2, FROST, adaptor signatures, scriptless
scripts, DLCs.

## Tagged hash framework

```
TaggedHash(tag, msg) = SHA256(SHA256(tag) || SHA256(tag) || msg)
```

Domain separation tags used in BIP340:
- `BIP0340/aux` — for nonce derivation (auxiliary entropy).
- `BIP0340/nonce` — for the deterministic nonce hash.
- `BIP0340/challenge` — for the challenge hash `e`.

## x-only pubkeys

Schnorr in BIP340 uses 32-byte **x-only** pubkeys. Implicit "even y"
convention: when computing operations, you `lift_x(P_x)` to choose the
point with even y, and adjust sign of secret key accordingly.

This halves key size and simplifies tweaking math.

## Sign (high-level)

```
Inputs: secret key d (32 bytes), message m (32 bytes), aux_rand (32 bytes optional)

1. P = d * G;  if P.y is odd, d = n - d  (force even-y).
2. t = d XOR TaggedHash("BIP0340/aux", aux_rand)    [nonce binding]
3. rand = TaggedHash("BIP0340/nonce", t || P.x || m)
4. k = int(rand) mod n;  if k == 0, abort.
5. R = k * G;  if R.y is odd, k = n - k.
6. e = TaggedHash("BIP0340/challenge", R.x || P.x || m)  mod n
7. s = (k + e*d) mod n
8. Output: (R.x, s) → 64 bytes.
```

## Verify

```
Inputs: pubkey P_x (32 bytes), message m, sig (R_x, s)

1. P = lift_x(P_x).
2. e = TaggedHash("BIP0340/challenge", R_x || P_x || m) mod n.
3. R' = s*G - e*P
4. Verify R'.y is even AND R'.x == R_x.
```

## Batch verification

n signatures can be verified together in O(n) but with a smaller
constant than n individual verifications. Random linear combinations
prevent forgery:

```
For batch of (Pi, Ri, si, mi) for i in 1..n:
1. Generate random ai for each (a1=1 fixed for security).
2. Compute LHS = sum(ai * si) * G
3. Compute RHS = sum(ai * Ri) + sum(ai * ei * Pi)
4. If LHS == RHS, batch valid.
```

Typical speedup: 2-3x for ~100 sigs. Used during IBD and block
validation for cumulative gain.

## Key tweaking (BIP341)

Taproot tweak: `Q = P + t*G` where `t = TaggedHash("TapTweak", P_x || R)`.

For signing on tweaked output:
```
secret_for_Q = (secret_for_P + t) mod n  (with parity adjustment)
```

This means: a Taproot wallet that holds `d` and knows the script tree
can sign for `Q` using the standard BIP340 signing with the tweaked key.

## Sig encoding in witness

- `SIGHASH_DEFAULT` (= 0x00 byte after sig): omit, sig is 64 bytes.
- Other sighash flags: append flag byte → 65 bytes.

## Common bugs

See [quick-ref/pitfalls.md](quick-ref/pitfalls.md). Headlines:
- **Nonce reuse** → key leak (worse than ECDSA because of linearity).
- **Wrong even-y convention** → sig fails verification.
- **Mixing tagged-hash variants** (e.g., reusing "BIP0340/challenge"
  for a different protocol).
- **lift_x ambiguity** when P_x is on the curve but represents two
  candidates → BIP340 pins this with even-y rule.

## See also

- [musig2/SKILL.md](../musig2/SKILL.md) — key aggregation
- [frost/SKILL.md](../frost/SKILL.md) — threshold sigs
- [adaptor-sigs/SKILL.md](../adaptor-sigs/SKILL.md)
- [dlcs/SKILL.md](../dlcs/SKILL.md)
- [../../protocol/taproot/SKILL.md](../../protocol/taproot/SKILL.md)
