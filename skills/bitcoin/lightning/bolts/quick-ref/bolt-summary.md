# BOLT-by-BOLT summary

## BOLT 1 — Base Protocol

Wire framing:
```
[2 bytes]  type
[N bytes]  payload (TLV or fixed)
```

Common messages:
- `init` (16) — feature bits + chain hashes.
- `error` (17) — peer-level errors.
- `warning` (1) — non-fatal warning.
- `ping` (18) / `pong` (19).

Network byte order = big-endian throughout.

## BOLT 2 — Peer Protocol (channel mgmt)

Channel lifecycle messages:
- `open_channel` (32) — initiator → responder.
- `accept_channel` (33).
- `funding_created` (34) — funding tx outpoint.
- `funding_signed` (35) — initial commitment sig.
- `channel_ready` / `funding_locked` (36) — after `min_depth`.
- `update_add_htlc` (128) — add HTLC.
- `update_fulfill_htlc` (130) — claim HTLC with preimage.
- `update_fail_htlc` (131) — fail HTLC backward.
- `commitment_signed` (132).
- `revoke_and_ack` (133).
- `update_fee` (134).
- `closing_complete` (40) / `closing_sig` (41) — cooperative close under
  `option_simple_close`; each peer signs its own closing tx.
- `closing_signed` (39) — legacy cooperative close, used when
  `option_simple_close` is not negotiated (BOLT 2 "Legacy Closing
  Negotiation", as of September 2026).
- `shutdown` (38).

Dual-funded (v2):
- `open_channel2` (64), `accept_channel2` (65), tx-collaboration
  messages.

## BOLT 3 — Bitcoin Transaction Formats

- **Funding tx**: 2-of-2 multisig output (legacy) or
  P2TR-MuSig2-aggregated (taproot channels).
- **Commitment tx**: spends funding, has `to_local`, `to_remote`,
  HTLC outputs, and (post-anchor) `to_local_anchor`, `to_remote_anchor`.
- **HTLC tx**: 2nd-stage tx (HTLC-success / HTLC-timeout) for
  resolving HTLCs from a force-close.

Witness scripts and signature ordering exhaustively defined.

## BOLT 4 — Onion Routing

Sphinx packet:
```
[1 byte]    version (0x00)
[33 bytes]  ephemeral pubkey
[1300 bytes] hops_data (encrypted, MAC'd)
[32 bytes]  HMAC over the rest
```

Per-hop payload (TLV-formatted post-`var_onion_optin`):
- `amt_to_forward`
- `outgoing_cltv_value`
- `short_channel_id` (next hop)
- TLV extensions for trampoline, blinded paths, custom records.

## BOLT 5 — On-chain Handling

How nodes react to channel force-closes:
- Watch for commitment tx in mempool / chain.
- Sweep `to_local`, `to_remote` after CSV.
- Resolve HTLCs via 2nd-stage txs or directly per type.
- Detect counterparty cheating (old commitment broadcast) → use
  revocation key to claim entire channel.

## BOLT 7 — P2P Node and Channel Discovery

Gossip messages:
- `node_announcement` (257) — node addr, alias, color, features.
- `channel_announcement` (256) — public channel registration.
- `channel_update` (258) — fee policy, CLTV delta, enabled flag.

Sync via `gossip_queries` extension (BOLT 7 update): `query_channel_range`,
`reply_channel_range`, etc., to bootstrap and gossip incrementally.

## BOLT 8 — Encrypted Transport

Noise_XK handshake (3-message handshake) → 32-byte symmetric keys
per direction. Each message encrypted with ChaCha20-Poly1305, key
rotation every 1000 messages.

Connection: TCP/9735 default port, optional Tor.

## BOLT 9 — Feature Flags

Bit positions (selected, from BOLT 9 on lightning/bolts master,
September 2026):
| Bit | Name | Notes |
|-----|------|-------|
| 0/1 | `option_data_loss_protect` | ASSUMED; channel reestablish robustness |
| 4/5 | `option_upfront_shutdown_script` | Pre-commit close script |
| 6/7 | `gossip_queries` | Selective gossip sync |
| 8/9 | `var_onion_optin` | ASSUMED; TLV onion payload |
| 12/13 | `option_static_remotekey` | ASSUMED; stable to_remote |
| 14/15 | `payment_secret` | ASSUMED; MPP support prerequisite |
| 16/17 | `basic_mpp` | Multi-path payments |
| 18/19 | `option_support_large_channel` | Wumbo |
| 22/23 | `option_anchors` | Anchor commitment, zero-fee HTLC txs |
| 24/25 | `option_route_blinding` | BOLT 4 blinded paths |
| 26/27 | `option_shutdown_anysegwit` | Allow any-segwit close addr |
| 28/29 | `option_dual_fund` | Dual-funded |
| 36/37 | `option_attribution_data` | BOLT 4 attribution data |
| 40/41 | `zero_fee_commitments` | Zero-fee commitment/HTLC txs |
| 50/51 | `option_zeroconf` | Zero-conf channels |
| 60/61 | `option_simple_close` | Simplified closing negotiation |
| 62/63 | `option_splice` | Splicing |

Even bits = required; odd bits = optional. Feature must be supported
in matched pairs (init exchange compares).

This is an abridged view. [feature-bits.md](feature-bits.md) carries the
full registry, the bits defined outside `09-features.md` (simple taproot
channels at 80/81) and the non-spec bits implementations advertise anyway
(LND keysend at 54/55, proposed trampoline at 56/57). Note that legacy
`option_anchor_outputs` at 20/21 was deleted from BOLT 9 on 2024-05-20 and
those bits are retired, not reassigned.

## BOLT 11 — Invoice Format

```
ln<chain><amount><multiplier> 1 <timestamp> <tags...> <signature>
```

Bech32-encoded. `tags` use the type-data-length encoding; key tags:
- `p` (1) — payment_hash (32 bytes)
- `s` (16) — payment_secret (32 bytes, BOLT11 modern)
- `d` (13) — description
- `h` (23) — description_hash (for long descriptions)
- `n` (19) — destination pubkey
- `x` (6) — expiry seconds (default 3600)
- `c` (24) — min_final_cltv_expiry_delta
- `f` (9) — fallback on-chain address
- `r` (3) — routing hints (private channel info)

## BOLT 12 — Offers

Replaces BOLT11 for many use cases:
- **Offer**: reusable, signed; can be reused across many payments.
- **Invoice request**: payer asks for a fresh invoice.
- **Invoice**: payee responds with one-time invoice.

Uses TLV throughout, blinded paths for privacy, supports recurring
payments, multi-asset (with Taproot Assets layered on).

Encoded as `lno1...` bech32.
