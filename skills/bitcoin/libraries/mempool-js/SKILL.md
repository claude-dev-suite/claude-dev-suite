---
name: bitcoin-libraries-mempool-js
description: |
  mempool.js (@mempool/mempool.js): TypeScript client for mempool.space
  API. REST + WebSocket; address history, fee estimates, mining stats.
  USE WHEN: integrating mempool.space data, building wallets / explorers.
allowed-tools: Read, Grep, Glob
---

# mempool.js

Official mempool.space API client.

Repo: `github.com/mempool/mempool.js`.

## Install

```bash
npm install @mempool/mempool.js
```

## Quick examples

```ts
import mempoolJS from "@mempool/mempool.js";

const { bitcoin: { addresses, fees, transactions, blocks, mempool } } =
    mempoolJS({ hostname: "mempool.space" });

// Fees
const recommended = await fees.getFeesRecommended();
// { fastestFee, halfHourFee, hourFee, economyFee, minimumFee }

// Address
const utxos = await addresses.getAddressTxsUtxo({ address: "bc1q..." });
const txs = await addresses.getAddressTxs({ address: "bc1q..." });

// Tx
const tx = await transactions.getTx({ txid: "abc..." });
const status = await transactions.getTxStatus({ txid: "abc..." });

// Mempool
const blocksProj = await mempool.getMempoolBlocks();
```

## WebSocket

```ts
const ws = await mempoolJS.ws({ hostname: "mempool.space" });
ws.on("blocks", (block) => console.log("New block:", block.id));
ws.on("mempool-blocks", (mbs) => console.log("Projection:", mbs));
ws.send({ action: "want", data: ["blocks", "mempool-blocks"] });
```

## Use cases

- Web wallet fee selection.
- Block explorer integrations.
- Fee tracker apps.

## Self-hosted

Same API works against your own mempool.space instance:
```ts
mempoolJS({ hostname: "your-mempool.local" });
```

## See also

- [../../infrastructure/mempool-space/SKILL.md](../../infrastructure/mempool-space/SKILL.md)
- [bitcoinjs-lib/SKILL.md](../bitcoinjs-lib/SKILL.md)
- [scure-btc-signer/SKILL.md](../scure-btc-signer/SKILL.md)
