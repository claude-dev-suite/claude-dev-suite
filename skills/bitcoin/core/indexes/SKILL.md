---
name: bitcoin-core-indexes
description: |
  Bitcoin Core indexes: txindex, blockfilterindex (BIP157/158),
  coinstatsindex. Disk costs, rebuild times, when each is needed.
  USE WHEN: choosing which indexes to enable, troubleshooting
  "txid not found", integrating with electrs / fulcrum / LN nodes.
allowed-tools: Read, Grep, Glob
---

# Bitcoin Core Indexes

Three optional indexes (in addition to the always-on UTXO set):

## txindex

```ini
txindex=1
```

Maps every txid to its block / position. Enables:
- `getrawtransaction <txid>` for **any** historical tx (without
  txindex, only mempool + recent blocks since restart).

Cost:
- Disk: ~80 GB.
- IBD time: +20-50% if enabled from start.
- Rebuild from scratch on a synced node: hours, not days.

When to enable:
- Block explorers / public APIs.
- Forensic / compliance tools.
- Apps that need to look up arbitrary historical txs.

When to skip:
- Pruned nodes (cannot combine).
- Node that only serves recent activity (mempool + last few blocks).

## blockfilterindex (BIP157/158)

```ini
blockfilterindex=1
peerblockfilters=1   # serve filters to peers
```

Maintains compact block filters per block. Enables:
- `getblockfilter <blockhash>` RPC.
- Serving filters to BIP157 clients (Neutrino in LDK / btcwallet).
- Used by Electrs for fast scan operations.

Cost:
- Disk: ~6 GB total.
- IBD impact: +5-10%.

When to enable:
- Running Electrs / Fulcrum / similar indexers (they need it).
- Lightning node using LDK / Neutrino backend.
- Provides scan service to lightweight clients.

## coinstatsindex

```ini
coinstatsindex=1
```

Maintains rolling stats for `gettxoutsetinfo` (UTXO set value, count,
hash) without a full scan.

Cost:
- Disk: ~1 GB.
- IBD impact: +2-5%.

When to enable:
- Frequent calls to `gettxoutsetinfo` (without it, the call takes
  minutes and locks the wallet).

Without it, `gettxoutsetinfo` still works but does a full scan
on-demand → slow.

## Combining

All three can be enabled together. Pruning prevents only `txindex`.

Typical configurations:
| Use case | txindex | blockfilterindex | coinstatsindex | prune |
|----------|---------|------------------|----------------|-------|
| Personal wallet | no | no | no | optional |
| LN node (LDK) | no | **yes** | optional | no |
| LN node (LND/CLN) | no | optional | optional | no |
| Electrs/Fulcrum host | no | **yes** | optional | no |
| Block explorer | **yes** | yes | yes | no |
| Forensic / API | **yes** | optional | yes | no |
| Lightweight personal | no | no | no | **yes (550-15000)** |

## Rebuilding

Adding `txindex=1` to existing node:
```bash
# Stop node
bitcoin-cli stop
# Edit conf, add txindex=1
# Restart; node rebuilds index
bitcoind -daemon
# Watch
tail -f ~/.bitcoin/debug.log
```

Output:
```
2025-... reindex-chainstate already=true txindex=true blockfilterindex=true coinstatsindex=true
2025-... Building txindex
... (hours later) ...
2025-... txindex is enabled
```

To force rebuild from scratch: `-reindex` (full reindex, days) or
`-reindex-chainstate` (UTXO + indexes only, hours).

## Index storage

- `<datadir>/indexes/txindex/` — LevelDB.
- `<datadir>/indexes/blockfilter/basic/` — filter files.
- `<datadir>/indexes/coinstats/` — LevelDB.

## Common bugs

- Adding `txindex=1` to a pruned node → bitcoind exits.
- Removing `txindex` from conf → bitcoind warns but continues with
  index "stuck"; manually delete `indexes/txindex/` to free disk.
- Electrs/Fulcrum not connecting → check `peerblockfilters=1` and
  `blockfilterindex=1` are both set.

## See also

- [operations/SKILL.md](../operations/SKILL.md)
- [rpc/SKILL.md](../rpc/SKILL.md)
- [../../infrastructure/electrs/SKILL.md](../../infrastructure/electrs/SKILL.md)
- [../../infrastructure/fulcrum/SKILL.md](../../infrastructure/fulcrum/SKILL.md)
