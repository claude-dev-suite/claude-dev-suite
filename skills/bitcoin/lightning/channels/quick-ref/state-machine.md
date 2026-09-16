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
  - update_fee (absent on `zero_fee_commitments` channels, which pin
    `feerate_per_kw` at 0)
```

Pending state:
- Each side has its current commitment + a pending commitment.
- After `commitment_signed` ↔ `revoke_and_ack` round trip, pending
  becomes current.

## Closing

```
ACTIVE → shutdown (mutual) → CLOSING
[CLOSING] → closing_complete / closing_sig → CLOSED (mutual)
              (option_simple_close, bits 60/61)
[CLOSING] → closing_signed → CLOSED (mutual)
              (legacy path, only when option_simple_close is absent)
[ANY] → counterparty broadcasts commitment → FORCE_CLOSED
```

Under `option_simple_close` CLOSING is not a convergence loop: each
side sends its own `closing_complete` and receives a `closing_sig`,
and the closer names the fee and pays it out of its own output.
Re-sending `closing_complete` overrides the previous one, which is how
a mutual close is RBF'd — LND exposes this as
`--protocol.rbf-coop-close`, extended to simple taproot channels in
v0.21.0 (2026-06-05).

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
ACTIVE → stfu (both directions) → QUIESCENT
[QUIESCENT] → splice_init / splice_ack → SPLICING
[SPLICING] → tx_add_input / tx_add_output / ... / tx_complete → SPLICING
[SPLICING] → commitment_signed / tx_signatures → SPLICED_PENDING
              (quiescence ends)
[SPLICED_PENDING] → stfu → QUIESCENT → tx_init_rbf / tx_ack_rbf
              → extra splice candidate
[SPLICED_PENDING] → splice_locked (both sides) → ACTIVE (with new capacity)
```

Quiescence is mandatory, not an optimisation: BOLT 2 requires a node
to not send `splice_init` unless the channel is quiescent, and only
the quiescence initiator (`option_quiesce`, bits 34/35, `stfu`) may
send it.

The channel is frozen only for the interactive-tx negotiation. Once
`tx_signatures` are exchanged, quiescence ends and payments resume —
but each HTLC must be valid against *every* pending splice candidate,
because each RBF attempt is its own splice tx with its own commitment
tx. An RBF attempt therefore re-enters quiescence with a fresh `stfu`:
BOLT 2 requires a node to not send `tx_init_rbf` unless the channel is
quiescent and it is that round's quiescence initiator (it need not be
the splice initiator). `splice_locked` carries the `splice_txid` of
the one that reached acceptable depth; the other candidates are
double-spent by it, since all of them spend the same current funding
output.

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
