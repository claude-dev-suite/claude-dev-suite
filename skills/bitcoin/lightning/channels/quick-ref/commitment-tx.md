# Commitment transaction structure

## Funding output spend

Commitment tx spends the 2-of-2 funding output. Each party holds
their version of the commitment; the two are NOT identical (asymmetric
reflection of perspective).

## Layout (`option_anchors` commitment)

```
inputs:
  funding_outpoint                         (signed by both parties)

outputs (in BIP69 sorted order):
  to_remote:
    OP_DUP OP_HASH160 <hash160(to_remote_pk)> OP_EQUALVERIFY OP_CHECKSIG
    OR for static_remotekey: simply <to_remote_pk> OP_CHECKSIG
    OR P2WPKH(to_remote_pk)

  to_local:
    OP_IF
        <revocation_pubkey> OP_CHECKSIG
    OP_ELSE
        <to_self_delay> OP_CHECKSEQUENCEVERIFY OP_DROP <local_delayedpk> OP_CHECKSIG
    OP_ENDIF
    Wrapped in P2WSH.

  to_local_anchor (330 sats, `option_anchors` only):
    <local_funding_pk> OP_CHECKSIG
    OP_IFDUP OP_NOTIF
        OP_16 OP_CSV
    OP_ENDIF
    P2WSH.

  to_remote_anchor (330 sats, `option_anchors` only):
    similar, with remote_funding_pk

  htlc_offered (per outgoing HTLC):
    OP_DUP OP_HASH160 <revocation_keyhash> OP_EQUAL
    OP_IF
        OP_CHECKSIG
    OP_ELSE
        <remote_htlc_pk> OP_SWAP OP_SIZE 32 OP_EQUAL
        OP_NOTIF
            OP_DROP 2 OP_SWAP <local_htlc_pk> 2 OP_CHECKMULTISIG
        OP_ELSE
            OP_HASH160 <RIPEMD160(payment_hash)> OP_EQUALVERIFY OP_CHECKSIG
        OP_ENDIF
    OP_ENDIF

  htlc_received (per incoming HTLC):
    similar with cltv_expiry branch

locktime: <lock_time, with low 24 bits as obscure factor>
sequence (input): obscured per BOLT 3
```

## Asymmetric commitments

Each side has their **own** commitment tx:
- Their `to_local` has *their* CSV delay; the other's `to_local` has
  *their* delay (could differ).
- The revocation pubkey is computed via the **counterparty's** per-commitment
  basepoint + a derivation.

Critical: when counterparty broadcasts old commitment, you (with
revocation secret) can claim everything.

## HTLC scripts

For HTLC offered (you sent payment to counterparty):
- **Revocation path**: counterparty had the revocation secret for
  this commitment number → claim immediately.
- **Success path**: counterparty has preimage → claim after revealing.
- **Timeout path** (you wait for): claim after CLTV expires via 2nd-stage
  HTLC-timeout tx.

For HTLC received (counterparty sent to you):
- **Revocation path**: same as above.
- **Success path** (yours): you have preimage → claim via 2nd-stage
  HTLC-success tx.
- **Timeout path**: counterparty claims after CLTV.

## 2nd-stage HTLC transactions

After commitment confirms, HTLC outputs are spendable via:
- `HTLC-success` tx — pre-signed by other side; spends with preimage.
- `HTLC-timeout` tx — pre-signed; spends after CLTV.

These have their own CSV delay before final claim.

## CLTV expiry order

```
peer_outgoing_HTLC.cltv > peer_incoming_HTLC.cltv + some_delta
```

Ensures upstream HTLC times out *after* downstream, so you have time
to claim if downstream succeeds.

## Anchor zero-fee-HTLC variant — `option_anchors` (bits 22/23)

`option_anchors` (historically `option_anchors_zero_fee_htlc_tx`):
- Anchor outputs: 330 sats each, one keyed to each party's funding
  key, with a 16-block anyone-can-spend fallback.
- HTLC 2nd-stage txs are 0-fee, bumped via the anchor.
- `to_remote` and both HTLC output types carry a 1-block CSV, so the
  anchor is the only CPFP handle and its child needs an external UTXO.

The commitment type in general use as of September 2026; pure
`option_anchor_outputs` (legacy) had different fee constraints.

## Zero-fee commitments — `zero_fee_commitments` (bits 40/41)

Merged 2026-05-04 (lightning/bolts PR #1228). Commitment tx version is
3 (TRUC) and `feerate_per_kw` is `0`, so the commitment and both
2nd-stage HTLC tx types have a base fee of 0. `update_fee` is not used
on such channels at all.

The two keyed anchors are replaced by a single `shared_anchor`:

```
  shared_anchor (0-240 sats, zero_fee_commitments only):
    OP_1 <0x4e73>              (standard P2A, no P2WSH wrapper)
    spent by anyone with an empty witness: <>
```

Amount rules (BOLT 3):
- Equals the sum of trimmed outputs plus millisatoshi amounts rounded
  down to satoshis. It may legitimately be 0 sat.
- Below the 240-sat P2A dust limit this is permitted by Bitcoin Core's
  ephemeral-dust rule, which applies because the parent pays no fee.
- If that sum exceeds 240 sats, the anchor is capped at 240 sats and
  the excess becomes an actual mining fee (not deducted from any
  commitment output). So the commitment is zero-fee in the common
  case, not unconditionally.

Because the 1-block CSV is scoped to `option_anchors`, `to_remote` is
a plain P2WPKH here and the HTLC outputs are unencumbered: you can
CPFP a remote commitment from your own channel outputs without an
external wallet UTXO. HTLC txs, being 0-fee, are bumped by adding
inputs rather than by an anchor.

Policy dependency: v3/TRUC and P2A are standard since Bitcoin Core
v28.0, ephemeral dust since v29.0. Eclair v0.14.0 (2026-05-21)
shipped the final form and moved its Bitcoin Core dependency to v30.x
for those policies. As of September 2026 the LND and CLN source trees
contain no `zero_fee_commitments` support.

## Obscured commitment number

Commitment number obscured into nLockTime + nSequence to prevent
chain analysts from counting state updates:
```
obscure_factor = SHA256(open_channel_pk_remote || open_channel_pk_local) low 48 bits
encoded = commit_num XOR obscure_factor
nLockTime  = 0x20000000 | (encoded & 0xFFFFFF)
nSequence  = 0x80000000 | ((encoded >> 24) & 0xFFFFFF)
```

## See also

- [state-machine.md](state-machine.md)
- [force-close.md](force-close.md)
- [../htlcs/SKILL.md](../../htlcs/SKILL.md)
