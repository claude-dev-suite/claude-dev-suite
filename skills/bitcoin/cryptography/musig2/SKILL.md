---
name: bitcoin-musig2
description: |
  MuSig2 (BIP327): two-round Schnorr key aggregation for n-of-n
  multisig. Aggregates n public keys into a single 32-byte x-only
  pubkey indistinguishable from a single-sig. Used in Taproot
  cooperative spends.
  Quick refs: protocol round-trip, key aggregation math, common attacks.
  USE WHEN: implementing n-of-n cooperative Taproot signing, designing
  Lightning Taproot channels, joint custody.
allowed-tools: Read, Grep, Glob
---

# MuSig2 (BIP327)

> **Quick refs**: [protocol.md](quick-ref/protocol.md), [key-agg.md](quick-ref/key-agg.md), [attacks.md](quick-ref/attacks.md)

MuSig2 is the **standard** Schnorr key-aggregation protocol for Bitcoin.
n parties hold separate private keys, jointly produce a single public
key `Q` and a single signature `(R, s)` indistinguishable from a
single-key Schnorr signature.

Replaces MuSig1 (3-round) and MuSig-DN with simpler 2-round + better
security proofs.

## Properties

- **Indistinguishable** — observers cannot tell `Q` was aggregated.
- **Off-chain coordination** — n-of-n in 2 rounds with no on-chain
  multisig.
- **Provably secure** in the Algorithmic One-More-Discrete-Log (AOMDL)
  + Random Oracle Model.
- **Fits Taproot key-path** — cheapest spend; no script-path needed
  for cooperative case.

## Two-round protocol summary

### Round 1 — Nonce exchange

Each signer i:
1. Generates two ephemeral nonces `(k_{i,1}, k_{i,2})`.
2. Computes `(R_{i,1}, R_{i,2}) = (k_{i,1}*G, k_{i,2}*G)`.
3. Broadcasts `R_{i,1}, R_{i,2}` to all other signers (66 bytes total).

Aggregator computes:
- `R_1 = sum(R_{i,1})`, `R_2 = sum(R_{i,2})`.
- `b = TaggedHash("MuSig/noncecoef", R_1 || R_2 || agg_pubkey || msg)`.
- `R = R_1 + b*R_2`.

### Round 2 — Partial sig exchange

Each signer i:
1. Computes their partial sig `s_i` using `R`, message, key-agg
   coefficient `a_i`, etc.
2. Broadcasts `s_i`.

Aggregator: `s = sum(s_i) mod n`.

Final sig: `(R.x, s)` — 64 bytes, valid BIP340 sig under `Q`.

## Key aggregation

```
Inputs: pubkeys P_1, ..., P_n (in agreed-upon order)
1. L = sorted(P_i)   (canonical order, byte-lex)
2. a_i = TaggedHash("KeyAgg coefficient", L || P_i.x)
3. Q = sum(a_i * P_i)
```

If `Q.y` is odd, parity bit `g_q = -1`, otherwise `g_q = +1`. This
parity is tracked through signing.

The coefficients `a_i` defeat the **rogue-key attack** that MuSig1
patched but earlier schemes had: an attacker who could pick their
public key after seeing others' would otherwise control the sum.

## Tweaks (Taproot integration)

After key aggregation, Taproot tweak applies:
```
Q_tweaked = Q + t*G  where t = TaggedHash("TapTweak", Q.x || merkle_root)
```

Signing for `Q_tweaked` requires an extra adjustment in the partial
sig phase. BIP327 specifies "tweak context" maintaining the
accumulated tweak.

## Pre-shared nonces (NonceGen variants)

- `NonceGen` deterministic from secret + msg + extra_in.
- "MuSig2 with non-determinism" requires careful aux entropy.
- **Critical**: nonces must NOT be reused across different signing
  sessions, even with different messages. State must be persisted
  carefully (e.g., in encrypted nonce wallet).

## Use cases in Bitcoin

1. **Joint custody** — 2 partners co-spend with single-sig appearance.
2. **Lightning** — Taproot channels (BOLT update) replace OP_2 pubkey
   with MuSig2-aggregated key for channel funding output.
3. **DAO multisig with privacy** — n directors sign as one.
4. **Vault hot/cold cooperative spend** — cold key + hot key
   aggregated for everyday use.
5. **Coinjoin servers** with k-anonymity → users + service jointly
   sign.

## Security caveats

- **Concurrent sessions** — naive per-signer parallel sessions enable
  "Wagner-style" forge attacks. Solution in BIP327: nonce binding to
  message (the `b` coefficient).
- **State persistence** — nonces must be wiped after one use. Power
  loss between round 1 and round 2 → must restart with fresh nonces.
- **Hardware wallet support** — limited as of 2024. Coldcard Mk4 has
  experimental support; most others lag.

## Implementations

- `libsecp256k1` (`secp256k1_musig2_*`).
- `rust-secp256k1` (musig2 module).
- BDK has `BdkSigner` integration for MuSig2 (experimental).
- `ZkVM`/`bdk-sgx`-style HSMs.

## Common bugs

- Forgetting to apply parity flips during partial-sig phase
  (`g_q` and `g_b` must propagate).
- Reusing nonces across two attempts of the same session → key leak.
- Missing key-aggregation coefficient `a_i` → produces a sig under a
  different aggregated pubkey.

## See also

- [schnorr/SKILL.md](../schnorr/SKILL.md)
- [frost/SKILL.md](../frost/SKILL.md)
- [adaptor-sigs/SKILL.md](../adaptor-sigs/SKILL.md)
- [../../protocol/taproot/SKILL.md](../../protocol/taproot/SKILL.md)
