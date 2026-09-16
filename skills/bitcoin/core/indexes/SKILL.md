---
name: bitcoin-core-indexes
description: |
  Bitcoin Core indexes: txindex, blockfilterindex (BIP157/158),
  coinstatsindex, txospenderindex. Disk costs, rebuild times, when
  each is needed.
  USE WHEN: choosing which indexes to enable, troubleshooting
  "txid not found", integrating with electrs / fulcrum / LN nodes.
allowed-tools: Read, Grep, Glob
---

# Bitcoin Core Indexes

Four optional indexes as of Bitcoin Core 31.1 (July 2026), in addition
to the always-on UTXO set:

## txindex

```ini
txindex=1
```

Maps every txid to its block / position. Enables:
- `getrawtransaction <txid>` for **any** historical tx (without
  txindex, only mempool + recent blocks since restart).

Cost:
- Disk: ~80 GB measured at height ~840,000 (April 2024), not
  re-measured since. It stores one LevelDB record per txid, so it
  scales with cumulative transaction count, not with block bytes:
  991,029,144 transactions on 20 April 2024 vs 1,439,337,665 on
  15 September 2026 (~45% more records), so budget roughly half
  again as much at the current tip (height 967,284,
  16 September 2026).
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
- Disk: ~6 GB total (same April 2024 measurement). One filter per
  block, so this one does scale with block data, which grew ~36%
  from ~566 GB on 20 April 2024 to ~769 GB on 15 September 2026.
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

Upgrade note: Bitcoin Core 30.0 (October 2025) rewrote the index to fix
an overflow bug, and the rewritten index syncs from scratch on the first
start after the upgrade. It is stored at `indexes/coinstatsindex/`; the
pre-30.0 index at `indexes/coinstats/` is deliberately left in place for
downgrades and must be deleted by hand to reclaim the space. Core logs a
warning naming the old directory on every start while it exists.

## txospenderindex

```ini
txospenderindex=1
```

Added in Bitcoin Core 31.0 (April 2026); default off. Records, for every
non-coinbase input of every block transaction, which transaction spent
that outpoint.
Enables:
- `gettxspendingprevout` to answer for *confirmed* spends, not just
  mempool ones. With the index available the RPC also returns the
  `blockhash` of the spending block.

`gettxspendingprevout` gained two options in 31.0 alongside the index:
`mempool_only` (defaults to true only when the index is unavailable; set
false to fall through to the index) and `return_spending_tx` (returns
the full spending tx as `spendingtx`).

Cost:
- Disk: the project publishes no figure. The index stores one LevelDB
  key per non-coinbase transaction *input*, so it scales with the
  cumulative input count of the chain, not with the UTXO set.

When to enable:
- Answering "what spent this output?" for arbitrary historical outpoints
  (explorers, forensics, watchtower-style tooling).

When to skip:
- Pruned nodes — bitcoind refuses to start ("Prune mode is incompatible
  with -txospenderindex").

## Combining

All four can be enabled together. Pruning is incompatible with `txindex`
and, since 31.0, with `txospenderindex`; `blockfilterindex` and
`coinstatsindex` both work on a pruned node.

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

Paths per `doc/files.md` at v31.1 (July 2026):

- `<datadir>/indexes/txindex/` — LevelDB.
- `<datadir>/indexes/txospenderindex/` — LevelDB (31.0+).
- `<datadir>/indexes/blockfilter/basic/` — filter files, plus a
  `db/` LevelDB alongside them.
- `<datadir>/indexes/coinstatsindex/` — LevelDB (30.0+; the pre-30.0
  index lived at `indexes/coinstats/`).

## Common bugs

- Adding `txindex=1` to a pruned node → bitcoind exits.
- Removing `txindex` from conf → bitcoind warns but continues with
  index "stuck"; manually delete `indexes/txindex/` to free disk.
- Electrs/Fulcrum not connecting → check `peerblockfilters=1` and
  `blockfilterindex=1` are both set.
- Adding `txospenderindex=1` to a pruned node → bitcoind exits, same as
  `txindex`.
- Upgrading past 30.0 and seeing disk usage jump → the old
  `indexes/coinstats/` is still there next to the new
  `indexes/coinstatsindex/`; delete the old one once you are sure you
  will not downgrade to 29.x or lower.

## See also

- [operations/SKILL.md](../operations/SKILL.md)
- [rpc/SKILL.md](../rpc/SKILL.md)
- [../../infrastructure/electrs/SKILL.md](../../infrastructure/electrs/SKILL.md)
- [../../infrastructure/fulcrum/SKILL.md](../../infrastructure/fulcrum/SKILL.md)
