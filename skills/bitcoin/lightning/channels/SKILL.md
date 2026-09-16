---
name: lightning-channels
description: |
  Lightning channel mechanics: funding tx, commitment tx, anchor outputs,
  zero-fee commitments (v3/TRUC), to_local / to_remote outputs,
  dual-funded (v2), zero-conf, wumbo, taproot channels, splicing.
  Quick refs: state machine, commitment tx structure, force-close flow.
  USE WHEN: opening/closing channels, debugging force-closes, designing
  channel UX, evaluating anchor vs static-remote-key tradeoffs.
allowed-tools: Read, Grep, Glob
---

# Lightning Channels

> **Quick refs**: [state-machine.md](quick-ref/state-machine.md), [commitment-tx.md](quick-ref/commitment-tx.md), [force-close.md](quick-ref/force-close.md)

A Lightning channel is a 2-of-2 multisig output on chain that two
parties update off-chain via signed **commitment transactions**. Each
commitment is a fully-signed tx that, if broadcast, settles the channel
in one party's favour at the latest committed state.

## Channel lifecycle

1. **Open** — `open_channel` → `accept_channel` → on-chain funding tx
   → `funding_locked` (after `min_depth`).
2. **Update** — exchange `update_add_htlc` / `commitment_signed` /
   `revoke_and_ack` to flow funds.
3. **Close** — cooperative (`shutdown` + `closing_complete` /
   `closing_sig`, or legacy `closing_signed`) or unilateral
   (broadcast latest commitment).

## Funding tx

Two-party 2-of-2 multisig (legacy):
```
P2WSH(redeem = MULTI 2 <pk_init> <pk_resp> 2 CHECKMULTISIG)
```

Or Taproot key-aggregated (taproot channels):
```
P2TR(MuSig2(pk_init, pk_resp))
```

Funding tx flow:
- Initiator constructs funding tx, sends `funding_created` with
  outpoint.
- Responder signs initial commitment tx.
- Initiator broadcasts funding tx.
- Both wait `min_depth` confirmations, then `channel_ready`.

## Commitment tx (current state)

Each side holds the **latest** commitment they can broadcast. Outputs:

```
to_local      (this party's balance, with revocation OP_CSV delay)
to_remote     (other party's balance)
htlc_offered  (one per outgoing HTLC)
htlc_received (one per incoming HTLC)
to_local_anchor    (330 sats, `option_anchors` only)
to_remote_anchor   (330 sats, `option_anchors` only)
shared_anchor      (0-240 sats, `zero_fee_commitments` only)
```

Asymmetric: each party's commitment has its own `to_local` (with
revocation key) — the other side has the revocation secret.

## Static remote key (BOLT 9 bit 12)

Pre-BOLT static_remotekey: `to_remote` was rotated each commitment
update, requiring constant pubkey derivation. Post-BOLT:
- `to_remote` is a fixed pubkey for the lifetime of the channel.
- Simplifies on-chain recovery (always know your `to_remote` key).

## Anchor outputs — `option_anchors` (BOLT 9 bits 22/23)

The commitment type in general use as of September 2026 (it is what
LND and CLN open; neither source tree references the zero-fee type
below):
- Each party has a 330-sat `to_local_anchor` output spendable
  immediately by themselves and after 16 blocks by anyone.
- Allows CPFP fee bumping by spending the anchor.
- Channel-cost: 660 sats committed to anchors, recovered on close
  (or claimed by anyone after 16 blocks via the public path).
- Non-anchor outputs are CSV-locked: `to_remote` and both HTLC output
  types by 1 block, `to_local` by `to_self_delay` — so the anchor is
  the *only* output you can CPFP from. Funding the child needs an
  external on-chain UTXO.

Defeats some pre-anchor pinning attacks but introduced new
vulnerabilities (replacement cycling) addressed by TRUC v3.

## Zero-fee commitments — `zero_fee_commitments` (BOLT 9 bits 40/41)

Merged into the BOLT spec on 2026-05-04 (lightning/bolts PR #1228).
This channel type replaces the anchor + `update_fee` model rather
than tuning it:

- Commitment tx `version` is **3** (TRUC), so commitment + one child
  form a v3 package under TRUC's topology limits.
- `feerate_per_kw` is fixed at `0`. The base fee of the commitment tx,
  the HTLC-timeout tx and the HTLC-success tx MUST be 0. Fees come
  from the CPFP child (commitment) or from added inputs (HTLC txs).
- `update_fee` is never sent on such a channel. That removes feerate
  disagreement, the funder's fee reserve, and the force-closes caused
  by mempool feerate spikes.
- A single **`shared_anchor`** output replaces the two keyed anchors:
  the standard P2A script `OP_1 <0x4e73>`, spendable by anyone with an
  empty witness. Its amount is the sum of trimmed outputs plus
  rounded-down msat; below the 240-sat P2A dust limit that is allowed
  under Bitcoin Core's ephemeral-dust rule precisely because the
  parent pays no fee, and it may legitimately be 0 sat. Above 240
  sats the anchor caps at 240 and the remainder becomes a real mining
  fee — so "zero fee" is the common case, not an invariant.
- The 1-block CSV is scoped to `option_anchors`, so here `to_remote`
  is a plain P2WPKH. You can CPFP a *remote* commitment by spending
  your own main-balance or HTLC output — no external wallet UTXO.

Needs a relay path accepting v3/TRUC (standard since Bitcoin Core
v28.0) and ephemeral dust (standard since v29.0). Eclair v0.14.0
(2026-05-21) shipped the final form and bumped its Bitcoin Core
dependency to v30.x for exactly those policies; as of September 2026
`zero_fee_commitments` does not appear in the LND or CLN source
trees, so assume `option_anchors` when interoperating with them.

## Dual-funded (BOLT 2 v2)

Both parties contribute inputs to the funding tx → can have non-zero
balance for both sides at open time.

Messages:
- `open_channel2`, `accept_channel2`.
- `tx_add_input`, `tx_add_output`, `tx_remove_input`, `tx_complete`.
- `tx_signatures` to exchange final input signatures.

Use case: liquidity-providing services, side-by-side funding.

## Zero-conf channels (BOLT 9 bits 50/51)

Both parties agree to treat the channel as "open" before the funding
tx confirms. Uses `scid_alias` (BOLT 9 bits 46/47) to give the channel a
short channel ID before any block confirmation.

Use case: LSPs (JIT channel open during a payment).

Risk: if the funder doesn't publish the funding tx (or mempool drops
it), receiver loses HTLCs that flowed through.

## Wumbo (BOLT 9 bit 18)

Channels > 0.16777216 BTC (the legacy max from `option_support_large_channel`).
With wumbo, channels can be arbitrarily large (network-defined limits
remain).

## Taproot channels — `option_simple_taproot` (bits 80/81)

"Simple Taproot Channels":
- Funding output: P2TR with MuSig2-aggregated key.
- Commitment scripts: Tapscript leaves.
- Improvements: privacy (cooperative spends look like single-sig),
  smaller witness in cooperative case.

Fully cooperative spend = 1 input, 1 sig, key-path spend.

The bits live in the extension BOLT `bolt-simple-taproot.md` (merged
into lightning/bolts on 2026-05-04), **not** in BOLT 9 — 09-features.md
has no taproot row, and bits 56/57 are the *proposed* trampoline pair
(lightning/bolts#836, still open as of September 2026). The staging
pair `option_simple_taproot_staging` (180/181) is the pre-finalization
variant older deployments still speak.

`open_channel` for this type MUST NOT set `announce_channel`, so every
taproot channel is private until the taproot gossip extension lands
(lightning/bolts#1059, still an open draft as of September 2026).

## Splicing — `option_splice` (BOLT 9 bits 62/63)

Merged into BOLT 2 on 2026-03-23 (lightning/bolts PR #1160).

Modify channel capacity without closing/reopening:
- **Splice-in**: add liquidity from on-chain funds.
- **Splice-out**: withdraw to on-chain without closing.

Atomic: previous channel state continues with new funding output. The
channel must be quiescent (`stfu`, `option_quiesce` bits 34/35) before
`splice_init`, and only the quiescence initiator may send it.

Implementation status as of September 2026: CLN has splicing enabled
by default since v26.04 (2026-04-20), with `splicein` / `spliceout`
RPCs; LDK has supported it since rust-lightning 0.2 (2025-12-02), with
the production feature bit settled in 0.2.2 (2026-02-06); LND has no
splice RPC as of v0.21.3-beta (2026-09-02) — `lnrpc/lightning.proto`
on master carries no splice message and lnd#8245 is still open.

## Closing

### Cooperative — `option_simple_close` (BOLT 9 bits 60/61)

`shutdown` exchange with each side's `scriptpubkey`. Then each side
independently sends `closing_complete` (type 40) and gets back
`closing_sig` (type 41). No fee haggling: the closer picks
`fee_satoshis`, subtracts it from *its own* output, and the closee
just signs. Both directions run, so up to two signed close txs exist
and either can be broadcast. Sending a fresh `closing_complete`
overrides the previous one — that is how a coop close is RBF'd.

Final tx broadcast — single tx, no CSV delay, no anchors needed.

### Cooperative — legacy `closing_signed`

Only when `option_simple_close` is NOT negotiated. Iterative fee
negotiation: each side proposes `fee_satoshis` in `closing_signed`
until the two converge. BOLT 2 files this under "Legacy Closing
Negotiation" as of the `option_simple_close` merge (2025-02-12).

### Unilateral (force-close)

One party broadcasts their latest commitment. Counterparty must:
- Wait `to_self_delay` blocks before claiming `to_local`.
- Resolve any in-flight HTLCs via 2nd-stage HTLC txs.
- If counterparty cheats (broadcasts old commitment), use revocation
  key within `to_self_delay` to claim entire channel.

## Common bugs

- Closing a channel right after open before `min_depth` → expensive,
  lose anchor sats.
- Force-closing when cooperative would have worked → blockchain
  fees + delay.
- Not monitoring chain → missed cheating broadcast → counterparty
  steals channel.
- `option_anchors` channel without enough on-chain UTXOs to CPFP →
  fee-bumping impossible, commitment stuck at low rate. Not a problem
  on `zero_fee_commitments` channels, where your own unencumbered
  channel outputs can fund the child.
- Zero-conf channel with untrusted funder → loss of in-flight payments.

## See also

- [htlcs/SKILL.md](../htlcs/SKILL.md)
- [splicing/SKILL.md](../splicing/SKILL.md)
- [taproot-channels/SKILL.md](../taproot-channels/SKILL.md)
- [replacement-cycling/SKILL.md](../replacement-cycling/SKILL.md)
