# Commitment transaction structure

## Funding output spend

Commitment tx spends the 2-of-2 funding output. Each party holds
their version of the commitment; the two are NOT identical (asymmetric
reflection of perspective).

## Layout (anchor commitment, modern)

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

  to_local_anchor (330 sats):
    <local_funding_pk> OP_CHECKSIG
    OP_IFDUP OP_NOTIF
        OP_16 OP_CSV
    OP_ENDIF
    P2WSH.

  to_remote_anchor (330 sats):
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

## Anchor zero-fee variant (current default)

`option_anchors_zero_fee_htlc_tx`:
- Anchor outputs: 330 sats each.
- Both anchor outputs spendable by either party (with 16-block
  anyone-can-spend fallback).
- HTLC 2nd-stage txs are 0-fee with anchor for fee bumping.

This is the modern standard; pure `option_anchor_outputs` (legacy)
had different fee constraints.

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
