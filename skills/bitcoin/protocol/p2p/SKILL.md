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

Introduced opt-in ("experimental", `-v2transport`) in Bitcoin Core 26.0
(December 2023); **enabled by default since Core 27.0** (April 2024,
PR #29347) and still default-on in Core 31.1 (July 2026). Disable with
`-v2transport=0`. From 27.0 the manual connection options (`-connect`,
`-addnode`, `-seednode`) and the `addnode` RPC also follow
`-v2transport`, retrying v1 on failure. Differentiated by initial bytes
(no magic in first message → v2 encrypted).

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

### Post-quantum path — discussion only (as of September 2026)

BIP324 derives its session keys with ECDH, so a future quantum computer
could recover them from a recorded handshake; an adversary can already
store ciphertext today and decrypt later ("harvest now, decrypt later").
Olaoluwa Osuntokun opened the design discussion on bitcoin-dev in
"A Post-Quantum Path for BIP 324" (2026-05-05, summarised in Optech
#408, 2026-06-05). Deliberately not a BIP: it poses two questions.

1. **Hybrid or pure PQ KEM?** ML-KEM (FIPS 203) is a KEM, and so is
   ECDH. A hybrid combiner keeps ellswift/ECDH *and* ML-KEM-768 so the
   channel survives either primitive breaking. A pure ML-KEM handshake
   drops ElligatorSwift entirely and sends the ~1.1 KB encapsulation
   key in its place, keeping garbage + terminator intact.
2. **Must the handshake still look like a uniform random string?**
   An ML-KEM encapsulation key is a vector of polynomial coefficients
   mod 3329 and is recognisable on the wire. Kemeleon is the ML-KEM
   analogue of ElligatorSwift, but its indistinguishability is only
   computational (Module-LWE), where ElligatorSwift's is statistical.
   If the property is kept, two routes were sketched:
   classical-then-PQ-upgrade (run ML-KEM *inside* the existing v2
   channel, then rekey), or an OEINC ("OINK") combiner in which the
   ellswift outer KEM encrypts a Kemeleon inner KEM in one round trip.

The thread ran 2026-05-05 to 2026-08-27 (7 messages). No BIP has been
drafted and nothing is implemented in Bitcoin Core as of September 2026.
This is the transport layer only — the consensus-layer PQ work on
signatures and output types is a separate problem, see
[../proposals/SKILL.md](../proposals/SKILL.md).

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

## Tx announcement rate limiting — global buckets

Status as of September 2026: PR #34628 "p2p: Replace per-peer
transaction rate-limiting with global rate limits" merged 2026-07-25
under the 32.0 milestone. It is in the `v32.0rc1` tag (2026-09-14) but
there is no final 32.0 release, so every released line up to and
including 31.1 (July 2026) still uses the old per-peer scheme.

Motivation: the per-peer `m_tx_inventory_to_send` queues cost CPU and
memory in proportion to queue size *times* peer count; the PR
description attributes an observed msghand thread at 100% CPU and
~95 MB of queue memory to the February 2026 transaction surge. It
keeps one global pair of token buckets per direction class (one pair
for inbound peers, one for outbound), each limiting both count and
serialised size — `util::TokenBucket` in `src/util/tokenbucket.h` and
`InvToSendBucket` in `net_processing.cpp`, as of tag v32.0rc1:

- **count bucket** — refills at `DEFAULT_TX_SEND_RATE` = 14 tx/s,
  capacity 30 s worth (= 420 tx). Overridable with the hidden
  `-txsendrate=<n>`.
- **size bucket** — refills at 20 kB/s (= 12 MB per 600 s), starts at
  12 MB, capacity 50 MB.
- Outbound buckets refill 2.5x faster, that being the ratio of the 5 s
  inbound to the 2 s outbound trickle interval.

Announcements over capacity sit in a global backlog and drain as the
buckets refill. Per-peer queues survive only for privacy batching and
are now always emptied in full, so the old `INVENTORY_BROADCAST_MAX`
per-message cap is gone.

## Compact block filters (BIP157/158)

Server-side: compute Golomb-coded set per block (BIP158) for
script-pubkey matching. Filter ≈ 0.4% of block size.

Client-side: download header chain + filter headers (`getcfheaders`),
download filters (`getcfilters`) on demand, scan locally for
`scriptPubKey` matches, then `getdata` the relevant block.

Used by Neutrino-style SPV (LDK, BDK, btcwallet).

## Light-client & block-data research (2026)

Work sitting on top of, or alongside, BIP157/158. None of it is in a
release as of September 2026 — all proposal, RFC or benchmark stage.

- **Binary fuse filters as a GCS replacement** (Csaba Purszki, posted
  to Delving Bitcoin; Optech #403, 2026-05-01). The 16-bit variant
  (Fuse16) answers queries in O(1) where a Golomb-Rice coded set is
  O(N), with zero false negatives and a 1/2^k false-positive rate.
  Benchmarks over 10 wallet profiles (24–480 scripts) across 50,000
  mainnet blocks measured a 9x–80x query speedup on desktop x86_64 and
  6x–45x on ARM, for a 0%–3% bandwidth increase.
- **Block-range filters** (Optout, RFC on Delving Bitcoin; Optech #420,
  2026-08-28). Hierarchical filters: build one filter per *range* of
  blocks, and download the individual BIP157 per-block filters only for
  ranges that match. Simulations over ~30k blocks put the best
  trade-off at a 256-block range, cutting total download size ~70–80%
  for the tested script sets; savings are largely cancelled if the
  range grows too big.
- **UTXO set over P2P** (Fabian Jahr, draft BIP posted to bitcoin-dev;
  Optech #405, 2026-05-15). Lets a new node fetch an assumeUTXO
  snapshot from peers instead of an out-of-band download: a new service
  bit, four new P2P messages, and a UTXO-set merkle root the requester
  already knows, used to verify what peers serve. Contested — Antoine
  Riard asked for it to be built on BIP434 peer feature negotiation and
  raised malformed-snapshot concerns; Eric Voskuil objected that it
  invites later proposals for miner commitments to UTXO state.
- **Fountain codes for IBD** (Lucas Lima, Delving Bitcoin; Optech #413,
  2026-07-10). Split the chain into epochs of k blocks, erasure-code
  each epoch, and let pruned nodes serve the encodings ("droplets") so
  they can contribute to other nodes' initial block download; headers
  verify the reconstruction. Objections raised in the thread: many
  peers needed to decode an epoch, slower IBD, node fingerprinting, and
  extra DoS surface. See also `../../core/operations` (pruning).

## Erlay (BIP330) — proposed

Cuts the bandwidth spent announcing transactions under the current
"every peer announces every tx" flooding, using sketches:
1. Reconciliation phase: peers exchange compact set sketches.
2. Recover differences via Minisketch decoding.
3. Only relay missing items.

Sizing the saving — two framings circulate and they are not the same
claim. BIP330's own Motivation section puts the cost of INV-based
flooding at *O(nodes * connections_per_node)* and the target for
reconciliation-based relay at *O(nodes)*. The Erlay paper
(arXiv:1905.10518, Naumenko, Maxwell, Wuille, Fedorova, Beschastnikh)
asserts no asymptotic bound at all: it measures a 40% cut in relay
bandwidth at the connectivity of the day and shows bandwidth staying
almost constant as connectivity grows, where flooding grows linearly
with the number of connections.

Status as of September 2026: BIP330 is still **Draft** and no
reconciliation round trip ships in any release up to and including
Bitcoin Core 31.1 (July 2026). Only the negotiation half exists in
Core: the `sendtxrcncl` signaling message merged in October 2022
(PR #23443) and remains gated behind the hidden, default-off
`-txreconciliation` flag — `net_processing.cpp` in v31.1 still carries
the comment "While Erlay support is incomplete, it must be enabled
explicitly via -txreconciliation". The full implementation
(PR #35591, opened June 2026) is open but explicitly titled
`[DO NOT MERGE]` and meant to be split up for review; the umbrella
tracking issue is #30249. There is no experimental build that turns
reconciliation on.

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

## Bitcoin Core 31.0 net changes (released 2026-04-20)

From `doc/release-notes.md` at tag `v31.0`; still current in 31.1
(July 2026).

- **`-privatebroadcast`** — makes `sendrawtransaction` broadcast only
  over Tor or I2P, on a separate connection per transaction, so the
  originator's IP is never learned by the recipients and two unrelated
  transactions are not linkable (#29415). `getprivatebroadcastinfo`
  reports what is currently being privately broadcast and
  `abortprivatebroadcast` removes transactions from the queue (#34329).
  Covered in depth under
  [../../privacy/tor/SKILL.md](../../privacy/tor/SKILL.md),
  [../../privacy/dandelion/SKILL.md](../../privacy/dandelion/SKILL.md)
  and [../../core/operations/SKILL.md](../../core/operations/SKILL.md).
- **Embedded asmap data** — first release to ship an asmap in the
  binary, the map having been created 2026-03-05 (#34696), so ASN-based
  netgroup bucketing no longer needs an externally sourced file. Still
  off by default: `-asmap` or `-asmap=1` must be set explicitly, and it
  now loads the embedded data — an external file requires a filename
  (`-asmap=ip_asn.map`).
- **1p1c package relay widened** — the parent in a
  one-parent-one-child package may now be below `-minrelaytxfee`, even
  0-fee, for non-TRUC packages too, extending the 28.0 change (#33892).
  See [../package-relay/SKILL.md](../package-relay/SKILL.md).
- **`-maxorphantx` removed** — previously deprecated, and a no-op
  since v30.0 (#33872).
- **`tor` removed as a network specification** — use `onion`, which it
  was deprecated in favour of back in v0.17.0 (#34031).

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
