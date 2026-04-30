---
name: lightning-watchtowers
description: |
  Watchtower architecture: encrypted breach blob storage, justice
  transactions, monitoring outsourced for offline channels. Eltoo
  proposal alternatives, BOLT 13 (proposed).
  USE WHEN: deploying a watchtower service, evaluating watchtower
  vendors, designing self-hosted monitoring.
allowed-tools: Read, Grep, Glob
---

# Watchtowers

A Lightning channel partner can cheat by broadcasting an old commitment
tx. To detect and revert, the honest party must broadcast a "justice
tx" within `to_self_delay` blocks. Watchtowers do this monitoring on
your behalf when you're offline.

## Threat model

Watchtower is **untrusted** for fund custody. It only learns:
- Channel txid (from `txid_prefix` you provide).
- Encrypted blob (the justice tx).

It does NOT learn:
- Channel balance.
- Counterparty identity.
- Payment activity.

If the watchtower colludes with the cheating party, it gains nothing
(it doesn't have funds; it only fails to broadcast → channel partner
might steal anyway).

## Protocol (BOLT 13 draft)

### Registration

Client → Watchtower:
```
session_request {
  features,
  ...
}
```

Watchtower replies with session ID + parameters.

### Update push

When client signs new commitment, sends to watchtower:
```
update {
  session_id,
  commitment_txid_hint (first 16 bytes of txid as identifier),
  encrypted_blob (sweep tx + revocation key, encrypted with hint as key),
}
```

Watchtower stores `(hint → blob)` mapping. Cannot decrypt without
seeing the actual commitment tx on chain.

### Monitoring

Watchtower watches the chain:
- For each block, scan all txs.
- For each tx in block, compute hint = first-16-bytes-of-txid.
- If hint matches a stored update, decrypt blob using full txid.
- Decrypt yields a justice tx; broadcast it.

### Justice tx

Pre-built sweep tx:
- Spends `to_local` of cheating commitment using revocation key.
- Spends each HTLC output similarly.
- Pays output to a client-specified address.

The watchtower fee model:
- Free for first N updates (Eclair / cheap).
- Per-update payment via LN (LN-watchtower setups).

## Implementations

### LND watchtower

LND has built-in client (`wtclient`) and tower (`watchtower`):
```bash
# Tower (your friend's node)
lncli tower info

# Client side: add tower
lncli wtclient add <pubkey>@<addr>:<port>
```

Tower fees configurable; small per-update.

### Eclair watchtower

Eclair has integrated watchtower; configurable via `eclair.conf`.

### Standalone services

- **Boltz Watchtower** — paid service.
- **Voltage Watchtower** — included with hosted plans.
- **The Eye of Satoshi** — open-source watchtower implementation.

## Eltoo (would-be replacement)

Eltoo (BIP118 dependency) replaces the punish-on-cheating model with
"latest-state-wins" semantics:
- No revocation; old commitments simply unable to be settled (override).
- Watchtowers no longer needed in the same way; replaced by
  "online check after `to_self_delay`".

Status: depends on SIGHASH_ANYPREVOUT (BIP118), not yet activated.

## Self-hosted vs outsourced

| Aspect | Self-hosted | Outsourced |
|--------|-------------|------------|
| Privacy | Best (no one else knows your channels) | Encrypted blobs hide details |
| Reliability | Single point of failure | Multiple towers possible |
| Cost | Server cost | Per-update fee |
| Trust | None | Privacy-leak risk if multiple hashers cluster you |

Best practice: subscribe to **multiple** watchtowers for redundancy.

## Common bugs

- Sending the justice tx blob unencrypted → watchtower learns
  channel state.
- Not retrying tower delivery on failure → missed updates.
- Watchtower with insufficient mempool watch → misses cheating
  broadcast.
- Delayed justice tx broadcast (post `to_self_delay`) → too late.
- Zero-conf channels: watchtower doesn't recognize the channel until
  funding tx confirms; gap in coverage.

## See also

- [channels/quick-ref/force-close.md](../channels/quick-ref/force-close.md)
- [channel-jamming/SKILL.md](../channel-jamming/SKILL.md)
- [replacement-cycling/SKILL.md](../replacement-cycling/SKILL.md)
