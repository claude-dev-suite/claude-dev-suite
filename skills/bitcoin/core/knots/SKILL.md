---
name: bitcoin-knots
description: |
  Bitcoin Knots: Luke Dashjr's Bitcoin Core fork with stricter mempool
  policy and additional configuration. Differences vs Core, when to
  consider, compatibility.
  USE WHEN: evaluating Knots for stricter mempool policy, reviewing a
  node deployment that uses Knots, understanding policy divergence
  between Core and Knots.
allowed-tools: Read, Grep, Glob
---

# Bitcoin Knots

Bitcoin Knots is a fork of Bitcoin Core maintained primarily by Luke
Dashjr. It applies a series of patches on top of each Core release,
typically focused on **mempool / standardness policy**, additional
options, and stricter defaults.

## Key differences from Core

### Mempool policy

- **Stricter standardness** for what can be relayed:
  - Larger `OP_RETURN` size limits configurable (Knots historically
    allowed disabling them; Core relaxes them in newer versions).
  - More aggressive filtering of inscriptions / non-standard tx
    patterns by default.
- **`-rejectparasites` and similar flags** to refuse to relay txs
  Luke considers spam (in particular Ordinals/inscriptions in some
  configurations).

### Additional options

Some options exist in Knots but not Core (e.g., specific spam-filter
heuristics, more granular feature toggles). Always cross-reference
the Knots docs for the version in use.

### Same consensus rules

Knots does **not** modify consensus. A Knots node validates the same
blockchain as a Core node. They diverge only at the **mempool** /
relay layer:
- A tx accepted by Core's mempool may be rejected by Knots and vice
  versa.
- A miner using Knots may exclude txs Core would have included, and
  produce blocks Core nodes still accept.

## When to consider Knots

| Use case | Knots? |
|----------|--------|
| Default Bitcoin node | No (use Core; ~95% of nodes do) |
| Strict spam filter at the relay layer | Yes (Knots' raison d'être) |
| Mining with custom policy | Maybe (Knots policy = your block content); coordination with mining pool needed |
| Lightning service | No (Core is the standard, better support) |
| Block explorer / indexer | No (Core has better tooling support) |

## Compatibility

- RPC: identical to Core (with some Knots-specific extensions).
- ZMQ: identical.
- File formats: identical (cookie, debug.log, wallet.dat, descriptors).
- P2P: identical (same protocol, same message types).

A Knots node in your network is indistinguishable from a Core node
to peers — only the mempool admission decisions differ.

## Releases

- Tagged based on Core releases: `vX.Y.Z.knots20YYMMDD`.
- Released after each Core minor version, with a delay of weeks-months.
- Backports of Core bugfixes are applied along with Knots-specific
  patches.

## Verification

Like Core, Knots ships signed releases. Verification process is the
same:
```bash
gpg --verify SHA256SUMS.asc
sha256sum -c SHA256SUMS
```

Luke Dashjr's GPG fingerprint is the primary signer.

## Common bugs / gotchas

- **Mempool divergence** confusing operators: a tx broadcast to a
  Knots node may not propagate if other peers are Core (they accept
  it but Knots peer's first hop drops it). Or vice versa.
- **Build options differ**; Knots build instructions diverge from
  Core in some cases.
- **Some features lag Core** in Knots due to maintainer bandwidth.

## Network share

As of 2024-2025, Knots runs on a small minority of nodes (single-digit
percent) but has visible presence due to its stronger mempool filtering
preferences.

## Status

Knots is a **maintained, active** Bitcoin implementation, not
abandonware. It's a niche choice — the mainstream is still Core.

## See also

- [release-engineering/SKILL.md](../release-engineering/SKILL.md)
- [operations/SKILL.md](../operations/SKILL.md)
- [../../metaprotocols/inscriptions/SKILL.md](../../metaprotocols/inscriptions/SKILL.md)
