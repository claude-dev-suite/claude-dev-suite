---
name: bitcoin-infrastructure-electrs
description: |
  Electrs: Romanmandryk's Electrum-protocol indexer in Rust. Lightweight,
  serves Electrum clients + LN nodes (filter-based scan).
  USE WHEN: deploying personal Electrum server, integrating LN with
  Electrum backend, evaluating indexers.
allowed-tools: Read, Grep, Glob
---

# Electrs

Rust implementation of Electrum protocol server. Reads from Bitcoin
Core, indexes per-address history, serves Electrum clients.

Repo: `github.com/romanz/electrs`.

## Why

Electrum protocol is the de-facto standard for SPV-style clients
querying history per address. Public Electrum servers exist but for
**privacy** you should run your own.

## Setup

Requires Bitcoin Core with:
```ini
txindex=1
blockfilterindex=1
peerblockfilters=1
```

Then:
```bash
electrs --network bitcoin \
  --daemon-rpc-addr=127.0.0.1:8332 \
  --electrum-rpc-addr=127.0.0.1:50001
```

Indexes ~1 day on a fast machine, ~6 GB extra disk (alongside Core's
~700 GB).

## Compatibility

- **Sparrow**: connect to electrs.
- **Electrum (desktop)**: connect.
- **BlueWallet** (Watchtower / privacy mode): supports.
- **BTCPay Server**: optional Electrum backend.
- **LDK / btcwallet**: filter-based scan via electrs.

## Compared to Fulcrum

| Aspect | Electrs | Fulcrum |
|--------|---------|---------|
| Language | Rust | C++ |
| RAM | Lower | Higher (more aggressive caching) |
| Indexing speed | Slower | Faster |
| Mainnet RAM | ~2 GB | ~4-8 GB |
| Codebase | Smaller, simpler | Larger |

## Common bugs

- Failing to set `txindex=1` on Core → electrs can't serve some
  history.
- `electrum-rpc-addr` exposed publicly without TLS proxy → DoS risk.
- Reorg handling lag during deep reorgs (rare on mainnet).

## See also

- [fulcrum/SKILL.md](../fulcrum/SKILL.md)
- [esplora/SKILL.md](../esplora/SKILL.md)
- [../core/operations/SKILL.md](../../core/operations/SKILL.md)
- [../core/indexes/SKILL.md](../../core/indexes/SKILL.md)
