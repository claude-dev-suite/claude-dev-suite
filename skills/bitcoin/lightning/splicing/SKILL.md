---
name: lightning-splicing
description: |
  Channel splicing: splice-in (adding capacity) and splice-out
  (withdrawing) without closing the channel. Replaces "close and
  reopen" with one splice tx.
  USE WHEN: increasing/decreasing channel capacity in production,
  designing dynamic-balance LSP integrations, planning channel
  lifecycle.
allowed-tools: Read, Grep, Glob
---

# Lightning Splicing

Splicing modifies a channel's funding tx (and capacity) **without**
closing the channel. Atomic: previous channel state continues with
new funding output.

Pre-splicing, capacity changes meant close + reopen, costing two
on-chain txs and disrupting payment flow.

## Mechanics

A splice transaction:
- Spends the **current** channel's funding output.
- Adds new inputs (splice-in) or outputs (splice-out).
- Creates a new funding output with updated capacity.
- Both parties sign.

Channel state continues: existing HTLCs, balances, fees all remain.
After confirmation, the **new** funding output becomes the channel's
anchor, and the next commitment uses the new total.

## Splice-in (adding liquidity)

```
inputs:
  funding_output (old)             # previous channel funding
  external_input_1, ..., external_input_n   # new BTC from on-chain wallet

outputs:
  funding_output_new (capacity = old + added)
  change (any leftover from external inputs)
```

Use case: top up a channel that's nearly empty without disrupting
ongoing payments.

## Splice-out (withdrawing)

```
inputs:
  funding_output (old)

outputs:
  funding_output_new (capacity = old - withdrawn)
  withdrawal_output (your on-chain address)
```

Use case: reduce channel capacity, get on-chain funds without closing.

## Combined splice

```
inputs:
  funding_output (old)
  add_1, ..., add_n

outputs:
  funding_output_new
  withdrawal_1, ..., withdrawal_m
  change
```

Both directions in one tx.

## Protocol (BOLT 2 channel splicing, feature 62/63)

Splicing left draft status when "Channel Splicing (feature 62/63)"
(lightning/bolts PR #1160) was merged on 2026-03-23. BOLT 9 now lists
`option_splice` at feature bits **62/63**; BOLT 2 has a "Channel Splicing"
section.

**Prerequisite: quiescence.** A splice may only begin once the channel is
quiescent (`option_quiesce`, bits 34/35, the `stfu` message), and only the
quiescence initiator may send `splice_init`. The channel leaves quiescence
as soon as `tx_signatures` have been exchanged — it does *not* stay
quiescent while the splice tx waits to confirm.

Messages:
- `splice_init` (type 80) — proposing a splice; carries
  `funding_contribution_satoshis` (negative for splice-out) and
  `funding_feerate_perkw`.
- `splice_ack` (type 81) — accepting, with the peer's own
  `funding_contribution_satoshis`.
- Then standard `tx_*` messages from BOLT 2 interactive-tx (re-used):
  `tx_add_input`, `tx_add_output`, `tx_remove_*`, `tx_complete`, `tx_abort`.
- `commit_sig`, then `tx_signatures` exchange.
- `splice_locked` (type 77) — carries the `splice_txid` that reached
  acceptable depth.

The splice initiator is responsible for adding the current funding output as
an input and the new funding output as an output; both sides may contribute
further inputs and outputs during the interactive-tx session.

## Confirmation

After `tx_signatures`, the channel resumes normal operation while the splice
transaction is unconfirmed. Several splice transactions can be pending at
once:

- Splice txs are RBF-able via `tx_init_rbf` / `tx_ack_rbf`, but an RBF
  attempt is not itself normal operation: the channel must be quiesced
  again first, and `tx_init_rbf` may only be sent by the quiescence
  initiator of *that* round. That initiator need not be the splice
  initiator — that is the sense in which **either** node may RBF. An RBF
  attempt may also set a different `funding_output_contribution` (the
  `tx_init_rbf` / `tx_ack_rbf` TLV superseding `splice_init`'s
  `funding_contribution_satoshis`), so it is not purely a feerate bump:
  it is an opportunity to splice more funds in or out without waiting for
  the first attempt to confirm.
- RBF is forbidden by the spec once `option_zeroconf` has been negotiated.
  Every attempt spends the same funding output, so attempts automatically
  double-spend each other, which risks losing funds at 0-conf. CPFP with
  another splice instead.
- Each attempt is a *candidate*. Nodes keep one commitment transaction per
  candidate funding tx — the pre-splice funding tx plus every splice
  attempt — and exchange `commitment_signed` for all of them. Payments
  must be valid against every candidate.
- Once any candidate reaches acceptable depth, both sides send
  `splice_locked` with that `splice_txid`. On matching txids the other
  candidates and their ancestors may be discarded, and
  `announcement_signatures` are re-sent with the `short_channel_id` of the
  locked tx.
- If the two `splice_locked` messages name different candidates (the peers
  are on different forks), the spec's recommendation is to ignore the
  message and wait for one fork to replace the other, rather than failing
  the channel.

If every splice candidate is evicted or reorged out, the channel simply
continues on the pre-splice funding output and its commitment.

## Splice + Lightning at the same time

While splice tx is unconfirmed:
- Channel can still process HTLCs.
- Commitment txs are maintained for every pending candidate funding
  outpoint, and signed in parallel.
- If the splice fails to confirm, in-flight payments must be
  reconciled via channel_reestablish (its `next_funding` field names
  which candidate the signatures belong to).

## Implementation status (September 2026)

| Implementation | Splice |
|----------------|--------|
| CLN | Enabled **by default** since v26.04 (2026-04-20) |
| Eclair | Final BOLT version since v0.14.0 (2026-05-21) |
| LDK | Supported since rust-lightning 0.2 (2025-12-02); experimental in ldk-node v0.7.0 (2025-12-03) |
| LND | Not supported as of v0.21.3-beta (September 2026) |

- **CLN**: high-level `splicein` / `spliceout` RPCs, both added in v26.04;
  `spliceout` can "cross-splice" by naming a second channel as the
  destination. The low-level `splice_init` / `splice_update` /
  `splice_signed` trio is still there underneath.
- **Eclair**: `splicein`, `spliceout`, plus `rbfsplice` to fee-bump a
  pending splice (subject to the spec's 0-conf RBF ban above). v0.14.0
  removed the pre-standardization prototype splicing from v0.9.0, so
  prototype-era peers must upgrade.
- **LDK**: outbound splices via `ChannelManager::splice_channel`; inbound
  splices gated on `UserConfig::reject_inbound_splices`. rust-lightning
  0.2.2 (2026-02-06) repointed its `SplicePrototype` flag from bit 155 to
  bit 63, resolving a clash with the flag Eclair used for its prototype.
- **LND**: no splice RPC as of v0.21.3-beta (2026-09-02); issue #8245 is
  still open. The production taproot-channel work in v0.21.0
  (funding-txid-keyed nonce maps in `channel_reestablish` /
  `revoke_and_ack`) is described in its release notes as laying the
  groundwork for splice support.

## Use cases

- **LSP dynamic capacity**: LSP splices in liquidity to a customer
  channel on demand without closing.
- **Lightning Loop alternatives**: splice-out instead of submarine
  swap.
- **Liquidity rebalance** between two parties without on-chain
  disruption.

## Common bugs

- Mismatched fee assumptions for splice tx → tx stuck in mempool,
  channel can't reconcile.
- Failing to handle RBF on the splice tx → both parties confused
  about which output is "current".
- HTLC in flight at splice time and the splice tx is dropped →
  HTLC may need retry once reconciliation completes.
- Mempool eviction of splice tx → both sides hold pre-splice
  commitments; old state continues until splice retried.

## See also

- [channels/SKILL.md](../channels/SKILL.md)
- [bolts/SKILL.md](../bolts/SKILL.md)
