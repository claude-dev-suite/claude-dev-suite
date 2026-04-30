---
name: lightning-trampoline
description: |
  Trampoline routing: outsource pathfinding to "trampoline" nodes
  for clients that lack full graph knowledge. Mobile-friendly. CLN
  and LDK lead implementation.
  USE WHEN: implementing trampoline-aware sender/receiver, evaluating
  trampoline vs full pathfinding.
allowed-tools: Read, Grep, Glob
---

# Trampoline Routing

Mobile / light Lightning clients can't sync the full ~50,000-channel
graph efficiently. Trampoline lets them target trampoline-capable
nodes, which then do their own pathfinding to the destination.

## Why

Pathfinding cost:
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

| Implementation | Trampoline send | Trampoline receive |
|----------------|-----------------|-------------------|
| LDK | yes | partial |
| CLN | yes | yes |
| LND | partial | partial |
| Eclair | yes | yes |
| Phoenix | yes (uses ACINQ trampoline) | yes |

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
