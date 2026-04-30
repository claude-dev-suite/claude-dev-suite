---
name: bitcoin-adaptor-sigs
description: |
  Adaptor signatures: pre-signature paired with a "secret" such that
  publishing a valid signature reveals the secret, and vice versa.
  Foundational for atomic swaps, scriptless scripts, DLCs, Submarine
  Swaps trustless variants, PTLCs (Point Time-Locked Contracts).
  USE WHEN: designing atomic swaps, evaluating PTLCs vs HTLCs,
  building DLCs, understanding scriptless scripts.
allowed-tools: Read, Grep, Glob
---

# Adaptor Signatures

An adaptor signature is a **modification** of a Schnorr signing
protocol: instead of producing a complete signature, the signer
produces a **pre-signature** that is invalid on its own but becomes
valid once **adapted** with a secret value `t`.

Two key properties:
1. **Witness extractability** — given a complete sig and the
   pre-signature, anyone can compute `t`.
2. **Atomicity** — observing one side of a swap reveals the secret
   needed for the other side.

## Schnorr-based adaptor (BIP340)

Standard Schnorr sig:
```
e = challenge(R, P, m)
s = k + e*d   (where R = k*G)
```

Adaptor variant with adaptor point `T = t*G`:
```
s' = k + e*d           ← same as normal s
σ  = (R, s')           ← pre-signature
```

But the verifier checks against `(R + T)`, not `R`. So `σ` alone fails
verification. To complete:
```
s = s' + t mod n
```

Now `(R + T, s)` verifies as a normal Schnorr sig under public key `P`.

## Properties used

- **Pre-sig verify** — anyone can check that `σ` is "valid except for
  T" by checking `s'*G - e*P == R`.
- **Adapt** — with `t`, anyone can compute `s = s' + t`.
- **Extract** — with both `σ` and `s`, compute `t = s - s'`.

## Scriptless atomic swap

Two parties Alice (BTC) and Bob (LTC) want to swap.

```
Alice creates Tx_A (BTC for Bob), with Alice's signature σ_A as adaptor
  with adaptor point T = t*G (t known only to Alice)
  σ_A: pre-sig — Bob CAN'T spend yet (verifier expects sig over R+T, not R)

Bob creates Tx_B (LTC for Alice), with Bob's signature σ_B as adaptor
  with the SAME adaptor point T

Alice publishes Tx_B by adapting σ_B with t (Alice can do this because
  she knows t)
  → publishing reveals s_B = σ_B + t
  → Bob extracts t = s_B - σ_B (he sees Tx_B on chain)

Bob now adapts σ_A with t to spend Tx_A
```

Both txs publish or neither. **No HTLC, no script, no preimage**. Just
two adaptor sigs over the same secret.

## PTLC (Point Time-Locked Contract)

Lightning's HTLC = "Hash Time-Locked Contract" — locks fund release
on revealing a preimage `r` such that `hash(r) = H`.

PTLC = "Point Time-Locked Contract" — locks fund release on revealing
a scalar `t` such that `t*G = T`. Same atomic guarantees, but:
- **Better privacy**: each hop in a routed payment uses a different `T`
  (derived per-hop), defeating cross-hop correlation.
- **Smaller** on chain — no preimage in script, just an adaptor sig.
- **Compatible with Schnorr** — needs Taproot adoption.

PTLC requires LN-spec updates (BOLT-PTLC drafts in flight).

## DLC (Discreet Log Contract) integration

DLC oracles publish nonce commitments. Bettors construct adaptor sigs
that adapt under specific oracle outcomes:

```
Oracle nonces: R_oracle for upcoming event, will publish (s_outcome, R_oracle)
  where s_outcome = k_oracle + e_outcome * d_oracle

Bettor pre-signs CET (Contract Execution Tx) with adaptor point
  T_outcome = R_oracle + (e_outcome * P_oracle)

When oracle publishes s_outcome for the actual outcome:
  bettor extracts t_outcome = s_outcome
  adapts pre-sig → publishes CET
```

## Other applications

- **Submarine swaps** (LN ↔ on-chain) trustless variants.
- **Cross-chain atomic swaps** without HTLC.
- **Coin-mixing** with PTLC for privacy.
- **Threshold escrow** — n-of-m parties can adapt with their share of `t`.

## Implementations

- `secp256k1-zkp` (Blockstream's libsecp256k1 fork) — has adaptor
  sig module.
- `rust-bitcoin/adaptor-sig` crates.
- DLC: `rust-dlc`, `dlc-rs` from Crypto Garage / DLC.dev.
- Some Lightning impls' `PTLC` branches (LDK research, not mainnet).

## Security caveats

- **Choice of `t`** must be uniformly random in [1, n-1].
- **Reuse of adaptor point** across protocols → cross-protocol leak.
- **Atomic timing**: while atomicity is guaranteed, **timing windows**
  matter: refund paths must give honest party time to react.
- **Fair-exchange impossibility** is sidestepped because adaptor sig
  embeds the unforgeable signing operation.

## Common bugs

- Forgetting parity flip when computing `R + T` (Schnorr's even-y
  rule applies to the resulting point).
- Storing `t` in plaintext between adapt and reveal phases.
- Failing to verify pre-signature before relying on it (someone
  could give you a completely random pre-sig that won't adapt).

## See also

- [schnorr/SKILL.md](../schnorr/SKILL.md)
- [dlcs/SKILL.md](../dlcs/SKILL.md)
- [../../privacy/atomic-swaps/SKILL.md](../../privacy/atomic-swaps/SKILL.md)
- [../../lightning/submarine-swaps/SKILL.md](../../lightning/submarine-swaps/SKILL.md)
