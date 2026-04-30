# MuSig2 key aggregation

## Goal

Take n pubkeys and produce one aggregated pubkey `Q` such that:
1. `Q` is a normal Schnorr key (32-byte x-only).
2. The signing protocol with all n parties cooperating yields a sig
   verifiable against `Q`.
3. No proper subset of the n parties can forge a sig.
4. Indistinguishability — `Q` looks the same as a single-sig key.

## Algorithm (BIP327, KeyAgg)

```python
def key_agg(pubkeys: list[bytes32]) -> (bytes32, parity_q):
    L = bytes_concat(sorted(pubkeys))   # canonical: lex order
    pk_2 = second_unique(pubkeys)       # see "second" rule below

    coeffs = []
    aggregated = point_at_infinity()
    for pk in pubkeys:
        if pk == pk_2:
            a = 1                       # special case for first unique != most-frequent
        else:
            a = int(tagged_hash("KeyAgg coefficient", L + pk)) % n
        coeffs.append(a)
        aggregated = aggregated + a * lift_x(pk)

    return aggregated.x_bytes(), aggregated.has_even_y()
```

## "Second" rule

To save one hash computation in common cases, BIP327 sets `a = 1`
for the **second-most-frequent** pubkey (or equivalently the first
**unique** key after sorting). This optimization is mandatory — all
implementations must follow it for compatibility.

## Tagged-hash domains

- `KeyAgg list` — for the aggregated list hash if needed.
- `KeyAgg coefficient` — for individual coefficients.

## Sorting

Lexicographic byte order on the 32-byte x-only pubkeys.

## Canonical example

3 pubkeys `P1, P2, P3`. Order `P1 < P2 < P3` after sort.

```
L = P1 || P2 || P3   (96 bytes)
pk_2 = P2            (or whichever is the "second unique"; here P2)

a_1 = int(tagged_hash("KeyAgg coefficient", L || P1)) mod n
a_2 = 1
a_3 = int(tagged_hash("KeyAgg coefficient", L || P3)) mod n

Q = a_1*P1 + a_2*P2 + a_3*P3
```

Each signer's effective scalar is `a_i * d_i` (with parity flips).

## Parity flags

- `parity_q` = whether Q has even or odd y. Even-y is canonical (BIP340).
- During signing, if `parity_q == odd`, each signer flips their secret
  scalar sign before contributing partial sig.

## Tweak after aggregation

If using Taproot, apply the tweak to Q post-aggregation:

```python
Q_tweaked = Q + tap_tweak * G
where tap_tweak = tagged_hash("TapTweak", Q.x || merkle_root)
```

The MuSig2 SignContext maintains an "accumulated tweak" so signers
account for it during partial sig generation.

## Why this construction

- Defeats **rogue-key attack**: attacker can't pick `P_n` post-hoc to
  cancel the sum, because `a_i` depends on the canonical list of all
  keys.
- Defeats **Wagner-style sub-exponential attack**: the `b` coefficient
  in nonce aggregation (separately) prevents cross-session forgeries.
- The sorted-list canonical form means n parties produce the SAME `Q`
  regardless of who initiates. No "first signer privilege".

## Common bugs

- Sorting in the wrong order (signed vs unsigned bytes).
- Forgetting the "second" rule shortcut → produces a different Q
  than spec-compliant peers.
- Mixing aggregation and tweak order — must aggregate first, tweak
  second.
- Using compressed pubkey (33 bytes) in `L` instead of x-only (32) —
  will produce wrong Q.
