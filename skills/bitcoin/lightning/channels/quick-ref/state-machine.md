# Lightning channel state machine

## Pre-funding

```
[NONE] → open_channel → ACCEPTED
[ACCEPTED] → accept_channel → FUNDING_CREATED
[FUNDING_CREATED] → funding_signed → AWAITING_FUNDING
[AWAITING_FUNDING] → on-chain confirmation reached → ACTIVE
```

## Active phase

State diagram for HTLC operations:
```
ACTIVE
  - update_add_htlc / update_fulfill_htlc / update_fail_htlc (modify pending)
  - commitment_signed (other side signs new commitment)
  - revoke_and_ack (revoke previous commitment)
  - update_fee
```

Pending state:
- Each side has its current commitment + a pending commitment.
- After `commitment_signed` ↔ `revoke_and_ack` round trip, pending
  becomes current.

## Closing

```
ACTIVE → shutdown (mutual) → CLOSING
[CLOSING] → closing_signed → CLOSED (mutual)
[ANY] → counterparty broadcasts commitment → FORCE_CLOSED
```

## Reconnection / sync

After a peer disconnect, reconnect:
- `channel_reestablish` exchange recovers state.
- Both sides confirm their `next_local_commitment_number` and
  `next_remote_revocation_number`.
- One side may need to retransmit pending updates that didn't make it.

`option_data_loss_protect` enables recovery if one side lost data
(restored from backup): the other side can retransmit revocation
secrets necessary for the recovering side to claim funds, or trigger
a sweep.

## State numbers

- `local_commit_number` increments with each commitment update.
- Revocation secrets revealed retroactively (after the next commitment
  is signed).
- Per-commitment point: revocation key derived from this point.

## Funding-locked / channel_ready

Both sides exchange `funding_locked` (or `channel_ready` in newer
spec) after seeing `min_depth` confirmations. Until then, the channel
is "open but unusable".

For zero-conf:
- Funding-locked exchanged immediately based on trust.
- `scid_alias` provides usable short_channel_id pre-confirm.
- If funding tx never confirms, channel state must be torn down via
  `error` message.

## Splicing transitions

```
ACTIVE → splice_init / splice_ack → SPLICING
[SPLICING] → tx_add_input / tx_add_output / ... → SPLICED_PENDING
[SPLICED_PENDING] → confirmation → ACTIVE (with new capacity)
```

The pre-splice channel state continues to support payments during
splicing — payments rolled forward on confirmation.

## Force-close timeline

```
T = 0:        commitment broadcast (mempool)
T = ~10 min:  confirmed in block
T + to_self_delay: spending party can sweep to_local
T + to_self_delay: HTLC outputs become spendable per HTLC type
```

If counterparty cheated (old commitment), this party has from `T`
through `T + to_self_delay` to broadcast revocation transaction
claiming the entire channel.

## Common state bugs

- Failing to advance `next_local_commitment_number` post-revoke →
  protocol desync.
- Treating reconnect as fresh init (sending `init`) without
  `channel_reestablish` → peer disconnects.
- HTLC inflight at moment of reconnect not properly retransmitted →
  HTLC stuck, must wait CLTV expiry.
