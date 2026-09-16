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

The npm package is abandoned: `npm install bcoin` resolves to `1.0.2`
(July 2018), which is deprecated with "bcoin v2.0.0+ are no longer
hosted on npm" (registry checked September 2026). No 2.x release was
ever published to npm. Upstream ships by git clone only:

```bash
git clone https://github.com/bcoin-org/bcoin
cd bcoin
npm rebuild
./bin/bcoin
```

Dependencies are themselves `git+https://` specs pinned to other
`bcoin-org` repos, so the clone needs network access to GitHub, not
just to the npm registry.

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
| Compatibility | Full | Pre-Taproot rules only |
| Mempool policy | Reference | v1 RBF rejected, 10x fee floor |
| Performance | Best | Acceptable |
| Adoption | Universal | Niche |
| Soft fork support | Always immediate | Stalled at SegWit |

Mempool detail, both trees read September 2026: bcoin's
`replace-by-fee` option defaults to `false` and mainnet sets
`requireStandard = true`, so `Mempool.insertTX` rejects an
RBF-signalling tx as nonstandard -- but only at version 1, because
`isRBF()` returns `false` for every version-2 tx whatever its input
sequences and version 2 is the standardness ceiling
(`policy.MAX_TX_VERSION = 2`) -- Core 29.0 (April 2025) removed
`-mempoolfullrbf` and made full RBF unconditional (PR #30592). bcoin's
`policy.MIN_RELAY` and every `network.minRelay` are 1000 sat/kB, ten
times Core's default `-minrelaytxfee`, lowered to 100 sat/kvB in Core
29.1 (September 2025) and 30.0 (October 2025) by PR #33106.

## Use cases

- Embedded full node in JS app (Electron desktop wallets).
- SPV-light JS apps.
- Educational — read JS code easier than C++.

## Status

Dormant as of September 2026. Last tagged release is v2.2.0
(November 2021); the last commit on `master` is August 2023; the
last push of any kind to the repository is February 2024. 114 open
issues and 87 open pull requests. The repo is not archived, but
nothing has moved in it for over two and a half years.

No Taproot. `master` has no `OP_CHECKSIGADD` opcode, no BIP341/342
validation and no taproot deployment in `lib/protocol/networks.js`.
`Script.verifyProgram` returns success for every witness version
above 0 unless `VERIFY_DISCOURAGE_UPGRADABLE_WITNESS_PROGRAM` is set,
so in blocks a v1 (P2TR) output is anyone-can-spend as far as bcoin
is concerned. The taproot work lives on an unmerged `taproot` branch
whose last commit is September 2022. Address handling does support
bech32m (BIP350), so bcoin can parse P2TR addresses whose spends it
cannot validate.

Treat bcoin as a reference and teaching implementation, not a
deployment target. For any node that must follow consensus, or that
sits in front of funds, run bitcoind.

## See also

- [bitcoinjs-lib/SKILL.md](../bitcoinjs-lib/SKILL.md)
- [../../core/operations/SKILL.md](../../core/operations/SKILL.md)
