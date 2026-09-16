---
name: lightning-trampoline
description: |
  Trampoline routing: outsource pathfinding to "trampoline" nodes
  for clients that lack full graph knowledge. Mobile-friendly. Eclair
  (ACINQ/Phoenix) is the reference deployment; LDK receives and
  forwards; still unmerged as BOLTs PR #836 (September 2026).
  USE WHEN: implementing trampoline-aware sender/receiver, evaluating
  trampoline vs full pathfinding.
allowed-tools: Read, Grep, Glob
---

# Trampoline Routing

Mobile / light Lightning clients can't sync the full public channel
graph efficiently (~32,700 public channels, mempool.space, 30 August
2026). Trampoline lets them target trampoline-capable nodes, which
then do their own pathfinding to the destination.

## Why

Pathfinding cost, order of magnitude (public graph ~32,700 channels,
mempool.space, 30 August 2026):
- Full sync: 50-100 MB graph + ~30 minutes initial sync.
- Memory: 50-100 MB resident.
- Update bandwidth: continuous gossip rate.

For battery-constrained mobile, trampoline shifts this to a server.

## Mechanism

Sender constructs a 2-layer onion:
- **Outer onion**: routes to trampoline node, payload is opaque.
- **Inner onion (encrypted)**: contains target destination + amount.

When trampoline receives the outer-onion HTLC:
1. Decrypts inner payload → learns final destination + min CLTV.
2. Computes route from itself to destination using its full graph.
3. Builds a fresh outer-onion targeting that route.
4. Forwards.

Multi-trampoline: multiple trampoline hops each doing their own
pathfinding.

## Cost

Trampoline node charges:
- Forwarding fees on its segment.
- Optionally: a "service fee" for pathfinding (e.g., higher fee_base).

Sender selects trampolines based on offered service quality + cost.

## Onion structure

```
Sender's onion:
  hop 1: trampoline_A
    - Trampoline payload (BOLT 4 TLV with type 20 trampoline_onion):
      Embedded onion targeting trampoline_B or destination.
  hop 2: trampoline_B (if any)
  ...
```

Trampoline embedded onion carries the actual onion to the next
trampoline (or the final hop).

## Implementation status

Still not in the BOLTs: the spec lives in unmerged
[lightning/bolts#836](https://github.com/lightning/bolts/pull/836)
(`trampoline_onion_packet` TLV 20, feature bits 56/57), open since
January 2021 and still open as of September 2026. The earlier PR #654
("Trampoline Routing") was closed unmerged in 2021.

| Implementation | Trampoline send | Trampoline receive / relay | Feature bits |
|----------------|-----------------|----------------------------|--------------|
| Eclair | yes | yes (relays for Phoenix) | 148/149 prototype |
| Phoenix | yes (uses ACINQ trampoline) | yes | 148/149 prototype |
| Electrum | yes | yes (endpoint only) | 148/149 + own 150/151 |
| LDK | partial (see below) | yes (receive + forward) | 56/57 (spec PR) |
| CLN | no | no | bit 56 named only |
| LND | no | no | none |

Status as of September 2026 (Eclair v0.14.3, 14 Sep 2026; LDK v0.2.6,
9 Sep 2026, plus `main`):

- Eclair is the reference deployment, but on the *legacy* prototype
  bits 148/149 (`trampoline_payment_prototype`). Its `Features.scala`
  says outright that this version "does not match the latest spec PR"
  and that a parallel version lands once the spec is accepted.
- LDK implements the spec-PR bits 56/57; its feature docs describe
  them as "supports receiving and forwarding Trampoline payments".
  Router types (`TrampolineHop`, `BlindedTail::trampoline_hops`)
  exist, but LDK does not advertise trampoline *sending*.
- Electrum uses Eclair's 148/149 plus its own 150/151, because
  "Phoenix cannot do end-to-end multi-trampoline routes" (lnutil.py).
- CLN carries `option_trampoline_routing` only as a printable name for
  bit 56 in `common/features.c`; there is no `OPT_*` define and it
  advertises nothing. LND has no trampoline code at all.
- Consequence: the 148/149 family (Eclair / Phoenix / Electrum) and
  the 56/57 family (LDK) do not interoperate yet.

## Trampoline + MPP

Sender splits a payment into multiple parts; each part can route via
different trampolines. Receiver assembles by `payment_secret`.

## Use case

Phoenix wallet uses ACINQ as exclusive trampoline:
- Phoenix pays only ACINQ.
- ACINQ does all pathfinding to destinations.
- Simpler wallet code, slightly higher fees.

## Common bugs

- Trampoline node rejects (insufficient fee/CLTV) → retry with
  bumped values.
- Inner onion CLTV / amount mismatch with outer → onion processing
  fails.
- Trampoline doesn't support feature → falls back to direct
  pathfinding (which mobile may not have data for).

## See also

- [routing/SKILL.md](../routing/SKILL.md)
- [onion/SKILL.md](../onion/SKILL.md)
- [bolts/SKILL.md](../bolts/SKILL.md)
