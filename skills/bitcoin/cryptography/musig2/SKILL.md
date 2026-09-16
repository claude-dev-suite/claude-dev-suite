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

BIP327 is **Status: Deployed**, spec version 1.0.4 (as of September
2026).

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

## Descriptors, PSBTs and wallet integration

BIP327 covers only the signing math. Three companion BIPs (all by Ava
Chow) carry MuSig2 into wallet software — statuses as of September
2026:

- **BIP328** (Complete) — *Derivation Scheme for MuSig2 Aggregate
  Keys*. Wraps a plain aggregate pubkey in a **synthetic xpub**:
  depth 0, child number 0, fixed chaincode
  `868087ca02a6f974c4598924c36b57762d32cb45717167e300622c7167e38965`
  (SHA256 of the text `MuSig2MuSig2MuSig2`). Only unhardened
  derivation is possible — there is no aggregate private key. Each
  `CKDpub` step's `I_L` enters the session context as a **plain**
  tweak (`is_xonly_t = false`), so every signer must recompute the
  derivation tweaks for the child key being signed for.
- **BIP390** (Draft, v0.2.0) — the `musig(KEY,KEY,...,KEY)` descriptor
  key expression. Allowed only inside `tr()`, `rawtr()` or `sp()`,
  never nested in another `musig()`. Keys are sorted with `KeySort`
  after all derivation and before aggregation, so the order written
  in the descriptor does not matter. `musig(...)/NUM/.../*` derives
  from the aggregate key per BIP328, and is legal only when every
  participant is an xpub (or derived from one) and no participant
  itself uses `/*` or `/<NUM;NUM;...>`. No hardened steps after
  `musig()`.
- **BIP373** (Complete) — *MuSig2 PSBT Fields*, carrying both rounds
  through an otherwise ordinary PSBT workflow:
  `PSBT_IN_MUSIG2_PARTICIPANT_PUBKEYS` (`0x1a`),
  `PSBT_IN_MUSIG2_PUB_NONCE` (`0x1b`),
  `PSBT_IN_MUSIG2_PARTIAL_SIG` (`0x1c`) and
  `PSBT_OUT_MUSIG2_PARTICIPANT_PUBKEYS` (`0x08`).

Bitcoin Core parses `musig()` descriptors and reads/writes the BIP373
PSBT fields from **v30.0 (October 2025)**; descriptor support merged
in PR #31244 (2025-07-31). Core accepts `musig()` only inside `tr()`
— not `rawtr()` or `sp()` — per `doc/descriptors.md` (v31.1, July
2026).

## Security caveats

- **Concurrent sessions** — naive per-signer parallel sessions enable
  "Wagner-style" forge attacks. Solution in BIP327: nonce binding to
  message (the `b` coefficient).
- **State persistence** — nonces must be wiped after one use. Power
  loss between round 1 and round 2 → must restart with fresh nonces.
- **Hardware wallet support** — still thin as of September 2026. The
  Ledger Bitcoin app has shipped `musig()` key expressions since
  v2.4.0 (CHANGELOG 2025-03-07; GitHub release 2025-03-17): at most
  5 keys per `musig()`, at most 8 parallel signing sessions
  (persistent state is scarce), `musig()` allowed in `multi_a` but
  not `sortedmulti_a`, and only `musig(...)/**` or
  `musig(...)/<M;N>/*` — participants must be aggregated without
  further per-key derivation. v2.5.1 (CHANGELOG 2026-09-09) fixed
  `musig()` inside `multi_a` fragments. Coldcard is the opposite
  case: the Mk4 and Q1 board configs both set `NGU_INCL_MUSIG = 0`
  ("Exclude unused optional libngu secp256k1 features to save
  firmware space"), so MuSig is compiled out of the firmware
  entirely (as of September 2026). Either way a coordinator that
  speaks BIP373 PSBTs is required.

## Implementations

- `libsecp256k1` (`secp256k1_musig_*` — no `2` in the prefix).
  Mainline since v0.6.0 (2024-11-04) and built by default
  (`--enable-module-musig` is `[default=yes]`); not experimental.
  `secp256k1_musig_keyagg_cache` and `secp256k1_musig_session` still
  have no serialization/parsing functions as of v0.8.0 (2026-08-03),
  so signing state cannot be persisted across a process restart
  between round 1 and round 2.
- `rust-secp256k1` — the module is `musig`, not `musig2`
  (`secp256k1::musig`: `KeyAggCache`, `SecretNonce`/`PublicNonce`,
  `AggregatedNonce`, `Session`, `PartialSignature`,
  `AggregatedSignature`). Support was added in the 0.32 development
  series (CHANGELOG entry "0.32.0 - 2025-10-02", which also removed
  the `Secp256k1` context from the public API), but **no stable
  0.32.0 was ever published** — the three `0.32.0-beta.*` crates are
  yanked. The first stable release carrying MuSig2 is 0.33.0
  (2026-08-28); current stable is 0.33.1 (2026-08-29).
- **BDK has no MuSig2 support** as of September 2026. The blocker is
  `rust-miniscript`: PR #954 (*Add BIP390 `musig()` descriptor key
  expressions*) is still open, so `bdk_wallet` 3.1.0 (2026-06-14)
  cannot even parse `tr(musig(...))` — bdk-ffi pins that behaviour in
  a test literally named `cannotCreateMusigDescriptor`.

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
