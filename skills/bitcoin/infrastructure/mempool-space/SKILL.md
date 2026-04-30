---
name: bitcoin-infrastructure-mempool-space
description: |
  mempool.space: open-source mempool explorer + accelerator. Detailed
  fee tracking, mempool blocks projection, REST + WebSocket APIs.
  Self-hostable.
  USE WHEN: integrating mempool.space API, deploying self-hosted
  variant, evaluating fee estimation services.
allowed-tools: Read, Grep, Glob
---

# mempool.space

Open-source mempool explorer + REST/WebSocket APIs. Industry-leading
mempool visibility.

Repo: `github.com/mempool/mempool`.

## Features

- **Mempool blocks projection**: shows next ~10 blocks with median
  fees per virtual block.
- **Fee estimates**: `/api/v1/fees/recommended` returns
  `{fastestFee, halfHourFee, hourFee, economyFee, minimumFee}`.
- **Address history**: similar to Esplora.
- **Lightning visualizer**: graph view, channel info.
- **Mining stats**: pool distribution, block templates, hashrate.
- **Accelerator**: paid service to push tx into next block.

## Self-host

```bash
docker compose up -d
```

Stack: Bitcoin Core + electrs-fork (mempool-electrs) + Node.js backend
+ Nginx + frontend.

Disk ~1-2 TB, RAM ~4-8 GB recommended.

## REST API

```
GET /api/v1/fees/recommended
GET /api/mempool
GET /api/v1/fees/mempool-blocks
GET /api/tx/<txid>/status
GET /api/block/<hash>
GET /api/address/<addr>
GET /api/v1/mining/pools/24h
```

Full docs: `mempool.space/docs/api/rest`.

## WebSocket

`/api/v1/ws` — subscribe to live blocks, mempool, address.

```js
const ws = new WebSocket("wss://mempool.space/api/v1/ws");
ws.send(JSON.stringify({ action: "want", data: ["blocks", "mempool-blocks"] }));
```

## Accelerator

Paid via Lightning. Operator publishes the tx with high fee priority
(via mempool.space's pool partnerships). Useful when:
- Tx is stuck due to ancestor / no RBF.
- Need confirmation in next 1-2 blocks.

Cost: usually few dollars to ~$50, depending on size + urgency.

## Compared to Esplora

| Aspect | mempool.space | Esplora |
|--------|---------------|---------|
| Mempool detail | best | basic |
| Fee estimation | best | OK |
| Lightning view | yes | partial |
| Mining stats | rich | basic |
| API spec compatibility | mempool.space-specific | spec defined |

## Common bugs

- Self-hosted: full sync takes days; first IBD + indexing.
- Public API rate-limited; for serious integrations, run your own
  or pay for premium.
- WebSocket reconnect logic essential — connections drop.

## See also

- [esplora/SKILL.md](../esplora/SKILL.md)
- [electrs/SKILL.md](../electrs/SKILL.md)
- [../wallets/fee-estimation/SKILL.md](../../wallets/fee-estimation/SKILL.md)
- [../libraries/mempool-js/SKILL.md](../../libraries/mempool-js/SKILL.md)
