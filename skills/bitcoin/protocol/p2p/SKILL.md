---
name: bitcoin-p2p
description: |
  Bitcoin P2P network protocol: messages, version handshake, addr/addrv2,
  compact blocks (BIP152), compact block filters (BIP157/158), v2
  transport encryption (BIP324), wtxid relay (BIP339), Erlay (BIP330),
  Dandelion++ (BIP156).
  USE WHEN: implementing/debugging a node, integrating with bitcoind P2P,
  understanding address gossip, designing privacy-preserving propagation.
allowed-tools: Read, Grep, Glob
---

# Bitcoin P2P Protocol

The wire protocol Bitcoin nodes use to gossip transactions, blocks, and
peer addresses. Default port: **8333** mainnet, 18333 testnet, 18444
regtest, 38333 signet.

## Message frame

```
[4 bytes]   magic              # 0xf9beb4d9 mainnet
[12 bytes]  command (ASCII null-padded)
[4 bytes]   payload length (LE)
[4 bytes]   checksum = SHA256d(payload)[:4]
[N bytes]   payload
```

## Handshake (no encryption / BIP324 v2)

### Plaintext (legacy v1)

```
A → B: VERSION { protocol_version, services, timestamp, addr_recv, addr_from, nonce, user_agent, start_height, relay }
B → A: VERSION
B → A: VERACK
A → B: VERACK
```

### Encrypted (BIP324 v2)

Started in Bitcoin Core 26.0. Differentiated by initial bytes (no
magic in first message → v2 encrypted).

```
A → B: garbage + OUR_HKDF_SECRET (random 4 KiB max)
B → A: PEER_HKDF_SECRET + ECDH-derived nonce
... encrypted handshake completes, sets symmetric session keys ...
A → B: V2_VERSION (encrypted)
B → A: V2_VERSION
... VERACK and onward, encrypted ...
```

Provides confidentiality + authentication of the channel; **does not**
authenticate identity (no keypair-based ID, only ephemeral session).

## Service flags

Set in `services` field of VERSION:

- `NODE_NETWORK = 1` — serves the full chain.
- `NODE_GETUTXO = 2` — supports `getutxos`.
- `NODE_BLOOM = 4` — supports BIP37 bloom filtering (legacy SPV).
- `NODE_WITNESS = 8` — serves SegWit blocks.
- `NODE_COMPACT_FILTERS = 64` — serves BIP157/158 filters.
- `NODE_NETWORK_LIMITED = 1024` — pruned, only last ~288 blocks.
- `NODE_P2P_V2 = 2048` — supports BIP324 v2 transport.

## Address gossip (addrv2, BIP155)

Replaces legacy `addr`. Supports:
- IPv4 (network type 1).
- IPv6 (2).
- TORv2 (3, deprecated).
- TORv3 (4).
- I2P (5).
- CJDNS (6).

`getaddr` ↔ `addrv2` exchange. Periodic gossip: each peer broadcasts
~1000 addresses via `addrv2` randomly.

## Block & tx propagation

- **inv**: announces tx/block hashes.
- **getdata**: requests by hash + type.
- **block** / **tx**: actual data.
- **headers**: header-only sync (initial block download).
- **cmpctblock / blocktxn / getblocktxn (BIP152)**: compact block relay
  reduces 500-1000 ms gossip per block to ~30 ms by sending short
  txid prefixes.
- **wtxid relay (BIP339)** — peers advertise via `wtxidrelay` message,
  then announce by wtxid → fixes legacy txid-collision attack.

## Mempool sync

- **mempool**: requests mempool inv.
- **feefilter**: peer announces "don't relay below this fee rate".

## Compact block filters (BIP157/158)

Server-side: compute Golomb-coded set per block (BIP158) for
script-pubkey matching. Filter ≈ 0.4% of block size.

Client-side: download header chain + filter headers (`getcfheaders`),
download filters (`getcfilters`) on demand, scan locally for
`scriptPubKey` matches, then `getdata` the relevant block.

Used by Neutrino-style SPV (LDK, BDK, btcwallet).

## Erlay (BIP330) — proposed

Reduces tx-announcement bandwidth from O(n²) (current "every peer
announces every tx") to O(n^1.5) using sketches:
1. Reconciliation phase: peers exchange compact set sketches.
2. Recover differences via Minisketch decoding.
3. Only relay missing items.

Not yet activated; experimental in 2024-2025 builds.

## Dandelion++ (BIP156) — proposed

Tx privacy on broadcast:
1. **Stem phase** (anonymity): tx is forwarded to a single peer with
   probability p; route on for several hops.
2. **Fluff phase** (broadcast): tx is gossiped to all peers normally.

Stem hides origin in a forward-only path before public broadcast.

## Tor / I2P / CJDNS

Bitcoin Core supports outbound + inbound via:
- **Tor v3** — `-onion=<host>:<port>` SOCKS5 proxy + `-listenonion`.
- **I2P** — `-i2psam=<ip>:<port>`.
- **CJDNS** — addressed in fc00::/7 IPv6 space, `-cjdnsreachable`.

## Common bugs / gotchas

- Forgetting service flag intersection: a pruned peer (`NODE_NETWORK_LIMITED`)
  cannot serve historical blocks.
- Treating tx replay across forks (testnet ↔ mainnet) — different magic
  bytes prevent cross-network confusion at message level.
- Large `addrv2` payloads with mixed network types — must skip unknown
  network IDs gracefully.

## See also

- [package-relay/SKILL.md](../package-relay/SKILL.md)
- [../../core/operations/SKILL.md](../../core/operations/SKILL.md)
- [../../privacy/dandelion/SKILL.md](../../privacy/dandelion/SKILL.md)
