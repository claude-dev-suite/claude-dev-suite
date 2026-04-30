---
name: lightning-routing
description: |
  Lightning pathfinding and routing: cost models, MPP / AMP / trampoline,
  blinded paths (BOLT 4 update), apriori probability, pickhardt-payments.
  USE WHEN: implementing/tuning a routing algorithm, debugging "no route"
  errors, evaluating pathfinding strategies.
allowed-tools: Read, Grep, Glob
---

# Lightning Routing

Lightning is a **source-routed** network: the sender computes the full
path through intermediaries and constructs the onion accordingly. Each
hop sees only its forwarding instructions, not the full route.

## Channel graph

Built from `channel_announcement` + `channel_update` gossip:
```
Edge {
  short_channel_id,
  node_a, node_b,
  capacity (from on-chain funding tx),
  per-direction:
    fee_base_msat,
    fee_proportional_millionths (PPM),
    cltv_expiry_delta,
    htlc_minimum_msat, htlc_maximum_msat,
    enabled flag,
}
```

Each edge has TWO directions, each with potentially different fees
and CLTV deltas.

## Cost function

Standard scoring (LND, CLN, LDK):
```
cost(edge, amount) =
    base_fee_msat
  + (proportional_millionths × amount) / 10^6
  + cltv_delta × cltv_factor
  + amount × probability_factor / 10^6 × ln(1 / p_success)
```

`p_success` (apriori probability of success) often defaults to 95% for
unknown edges, decreasing with recent failures.

Pathfinder: Dijkstra or Yen's k-shortest-paths over the cost function.

## Multi-Path Payments (MPP)

Split a payment across multiple paths; each part has the same payment
hash. Receiver claims when **all** parts arrive.

`payment_secret` (BOLT 11 's' tag) marks parts as belonging to one
payment.

`max_parts` typically 16 in LND, configurable. Smaller parts =
higher likelihood of finding routes; more onion overhead.

## Atomic Multi-Path (AMP)

Each "part" has a *different* payment hash, computed deterministically
from a shared secret + per-part nonce. Receiver computes secret from
any t-of-n parts (Shamir-like). Variant of MPP, less common in
production.

## Trampoline routing

Solves: pathfinding requires complete network gossip → mobile clients
can't keep up.

Mechanism:
- Sender constructs onion targeting **trampoline nodes**.
- Each trampoline does its own pathfinding to the next trampoline /
  destination.
- Sender doesn't need full graph; just knows about trampoline nodes.

CLN, LDK support; LND partial.

## Blinded paths (BOLT 4 update, BOLT12)

Receiver constructs a "blinded path" — a partial route that hides the
final destination. Sender's pathfinder routes to the blinded path's
**introduction node**, then onion delivers via blinded routing data.

Privacy benefit: sender doesn't learn receiver's node id.

## Pickhardt payments (probabilistic)

Research direction (Pickhardt-Nowostawski 2021):
- Treat routing as min-cost-flow problem.
- Cost incorporates probability of channel having sufficient
  liquidity at the moment.
- Optimization: maximize success probability under some fee budget.

CLN and LDK have implementations; experimental in production.

## CLTV calculation

For a 3-hop route Alice → Bob → Carol → Dave:
```
final_cltv = current_height + min_final_cltv_expiry_delta + payment_secret_buffer
carol_cltv = final_cltv + carol.cltv_expiry_delta
bob_cltv   = carol_cltv + bob.cltv_expiry_delta
alice_cltv = bob_cltv   + alice's_safety_margin
```

`alice_cltv` is what's set in Alice's first HTLC.

## Failure handling

When a hop fails:
- Returns `update_fail_htlc` with encrypted error message.
- Sender decrypts, learns:
  - Which hop failed.
  - Failure type (channel disabled, fee insufficient, expiry
    mismatch, no liquidity, etc.).
- Sender's pathfinder updates its scoring (decrease p_success on
  failed edge) and retries with different path.

## Common failure types (BOLT 4)

- `temporary_channel_failure` — try again later.
- `permanent_channel_failure` — drop this edge.
- `fee_insufficient` — your fee assumption was off; retry with more
  fee.
- `channel_disabled` — peer marked channel disabled, drop edge.
- `expiry_too_soon` / `incorrect_cltv_expiry` — CLTV mismatch.
- `incorrect_or_unknown_payment_details` — destination doesn't
  recognize this payment hash (BOLT 11 invoice expired or wrong).
- `final_incorrect_htlc_amount` — receiver doesn't recognize amount
  (MPP not assembled correctly).

## Implementations

| Algorithm | LND | CLN | LDK |
|-----------|-----|-----|-----|
| Dijkstra | yes | yes | yes |
| Multi-path (MPP) | yes | yes | yes |
| AMP keysend | yes | partial | yes |
| Trampoline | partial | yes | yes |
| Blinded paths | yes | yes | yes |
| Pickhardt-style | partial | yes | yes |

## Common bugs

- Hardcoding `cltv_factor` → routes prefer few-hop high-fee paths
  vs many-hop low-fee.
- Treating `htlc_maximum_msat = 0` as "infinite" → all routes
  rejected (it means "no max" only when set to channel capacity).
- Stale `channel_update` cached → routing through a channel that's
  been disabled an hour ago.
- Privacy: pathfinder leaking through timing attacks (test all hops
  but route only first part).

## See also

- [bolts/SKILL.md](../bolts/SKILL.md)
- [onion/SKILL.md](../onion/SKILL.md)
- [gossip/SKILL.md](../gossip/SKILL.md)
- [trampoline/SKILL.md](../trampoline/SKILL.md)
- [amp-mpp/SKILL.md](../amp-mpp/SKILL.md)
