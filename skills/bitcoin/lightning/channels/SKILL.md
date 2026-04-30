---
name: lightning-channels
description: |
  Lightning channel mechanics: funding tx, commitment tx, anchor outputs,
  to_local / to_remote outputs, dual-funded (v2), zero-conf, wumbo,
  taproot channels, splicing.
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
3. **Close** — cooperative (`shutdown` + `closing_signed`) or
   unilateral (broadcast latest commitment).

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
to_local_anchor    (330 sats, modern anchor format)
to_remote_anchor   (330 sats)
```

Asymmetric: each party's commitment has its own `to_local` (with
revocation key) — the other side has the revocation secret.

## Static remote key (BOLT 9 bit 12)

Pre-BOLT static_remotekey: `to_remote` was rotated each commitment
update, requiring constant pubkey derivation. Post-BOLT:
- `to_remote` is a fixed pubkey for the lifetime of the channel.
- Simplifies on-chain recovery (always know your `to_remote` key).

## Anchor outputs (BOLT 9 bit 20/21)

Modern anchor commitment:
- Each party has a 330-sat `to_local_anchor` output spendable
  immediately by themselves and after 16 blocks by anyone.
- Allows CPFP fee bumping by spending the anchor.
- Channel-cost: 660 sats committed to anchors, recovered on close
  (or claimed by anyone after 16 blocks via the public path).

Defeats some pre-anchor pinning attacks but introduced new
vulnerabilities (replacement cycling) addressed by TRUC v3.

## Dual-funded (BOLT 2 v2)

Both parties contribute inputs to the funding tx → can have non-zero
balance for both sides at open time.

Messages:
- `open_channel2`, `accept_channel2`.
- `tx_add_input`, `tx_add_output`, `tx_remove_input`, `tx_complete`.
- `tx_signatures` to exchange final input signatures.

Use case: liquidity-providing services, side-by-side funding.

## Zero-conf channels (BOLT 9 bit 38)

Both parties agree to treat the channel as "open" before the funding
tx confirms. Uses `scid_alias` (BOLT 9 bit 40) to give the channel a
short channel ID before any block confirmation.

Use case: LSPs (JIT channel open during a payment).

Risk: if the funder doesn't publish the funding tx (or mempool drops
it), receiver loses HTLCs that flowed through.

## Wumbo (BOLT 9 bit 18)

Channels > 0.16777216 BTC (the legacy max from `option_support_large_channel`).
With wumbo, channels can be arbitrarily large (network-defined limits
remain).

## Taproot channels (BOLT 9 bit 56)

"Simple Taproot Channels":
- Funding output: P2TR with MuSig2-aggregated key.
- Commitment scripts: Tapscript leaves.
- Improvements: privacy (cooperative spends look like single-sig),
  smaller witness in cooperative case.

Fully cooperative spend = 1 input, 1 sig, key-path spend.

## Splicing (BOLT 2 splice)

Modify channel capacity without closing/reopening:
- **Splice-in**: add liquidity from on-chain funds.
- **Splice-out**: withdraw to on-chain without closing.

Atomic: previous channel state continues with new funding output.

CLN ships splicing; LND has work-in-progress; LDK partial.

## Closing

### Cooperative

`shutdown` exchange with each side's `scriptpubkey`. Then `closing_signed`
exchange to negotiate fee. Final tx broadcast — single tx, no CSV
delay, no anchors needed.

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
- Anchor outputs without enough on-chain UTXOs to CPFP → fee-bumping
  impossible, commitment stuck at low rate.
- Zero-conf channel with untrusted funder → loss of in-flight payments.

## See also

- [htlcs/SKILL.md](../htlcs/SKILL.md)
- [splicing/SKILL.md](../splicing/SKILL.md)
- [taproot-channels/SKILL.md](../taproot-channels/SKILL.md)
- [replacement-cycling/SKILL.md](../replacement-cycling/SKILL.md)
