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

Merge dates below are commits on `lightning/bolts` master, read at repo
HEAD `1528972` (2026-08-26) in September 2026.

- **Anchor outputs** (BOLT-3 update, ~2020). Superseded: on 2024-05-20
  BOLT 9 deleted legacy `option_anchor_outputs` (20/21) and renamed the
  zero-fee-HTLC variant at 22/23 to `option_anchors`.
- **Dual-funded channels** (BOLT 2 v2, ~2022), feature 28/29.
- **option_simple_close** (60/61) — simplified closing negotiation via
  `closing_complete` / `closing_sig`, merged 2025-02-12.
- **Attribution data** (36/37) — BOLT 4 per-hop attribution on
  `update_fail_htlc` / `update_fulfill_htlc`, merged 2025-11-14;
  `fulfillment_payload` added 2026-07-27 (#1344) and return fields capped
  at 32 KiB 2026-08-26 (#1349).
- **Splicing** (62/63) — merged into BOLT 2/9 on 2026-03-23 (#1160), so
  it is now spec, not a proposal.
- **Zero-fee commitments** (40/41) — commitment and HTLC transactions
  with no fee, using v3/TRUC transactions and a shared anchor; merged
  2026-05-04 (#1228).
- **Simple taproot channels** (80/81) — merged 2026-05-04 as the
  extension BOLT `bolt-simple-taproot.md` (#995), outside the numbered
  BOLTs; a staging variant sits at 180/181.
- **BOLT 12 payer proofs** — merged 2026-07-27 (#1346), letting a payer
  prove after the fact that it paid a given offer.
- **option_onion_messages_only_channels** (66/67) — accept onion messages
  only from peers you have a channel with; merged 2026-07-27 (#1343).
- **BOLT12** (offers, blinded paths) — shipped by CLN (v26.06, 2026-06-02
  exposes `offer_id` on invoice notifications and a `createproof` RPC for
  BOLT 12 payer proofs). LND carries BOLT 12 code but its release notes
  through v0.21 announce no offers support as of September 2026.
- **Async payments** — an often-offline recipient publishes a BOLT 12
  *static invoice* (an offer-derived invoice with the payment hash
  deliberately omitted) with an always-online LSP acting as static
  invoice server; the payer reaches it over onion messages, and the
  sender's LSP holds the HTLC until the recipient wakes. No custodian and
  no long-lived HTLC parked across the route. LDK is the implementation:
  `ldk-node` v0.7.0 (2025-12-03) added serving and paying static
  invoices, and LDK's "Async Payments: Getting Paid While Your Node Is
  Offline" (2026-06-26) still labels it beta — the sender-side HTLC hold
  is unmerged and the flow is LDK-to-LDK only. It is unrelated to
  trampoline routing.

## Implementations and feature support

| Feature | LND | CLN | LDK | Eclair |
|---------|-----|-----|-----|--------|
| Static channels (legacy) | yes | yes | yes | no |
| Anchor commitment | yes | yes | yes | yes |
| Dual-funded | no | yes | partial | yes |
| MPP / AMP | yes | yes | yes | yes |
| Trampoline | no | no | partial | yes |
| BOLT12 offers | partial | yes | yes | yes |
| Taproot channels (80/81) | yes | no | no | yes |
| Splicing | no | yes | yes | yes |

(Status as of September 2026. Each column was read off the project's own
feature registry on master — `lnwire/features.go` (`lnd` v0.21.3-beta,
2026-09-02), `common/features.c` (CLN v26.06.7, 2026-08-28),
`lightning-types/src/features.rs` (rust-lightning v0.2.6, 2026-09-09) and
`Features.scala` (Eclair v0.14.3, 2026-09-14) — plus `ldk-node` v0.7.0 for
what LDK ships end to end. Notes on individual rows: `lnd` defines no
`option_dual_fund` (28/29) bit at all, so it has no dual funding, while
LDK gates its own behind `enable_dual_funded_channels`; Eclair v0.14.0
removed support for non-anchor channels; trampoline is still an unmerged
BOLTs proposal, PR #836 (bits 56/57), with rust-lightning defining
`Trampoline` at those bits and handling receives (#3670, merged
2025-03-28), Eclair advertising only its own pre-spec
`trampoline_payment_prototype` at 148/149, and neither `lnd` nor CLN
defining any trampoline bit; `lnd` v0.21.0 (2026-06-05) shipped
production simple taproot channels at bits 80/81 and describes splice
work as groundwork only — v0.21.3-beta defines no `option_splice`
(62/63) bit and exposes no splice RPC; CLN lists `OPT_SPLICE` (62) and
enabled splicing by default in v26.04 (2026-04-20) but has no taproot
option; rust-lightning has shipped splicing since v0.2 (2025-12-03),
with `SplicePrototype` realigned onto bit 63 in v0.2.2 (2026-02-06) to
match Eclair; LDK's only `Taproot` feature is bit 31 `option_taproot`,
not simple taproot channels. Check current docs for latest.)

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
