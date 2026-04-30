---
name: bitcoin-infrastructure-esplora
description: |
  Esplora: Blockstream's HTTP-based block explorer + indexer. REST
  API at /api/<endpoint>. Powers blockstream.info, mempool.space's
  earlier versions, and self-hosted explorers.
  USE WHEN: deploying a personal block explorer, integrating with
  Esplora REST API, building wallet / monitoring on Esplora-style
  endpoint.
allowed-tools: Read, Grep, Glob
---

# Esplora

Block explorer + REST API by Blockstream. Two parts:
- **electrs** fork (esplora-electrs) — backend indexer.
- **Esplora frontend** — web UI + REST API.

Repo: `github.com/Blockstream/esplora`.

## Setup

Heavy: requires Bitcoin Core with `txindex=1` + esplora-electrs
indexer + frontend Node.js process.

```bash
# Start Esplora's electrs-fork as backend
electrs --daemon-rpc-addr=127.0.0.1:8332 \
  --http-addr=127.0.0.1:3000

# Frontend serves /api proxy + UI
cd esplora && npm run dev
```

## REST API

Public endpoint for blockstream.info:
```
GET /api/tx/<txid>
GET /api/block/<hash>
GET /api/address/<addr>/utxo
GET /api/address/<addr>/txs
GET /api/mempool
GET /api/fee-estimates
```

JSON responses; well-documented at `github.com/Blockstream/esplora/blob/master/API.md`.

## Self-hosted explorer

Run your own:
- **Privacy**: queries don't go to a third party.
- **Full feature**: address history, mempool, fees, charts.
- **Heavy**: ~1-2 TB disk, several GB RAM.

## Public services

- **blockstream.info** — Esplora's flagship instance.
- **mempool.space** — separate codebase but Esplora-compatible API
  in some endpoints.
- Lightning wallets often use Esplora REST API as light-client backend
  (e.g., LDK Node default).

## Compared

| Aspect | Esplora REST | Bitcoin Core REST | Mempool.space API |
|--------|--------------|-------------------|--------------------|
| Address history | yes | no | yes |
| Mempool details | rich | basic | rich |
| Fee estimates | yes | basic | best |
| Self-hostable | yes | yes (no UI) | yes |
| API style | Esplora-spec | bitcoind REST | mempool.space spec |

## Common bugs

- Confused with `esplora-electrs` (the indexer) vs Esplora frontend
  — both names overlap.
- Reorg handling: address-tx history can show stale entries during
  deep reorgs; refresh.
- Missing CORS for public deployments; configure carefully.

## See also

- [electrs/SKILL.md](../electrs/SKILL.md)
- [mempool-space/SKILL.md](../mempool-space/SKILL.md)
- [../core/rest-api/SKILL.md](../../core/rest-api/SKILL.md)
