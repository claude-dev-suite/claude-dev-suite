---
name: lightning-htlcs
description: |
  HTLC (Hash Time-Locked Contract) lifecycle: offered/received,
  fulfill via preimage, fail/timeout, 2nd-stage txs. Modern variant
  PTLCs (Point Time-Locked Contracts) with adaptor signatures.
  USE WHEN: implementing payment forwarding, debugging stuck HTLCs,
  reasoning about CLTV deltas in routes.
allowed-tools: Read, Grep, Glob
---

# HTLCs (Hash Time-Locked Contracts)

The atomicity primitive that makes Lightning routing work. An HTLC
is "claimable with preimage `r` such that hash(r) = H, OR refundable
after CLTV expires".

## Lifecycle

### Sender → first hop
```
Alice → Bob: update_add_htlc(amount, hash, cltv, onion)
```

The onion contains routing data for Bob to forward.

### Forward chain
Bob receives, peels onion, sees instructions to forward to Carol:
```
Bob → Carol: update_add_htlc(amount - bob_fee, hash, cltv - bob_delta, onion')
```

Continues until destination Dave (final hop, onion is empty payload).

### Settlement (cooperative)
Dave reveals preimage `r`:
```
Dave → Carol: update_fulfill_htlc(channel_id, htlc_id, r)
Carol → Bob:  update_fulfill_htlc(...)   (verifies hash(r) = H, propagates)
Bob → Alice:  update_fulfill_htlc(...)
```

Each hop earns its fee (held in the HTLC amount).

### Settlement (failed)
```
Carol → Bob: update_fail_htlc(channel_id, htlc_id, encrypted_failure)
Bob → Alice: update_fail_htlc(...)
```

Failure encryption uses ChaCha20 with onion shared secrets, hop-by-hop
(only Alice can decrypt the original failure).

### Settlement (force-close)
If a peer is unresponsive past timeout → force-close that channel,
HTLC resolved on chain.

## CLTV deltas

The HTLC has CLTV expiry. As the payment travels:
- Sender's HTLC has the highest CLTV.
- Each forwarder reduces CLTV by their `cltv_expiry_delta` parameter.
- Receiver's HTLC has the smallest CLTV.

This ordering ensures:
- Receiver claims at low CLTV.
- Forwarders have time to claim from upstream.
- If anything goes wrong, refunds happen in safe order.

Standard `cltv_expiry_delta`: 40-100 blocks per hop typically.

## HTLC scripts on chain (post force-close)

For an HTLC the channel partner offered to you:
```
hash160(payment_hash) OP_EQUALVERIFY <local_htlc_pk> OP_CHECKSIG
  OR
<cltv> OP_CHECKLOCKTIMEVERIFY OP_DROP <remote_htlc_pk> OP_CHECKSIG
  OR
<revocation_pubkey> OP_CHECKSIG
```

Three paths: success (preimage), timeout (CLTV), revocation (cheating
detection).

## 2nd-stage HTLC txs

After force-close, HTLC outputs aren't directly spendable — they go
through pre-signed 2nd-stage txs:

- **HTLC-success-tx**: spends HTLC output revealing preimage; output
  is `to_local`-style with CSV delay before claimable by you.
- **HTLC-timeout-tx**: spends HTLC output after CLTV; same CSV-delayed
  output.

This 2-stage structure is required for legacy commitment because
sigs are pre-committed at channel open (no flexibility post-broadcast).

## Anchor zero-fee variant

`option_anchors_zero_fee_htlc_tx`: HTLC 2nd-stage txs are 0-fee at
sign time, fee-bumped via the commitment's anchors when broadcast.

## PTLCs (Point Time-Locked Contracts)

Modern Schnorr/Taproot-based replacement for HTLCs:
- Instead of `hash(r) = H`, use `r * G = T` (Schnorr point).
- Use **adaptor signatures**: each hop holds a pre-signature
  conditional on revealing the secret.
- Privacy gain: each hop sees a different `T` (derived per-hop), so
  observers can't correlate hops by hash value.

Status: BOLT update in flight; implementations partial.

## In-flight HTLC limits

Channel-level limits (advertised in `accept_channel`):
- `max_accepted_htlcs` (default ~483).
- `max_htlc_value_in_flight_msat`.
- `dust_limit_satoshis`.

Excess HTLCs cause `update_add_htlc` to fail.

## "Stuck" HTLCs

Causes:
- Downstream node unresponsive (route stuck mid-forward).
- Mempool fee spike preventing on-chain resolution.
- Channel partner offline at force-close time.

Recovery:
- Watchtower or self-monitoring + force-close to reclaim funds.
- Standard fix: wait for CLTV expiry, force-close the upstream
  channel, recover via 2nd-stage timeout tx.

## Replacement cycling impact

HTLC-timeout txs are pre-signed at channel open. An attacker could
historically "pin" these via low-fee descendants → honest party can't
broadcast → CLTV passes upstream → loss.

Post TRUC v3 + ephemeral anchors: pinning surface removed.

## Common bugs

- CLTV delta too small → upstream HTLC times out before downstream
  resolves → forced refund and lost fees.
- Race condition: peer reveals preimage just before CLTV → both
  parties try to claim, possible loss.
- Misencoded onion failure → hop can't decrypt; routing data lost.
- Custom records (BOLT 4 TLV) incorrectly formatted → some impls
  reject HTLCs.

## See also

- [channels/SKILL.md](../channels/SKILL.md)
- [routing/SKILL.md](../routing/SKILL.md)
- [onion/SKILL.md](../onion/SKILL.md)
- [replacement-cycling/SKILL.md](../replacement-cycling/SKILL.md)
- [../../cryptography/adaptor-sigs/SKILL.md](../../cryptography/adaptor-sigs/SKILL.md)
