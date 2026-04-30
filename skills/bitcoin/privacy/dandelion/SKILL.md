---
name: bitcoin-privacy-dandelion
description: |
  Dandelion++ (BIP156): tx broadcast privacy. Stem phase (forward to
  one peer) → fluff phase (gossip to all). Hides origin IP.
  USE WHEN: evaluating tx-broadcast privacy, implementing Dandelion-
  aware relay logic.
allowed-tools: Read, Grep, Glob
---

# Dandelion++ (BIP156)

A tx broadcast privacy enhancement. Without Dandelion, tx broadcast
to all your peers immediately = first peer with chain analytics can
infer your IP.

## Mechanism

Two phases:

### Stem phase (anonymity)

When you create a new tx:
- With probability p (default 0.9), forward to **one** randomly
  selected peer (the "stem peer").
- That peer also forwards to one of their peers, with probability p.
- The "stem path" continues for ~3-10 hops on average (depends on p).

During stem, only the chain of forwarders sees the tx.

### Fluff phase (broadcast)

- With probability 1-p, the current stem peer "fluffs" — broadcasts
  to all its peers normally.
- From there, the tx propagates network-wide via standard gossip.

## Privacy benefit

- Original sender IP hidden among the stem hop pool.
- Chain analyst sees the tx first arrive from a "fluffer", not the
  origin.
- Coordinated chain-analytics nodes have to guess which fluff
  position was the source.

## Implementation status

- BIP156 proposed in 2018.
- **Not yet implemented in Bitcoin Core** as of late 2025.
- Some niche impls (Dandelion++ in btcd was experimental, removed).

## Why slow adoption

- Adds latency to broadcast (10-30 seconds typical).
- Requires coordinated stem peers; if attacker controls many peers,
  can defeat.
- Limited measured privacy gain (still some attribution possible
  via timing).

## Workarounds in production

Without Dandelion++, current best practice for broadcast privacy:
- **Broadcast over Tor** (`onlynet=onion`) — defeats IP correlation.
- **Use a relay service** (mempool.space "submit" via Tor).
- **Run your own node** — eliminates third-party attribution.

Tor-only setups achieve stronger broadcast privacy than Dandelion++
in practice.

## See also

- [tor/SKILL.md](../tor/SKILL.md)
- [../../protocol/p2p/SKILL.md](../../protocol/p2p/SKILL.md)
