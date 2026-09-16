---
name: bitcoin-infrastructure-electrs
description: |
  Electrs: Roman Zeyde's Electrum-protocol indexer in Rust. Lightweight,
  serves Electrum clients; BIP157 filter scan stays on Bitcoin Core.
  USE WHEN: deploying personal Electrum server, integrating LN with
  Electrum backend, evaluating indexers.
allowed-tools: Read, Grep, Glob
---

# Electrs

Rust implementation of Electrum protocol server. Reads from Bitcoin
Core, indexes per-address history, serves Electrum clients.

Repo: `github.com/romanz/electrs`. Current release v0.12.0
(13 September 2026).

## Why

Electrum protocol is the de-facto standard for SPV-style clients
querying history per address. Public Electrum servers exist but for
**privacy** you should run your own.

## Setup

Since v0.12.0 (13 September 2026) electrs indexes through `bindex`
and reads blocks over bitcoind's REST interface instead of the P2P
protocol, so it requires **Bitcoin Core 31.0+** (released April 2026).
Requires Bitcoin Core with:
```ini
server=1
rest=1
prune=0
```
`txindex` is *not* required - electrs maintains its own index (it is
still allowed, and other services such as eclair may need it). Set
`blockfilterindex=1` / `peerblockfilters=1` only when BIP157 clients
query Core directly; electrs exposes no compact-filter RPC of its own.

Then:
```bash
electrs --network bitcoin \
  --daemon-rpc-addr=127.0.0.1:8332 \
  --electrum-rpc-addr=127.0.0.1:50001
```

Upstream measured the initial index at ~2 h for ~800 GB of
`blocks/*.dat` on a 6-core / 32 GB / NVMe host, and ~18 h on an
ODROID-HC1 (electrs docs, July 2026). The RocksDB index settles at
~7% of `blocks/*.dat` - ~56 GB on that ~800 GB chain - peaking near
~14% just before the final compaction.

## Compatibility

- **Sparrow**: connect to electrs.
- **Electrum (desktop)**: connect.
- **BlueWallet** (Watchtower / privacy mode): supports.
- **BTCPay Server**: optional Electrum backend.
- **LDK / btcwallet**: scan BIP157 filters served by Core
  (`blockfilterindex` / `peerblockfilters`), not by electrs.

## Compared to Fulcrum

| Aspect | Electrs | Fulcrum |
|--------|---------|---------|
| Language | Rust | C++ |
| RAM | Lower | Higher (more aggressive caching) |
| Indexing speed | Slower | Faster |
| Mainnet RAM | ~2 GB | ~4-8 GB |
| Codebase | Smaller, simpler | Larger |

## Common bugs

- Failing to set `rest=1` on Core → electrs v0.12.0+ cannot fetch
  blocks at all, since it no longer falls back to the P2P protocol.
- Upgrading to v0.12.0 without planning downtime → the bindex format
  is new and forces a full reindex; upstream asks for 120 GB free
  before starting (electrs `doc/upgrading.md`, September 2026).
- `electrum-rpc-addr` exposed publicly without TLS proxy → DoS risk.
- Reorg handling lag during deep reorgs (rare on mainnet).

## See also

- [fulcrum/SKILL.md](../fulcrum/SKILL.md)
- [esplora/SKILL.md](../esplora/SKILL.md)
- [../core/operations/SKILL.md](../../core/operations/SKILL.md)
- [../core/indexes/SKILL.md](../../core/indexes/SKILL.md)
