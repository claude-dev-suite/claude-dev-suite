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
Inputs: secret key d (32 bytes), message m (any length), aux_rand (32 bytes optional)

1. P = d * G;  if P.y is odd, d = n - d  (force even-y).
2. t = d XOR TaggedHash("BIP0340/aux", aux_rand)    [nonce binding]
3. rand = TaggedHash("BIP0340/nonce", t || P.x || m)
4. k = int(rand) mod n;  if k == 0, abort.
5. R = k * G;  if R.y is odd, k = n - k.
6. e = TaggedHash("BIP0340/challenge", R.x || P.x || m)  mod n
7. s = (k + e*d) mod n
8. Output: (R.x, s) → 64 bytes.
```

`m` was restricted to 32 bytes until BIP340's 2023-04 revision lifted
it; it is arbitrary-length now. In Bitcoin `m` is always the 32-byte
BIP341 sighash. See [pitfalls.md](quick-ref/pitfalls.md) #5.

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

Typical speedup: 2-3x for ~100 sigs — but this is theory, not a
deployed code path. libsecp256k1 exposes no batch-verify API and
Bitcoin Core verifies each Taproot signature individually (as of
September 2026). See [batch-verify.md](quick-ref/batch-verify.md).

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

## Post-quantum outlook (as of September 2026)

BIP340 keys are the exposed surface in the quantum debate: Shor's
algorithm recovers a secret key from a public key, and a Taproot
key-path output publishes its 32-byte x-only key in the scriptPubKey,
so it is breakable-in-principle long before it is ever spent ("long
exposure"). A key revealed only in a mempool spend is the harder
"short exposure" case.

Two drafts frame the response. Neither is activated and neither has
consensus:

- **BIP 360, "Pay-to-Merkle-Root (P2MR)"** (Beast, Heilman, Foxen Duke;
  Draft, Layer: Consensus (soft fork); assigned 2024-12-18, spec version
  0.12.1 of 2026-07-24; Requires 340/341/342). A SegWit **version 2**
  output whose witness program is the Merkle root of a script tree —
  a P2TR with the key path removed, bech32m addresses starting `bc1z`.
  It targets long exposure only and deliberately picks **no** PQ
  signature algorithm, leaving that to a later soft fork. Renamed from
  "P2QRH" (2025-09) then "P2TSH" (2026-02).
- **BIP 361, "Post Quantum Migration and Legacy Signature Sunset"**
  (Lopp et al.; Draft, Layer: Consensus (soft fork), Type:
  Informational; assigned 2026-02-11). Phase A, 160,000 blocks
  (~3 years) after activation, disallows *sending* to
  quantum-vulnerable output types; Phase B, 2 years after Phase A,
  encumbers ECDSA/Schnorr spends with a quantum-safe rescue protocol.
  Contested, precisely because it removes the ordinary spending path
  from coins that did not migrate.

Nothing here changes how you sign or verify BIP340 today.

## Replacement signature schemes (as of September 2026)

Neither BIP above is a signature scheme — they define output types and
migration policy. What would actually sign is a separate track, and it
is signature-scheme material, so it lives here rather than with the
proposals skill.

**SHRINCS** ("Shrunken SPHINCS") is the candidate written specifically
for Bitcoin. First draft BIP posted to the bitcoindev list by
conduition on 2026-08-26 on behalf of the SHRINCS working group;
authors are conduition, Ethan Heilman, Mikhail Kudinov, Oleksandr
Kurbatov, Jonas Nick and remix7531. Status Draft, Type Specification,
**no BIP number assigned**, and the draft states its security proof
is TODO.

It is hash-based and instantiated entirely on SHA256 — no lattice or
other extra hardness assumption — and combines two components under
one key:

- **Stateful**: a flexible XMSS (FXMSS) tree of WOTS+C one-time
  signatures. The signer picks the tree shape; an unbalanced tree
  makes the first few signatures small.
- **Stateless**: SLH-DSA (NIST FIPS-205, the standardized SPHINCS+)
  with a non-standard parameter set whose signature budget is reduced
  from 2^64 to 2^40, which buys signatures smaller than
  SLH-DSA-SHA2-128s.

Either component alone verifies, so losing signing state degrades
signature size rather than bricking the key.

| Property | BIP340 | SHRINCS (draft, 2026-08) |
|----------|--------|--------------------------|
| Public key | 32 bytes (x-only) | 48 bytes |
| Signature | 64 bytes | 548-4,619 stateful; 5,777 stateless |
| Assumption | ECDLP in ROM | SHA256 security only |
| Target level | ~128-bit classical | NIST category 1 (128 classical, 64 quantum) |

Two consequences that matter to the rest of this skill:

1. **No linearity.** Hash-based signatures have no group structure.
   The SHRINCS draft specifies no key aggregation, no key tweaking and
   no adaptor construction, so nothing in the BIP340 stack — MuSig2,
   FROST, adaptor sigs, DLCs, the BIP341 Taproot tweak — carries over
   as written.
2. **State replaces the nonce as the footgun.** Reusing a state
   counter under the same SHRINCS key lets anyone who observes both
   signatures forge. Same shape of bug as BIP340 nonce reuse, but it
   becomes a wallet-persistence problem instead of an RNG problem.

The other families in the field are the NIST-standardized ones —
SLH-DSA (FIPS-205), which SHRINCS reuses as its stateless component,
and the lattice-based ML-DSA (FIPS-204), which it only compares
against on size. The draft cites its combined pubkey+stateful-signature
size as ~13x smaller than SLH-DSA-SHA2-128s and ~6x smaller than
ML-DSA-44 — the latter at a different security level, since ML-DSA-44
targets NIST category 2 where SHRINCS targets category 1.

Maturity caveats, straight from the draft: the reference implementation
is a naive, non-constant-time Python one explicitly not for production,
comprehensive test vectors are still TODO and are required to move the
proposal from Draft to Complete, and an optimized implementation is
TODO. The draft stops at the signature scheme and says nothing about
deployment; per the bitcoindev discussion, exposing SHRINCS onchain
would need a new opcode or output type in a separate proposal. See
[../../protocol/proposals/SKILL.md](../../protocol/proposals/SKILL.md)
for that deployment and migration dimension.

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
- [../../protocol/proposals/SKILL.md](../../protocol/proposals/SKILL.md) — BIP360/361, SHRINCS deployment
