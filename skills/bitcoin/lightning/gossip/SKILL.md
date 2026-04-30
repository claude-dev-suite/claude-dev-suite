---
name: lightning-gossip
description: |
  BOLT 7 gossip: node_announcement, channel_announcement, channel_update.
  Sync via gossip_queries, channel range queries, gossip rate limiting,
  pruning stale announcements.
  USE WHEN: implementing/debugging gossip sync, managing graph storage,
  designing rate limits.
allowed-tools: Read, Grep, Glob
---

# Lightning Gossip (BOLT 7)

LN nodes gossip about themselves and channels so the network can
build a routing graph. Each node maintains a local copy.

## Messages

### `channel_announcement` (256)

Announces a public channel between two nodes:
```
{
  features,
  chain_hash,
  short_channel_id (block × tx-index × output-index),
  node_id_1, node_id_2,
  bitcoin_key_1, bitcoin_key_2,
  node_signature_1, node_signature_2,        # signed by node keys
  bitcoin_signature_1, bitcoin_signature_2,  # signed by funding keys
}
```

Bitcoin signatures prove ownership of the funding outpoint. Without
those, anyone could forge announcements.

### `node_announcement` (257)

Node metadata:
```
{
  signature,                  # by node_id
  features, timestamp,
  node_id,
  rgb_color, alias,
  addresses (IPv4, IPv6, Tor v3, etc.),
  TLV (extras),
}
```

Newer timestamps replace older for same node_id.

### `channel_update` (258)

Per-direction routing policy:
```
{
  signature,
  chain_hash, short_channel_id,
  timestamp, message_flags, channel_flags,  # incl. enabled bit
  cltv_expiry_delta,
  htlc_minimum_msat,
  fee_base_msat, fee_proportional_millionths,
  htlc_maximum_msat,
}
```

Two `channel_update`s per channel (one per direction). Latest timestamp
wins; older replaced.

## Validation

For `channel_announcement`:
- Verify both node sigs and both Bitcoin sigs.
- Verify the funding output exists at the specified SCID and matches
  the declared 2-of-2 multisig of bitcoin_keys.
- For Taproot channels: verify Taproot output matches.

For `channel_update`:
- Verify signature.
- Verify timestamp > previous for this direction.

For `node_announcement`:
- Verify signature.
- Verify timestamp > previous.

Failed validation → drop, possibly disconnect peer if many bad
messages.

## Sync strategies

### Initial sync

When connecting to a new peer:
- `gossip_queries` (feature bit 6/7) enables on-demand sync.
- Without it, peer dumps all gossip (slow, fragile).

### `query_channel_range`

```
{
  chain_hash,
  first_blocknum,
  number_of_blocks,
  query_options TLV (with checksums for incremental update),
}
```

Peer responds with `reply_channel_range` listing SCIDs (and optionally
checksums) in that range.

### `query_short_channel_ids`

Request the actual `channel_announcement` + `channel_update`s for
specific SCIDs.

### Incremental updates

Peers gossip in real-time:
- New `channel_announcement` → flood (one hop, then forward to all).
- `channel_update` updates → similar.
- `node_announcement` → similar.

Rate-limited per IP / connection to prevent spam.

## Pruning

Channels with no `channel_update` for ~14 days are considered stale
and dropped from local graph.

Closed channels (funding output spent) detected via:
- Watching the chain (each node monitors funding outpoints).
- Receiving an explicit `channel_update` with disabled flag.

Full prune: when funding output is spent on chain, drop the channel
edge.

## Large-graph performance

LN graph as of late 2025: ~12,000 public nodes, ~50,000 public
channels. Storage: ~50-100 MB.

Periodic full re-gossip on cold start can be 5-30 minutes depending
on peer count and bandwidth. Caching the graph locally + diff sync
(via `query_channel_range` checksums) is essential.

## Rate limiting

Per BOLT 7 recommendations:
- Max 1 `channel_update` per direction per channel per second.
- Stale flood detection: drop messages with timestamps too old.
- Per-peer message rate limit (varies by impl).

## Privacy

Gossip is fully public:
- Anyone can build the graph.
- Channel capacities revealed via on-chain funding outputs.
- Some data leaks about node identity / location via IP / Tor / etc.

Private channels (`announce_channel = false`):
- Not gossiped.
- Visible only to channel partners.
- For receive: include `route_hints` (BOLT 11 'r' tag) in invoices
  so senders can reach you.

## Common bugs

- Failing to verify Bitcoin sigs in `channel_announcement` → injected
  fake channels.
- Treating `channel_update` from disabled channel as routable.
- Race conditions on disconnect: peer sends update for channel that
  just closed.
- Excessive pruning timeout (e.g., 1 day) → dropping legitimate
  inactive channels.
- Storing the graph in-memory without periodic disk sync → lose
  state on crash, full re-sync needed.

## See also

- [bolts/SKILL.md](../bolts/SKILL.md)
- [routing/SKILL.md](../routing/SKILL.md)
- [channels/SKILL.md](../channels/SKILL.md)
