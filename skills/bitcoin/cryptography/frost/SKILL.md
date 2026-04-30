---
name: bitcoin-frost
description: |
  FROST (Flexible Round-Optimised Schnorr Threshold): t-of-n threshold
  signing on secp256k1. n participants share a key via Distributed Key
  Generation (DKG) or trusted dealer; any t can produce a Schnorr
  signature. Differs from MuSig2 (which is n-of-n).
  USE WHEN: t-of-n threshold custody (e.g., 3-of-5 board signatures)
  with single-sig appearance on chain, federated services, multi-sig
  with availability.
allowed-tools: Read, Grep, Glob
---

# FROST — t-of-n Threshold Schnorr

FROST is the standard t-of-n threshold Schnorr signature scheme suitable
for Bitcoin. Like MuSig2, it produces a single 64-byte BIP340 signature
under one aggregated pubkey. Unlike MuSig2 (which requires all n parties
to sign), FROST allows any t ≤ n parties to sign.

## Key properties

- **t-of-n** — any t parties can sign, fewer cannot.
- **Single-sig appearance** — output looks like a regular Schnorr sig
  on a regular x-only pubkey.
- **Two rounds** in the FROST signing protocol (after one-time DKG).
- **No on-chain multisig** — saves bytes and improves privacy.

## Two phases

### Phase 1: Distributed Key Generation (DKG)

n parties run a DKG protocol to set up shares of a common private key
`d` corresponding to public key `P = d * G`. No single party ever
knows `d` itself.

DKG variants:
- **Pedersen DKG** (classical, 2 rounds with broadcast).
- **Trusted dealer** — one party generates `d`, hands shares out.
  Acceptable for some custody models.
- **DKG with verifiable secret sharing** — using Feldman / Pedersen
  VSS so parties can verify their shares.

After DKG, each party i has:
- Share `s_i` (Shamir share of `d`).
- Public verification key `S_i = s_i * G`.
- Group public key `P = d * G`.

### Phase 2: Threshold signing

When t parties want to sign message m:

#### Round 1 (commit)
Each signer i:
1. Generates two ephemeral nonces `(d_i, e_i)`.
2. Computes `(D_i, E_i) = (d_i*G, e_i*G)`.
3. Broadcasts `(D_i, E_i)` to coordinator.

#### Aggregation
Coordinator:
- Computes binding factor `ρ_i = H(i, m, ((D_j, E_j) for all signers))`.
- Computes group commitment `R = sum(D_i + ρ_i * E_i)`.

#### Round 2 (sign)
Each signer i:
- Computes Lagrange coefficient `λ_i` for the cooperating subset of
  size t.
- `c = TaggedHash("BIP0340/challenge", R.x || P.x || m)`.
- Partial sig: `z_i = d_i + ρ_i*e_i + λ_i * s_i * c   mod n`.
- Sends `z_i` to coordinator.

#### Aggregation
- `s = sum(z_i) mod n`.
- Final sig: `(R.x, s)`.

## FROST vs MuSig2

| Aspect | MuSig2 | FROST |
|--------|--------|-------|
| Threshold | n-of-n | t-of-n |
| Setup | trivial (just sum keys) | requires DKG |
| Round trip | 2 rounds + nonce setup | 2 rounds + DKG once |
| Partial sigs | per-signer-key contribution | Lagrange-based with subset selection |
| BIP | 327 | not (yet) BIP-numbered |
| Bitcoin-specific | yes (BIP340 alignment) | yes (BIP340 alignment) |

Use **MuSig2** when all n parties always sign together (e.g., 2-of-2
joint custody).
Use **FROST** when subset signing is needed (e.g., 3-of-5 board, 2-of-3
multisig with social recovery).

## Implementations

- `frost-secp256k1` (Zcash / ZF FROST) — Rust reference.
- `secp256k1-frost` (libsecp256k1 experimental module).
- `chillDKG` (Blockstream research) — practical DKG with state recovery.
- `frost-dalek` (Ristretto, not Bitcoin-relevant).
- Tools: `frost-cli` proof-of-concept.

## Status for Bitcoin

- No formal BIP yet (under draft).
- Test deployments: Zcash uses FROST for orchard treasury; Bitcoin
  custodians experimenting (Coinkite, Lightning Labs research).
- Hardware wallet support: limited — most HW vendors haven't shipped
  FROST yet (2024-2025).

## Security model

- **DKG correctness** — must use a robust DKG; bad DKG can leak `d`.
- **Nonce uniqueness** — same as MuSig2, never reuse nonces.
- **Subset binding** (`ρ_i` factor) — defeats the same Wagner-style
  attack that MuSig2 mitigates.
- **Identifiable abort** — modern FROST variants identify which party
  cheated (vs old "round failed, who?" problem).

## Use cases in Bitcoin

1. **Federated mints** (Fedimint guardians).
2. **Lightning Service Providers** with t-of-n key servers.
3. **Wallet recovery social schemes** (e.g., 2-of-3 friends).
4. **Multi-vendor multisig with availability** — currently P2WSH
   2-of-3 on chain; FROST collapses to single-sig on-chain.

## Common bugs

- Skipping verification step in DKG → silently corrupted shares.
- Reusing `(d_i, e_i)` nonces across signing sessions → key leak.
- Using non-Lagrange subset coefficients (e.g., linear weights) →
  produces wrong combined key.
- Mixing FROST and MuSig2 nonce derivation in a unified library and
  conflating tag domains.

## See also

- [musig2/SKILL.md](../musig2/SKILL.md)
- [schnorr/SKILL.md](../schnorr/SKILL.md)
- [../../l2/fedimint/SKILL.md](../../l2/fedimint/SKILL.md)
