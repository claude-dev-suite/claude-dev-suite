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

## Protocol (BOLT 2 splice draft)

Messages:
- `splice_init` — proposing a splice.
- `splice_ack` — accepting.
- Then standard `tx_*` messages from BOLT 2 dual-funding (re-used):
  `tx_add_input`, `tx_add_output`, `tx_remove_*`, `tx_complete`.
- `tx_signatures` exchange.
- New commitment based on new funding output.

## Confirmation

After broadcast, both parties watch chain:
- Old commitment txs become **invalid** (they spend the now-spent
  funding output).
- Once new funding output has `min_depth` confirmations, the splice
  is "locked in".
- Pre-splice commitments are no longer valid; only new commitments.

During confirmation gap, both old and new states are conceptually
"live" — payments can flow through, but if the splice tx fails to
confirm (RBF'd / reorg'd / dropped), the channel reverts to pre-splice
commitments.

## Splice + Lightning at the same time

While splice tx is unconfirmed:
- Channel can still process HTLCs.
- New commitment txs are based on new funding outpoint.
- If the splice fails to confirm, in-flight payments must be
  reconciled via channel_reestablish.

## Implementation status (late 2025)

| Implementation | Splice |
|----------------|--------|
| CLN | Production support |
| Eclair | Production support |
| LND | Beta / experimental |
| LDK | Partial |

CLN's `splice` plugin / built-in command: `splicein-init`, `spliceout-init`.

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
