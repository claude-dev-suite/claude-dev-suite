---
name: lightning-bolts
description: |
  BOLT (Basis of Lightning Technology) specification index. Wire format,
  channel management, onion routing, gossip, invoices, feature bits.
  Quick refs: BOLT-by-BOLT summary, message-type tables, feature-bit
  registry.
  USE WHEN: implementing/reading Lightning protocol, looking up message
  types, debugging interop between implementations.
allowed-tools: Read, Grep, Glob
---

# Lightning BOLTs

> **Quick refs**: [bolt-summary.md](quick-ref/bolt-summary.md), [feature-bits.md](quick-ref/feature-bits.md)

The Lightning Network's specs live in `github.com/lightning/bolts`.
There are 11 numbered BOLTs plus several "BLIPs" (BOLT improvement
proposals) for in-progress extensions.

## BOLT Index

| BOLT | Title |
|------|-------|
| 1 | Base Protocol — wire format, init, ping, error |
| 2 | Peer Protocol — channel open/close/update |
| 3 | Bitcoin Transaction and Script Formats — funding, commitment, HTLC, anchor |
| 4 | Onion Routing Protocol — Sphinx packet, payment forwarding |
| 5 | Recommendations for On-chain Transaction Handling |
| 7 | P2P Node and Channel Discovery — gossip |
| 8 | Encrypted and Authenticated Transport — Noise XK handshake |
| 9 | Assigned Feature Flags — feature bit registry |
| 10 | DNS Bootstrap and Assisted Node Location (deprecated) |
| 11 | Invoice Protocol — BOLT11 |
| 12 | Flexible Protocol for Lightning Payments — BOLT12 offers |

## Concepts spread across BOLTs

- **Channels** (BOLT 2/3): two-party state channel with on-chain
  funding output spent into a sequence of off-chain commitment txs.
- **HTLCs** (BOLT 2/3/4): hash-time-locked contracts route payments
  across multiple channels atomically.
- **Onion routing** (BOLT 4): Sphinx-style; each hop sees only the
  next hop, not source / destination.
- **Gossip** (BOLT 7): nodes announce themselves and channels;
  pathfinders use this graph.
- **Wire encryption** (BOLT 8): Noise_XK handshake; ChaCha20-Poly1305
  per-message.

## Versioning

Lightning's wire protocol is **append-only** with **feature bits**:
- Init message exchanges feature bits.
- New features negotiated, not breaking changes.
- Implementations must gracefully degrade for unknown bits.

## Major recent additions

- **Anchor outputs** (BOLT-3 update, ~2020).
- **Dual-funded channels** (BOLT 2 v2, ~2022).
- **Splicing** (BOLT 2 splice, partial deployment 2024-2025).
- **Taproot channels** ("simple-taproot-chans", proposal/early
  deployment).
- **BOLT12** (offers, blinded paths) — adopted by CLN; LND in
  progress.
- **Async payments** — partial deployment via "trampoline-light" and
  similar.

## Implementations and feature support

| Feature | LND | CLN | LDK | Eclair |
|---------|-----|-----|-----|--------|
| Static channels (legacy) | yes | yes | yes | yes |
| Anchor commitment | yes | yes | yes | yes |
| Dual-funded | partial | yes | partial | yes |
| MPP / AMP | yes | yes | yes | yes |
| Trampoline | partial | yes | yes | yes |
| BOLT12 offers | partial | yes | yes | yes |
| Taproot channels | partial | partial | partial | partial |
| Splicing | partial | yes | partial | yes |

(Status as of late 2025; check current docs for latest.)

## Test vectors

Lightning has test vector files (`bolt03-tx-test-vectors.json`,
`bolt04-onion-test-vectors.json`, etc.) that all impls verify
against. Used as part of CI.

## Reading order

For new implementers:
1. BOLT 1 — message framing.
2. BOLT 8 — encryption.
3. BOLT 2 — channel state machine.
4. BOLT 3 — funding, commitment, HTLC scripts.
5. BOLT 4 — onion routing.
6. BOLT 7 — gossip.
7. BOLT 11 / 12 — invoices / offers.

## See also

- [channels/SKILL.md](../channels/SKILL.md)
- [htlcs/SKILL.md](../htlcs/SKILL.md)
- [routing/SKILL.md](../routing/SKILL.md)
- [onion/SKILL.md](../onion/SKILL.md)
