---
name: bitcoin-libraries-bcoin-js
description: |
  bcoin: full-node Bitcoin implementation in JavaScript. Wallets,
  HTTP API, SPV mode. Alternative to running bitcoind.
  USE WHEN: needing a Node-native Bitcoin full node, evaluating
  alternative implementations.
allowed-tools: Read, Grep, Glob
---

# bcoin

Bitcoin full-node implementation in JavaScript. Built by Bcoin
Foundation (originally Purse / Bcrypt team).

Repo: `github.com/bcoin-org/bcoin`.

## Components

- Full node.
- SPV mode.
- HTTP API (REST + RPC).
- WebSocket subscriptions.
- HD wallet.
- Wallet API.

## Install

```bash
npm install bcoin
```

## Quick example

```js
const bcoin = require("bcoin").set("main");
const node = new bcoin.FullNode({ memory: false, db: "leveldb" });
await node.open();

// Watch new blocks
node.chain.on("connect", (entry, block) => {
    console.log("New block:", entry.height, entry.hash.toString("hex"));
});
```

## Compared to bitcoind

| Aspect | bitcoind (Core) | bcoin |
|--------|-----------------|-------|
| Language | C++ | JavaScript |
| Compatibility | Full | Most consensus rules |
| Mempool policy | Reference | Different defaults |
| Performance | Best | Acceptable |
| Adoption | Universal | Niche |
| Soft fork support | Always immediate | Lags Core |

## Use cases

- Embedded full node in JS app (Electron desktop wallets).
- SPV-light JS apps.
- Educational — read JS code easier than C++.

## Status

Maintained but not as actively as Bitcoin Core. For production
nodes, prefer bitcoind.

## See also

- [bitcoinjs-lib/SKILL.md](../bitcoinjs-lib/SKILL.md)
- [../../core/operations/SKILL.md](../../core/operations/SKILL.md)
