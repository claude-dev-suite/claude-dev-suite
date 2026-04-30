---
name: bitcoin-mining-decentralized-pools
description: |
  Decentralized mining pools: Public-Pool, BraiinsP2Pool, Solo CKPool,
  Datum (Ocean). Reduce centralization vs traditional pools.
  USE WHEN: solo mining, evaluating decentralized options, building
  censorship-resistant infrastructure.
allowed-tools: Read, Grep, Glob
---

# Decentralized Mining Pools

Mining pool architectures designed to reduce centralization, censorship
risk, or trust requirements.

## Solo CKPool

- Operator: KanoCK.
- Type: solo mining (no sharing among miners).
- Each miner runs a `ckpool-solo` instance against their bitcoind.
- Connect ASICs via Stratum V1.
- If one of YOUR ASICs finds a block, you get the entire reward.
- Pool fee: typically 0% (solo) or 1.25% on shared variants.

Use case: decentralization purist; small farms; learning.

## Public-Pool

- Solo-mining pool similar to CKPool but with web dashboard.
- Free-to-use for small-scale miners.
- Sometimes "shared luck" variants exist as public services.

## BraiinsP2Pool

- Successor to original P2Pool.
- Decentralized share chain — peers gossip shares like Bitcoin
  blocks.
- Variance and rewards determined by share chain participation.
- Miner builds own coinbase (decentralized tx selection).

## Datum (Ocean Mining)

- Datum protocol: decentralized template propagation.
- Stratum V2-style; miners choose own block content.
- Used by Ocean Mining for non-custodial payouts (winners get coinbase
  directly).
- Pioneered by Luke Dashjr / OceanCBTC.

## Compared

| Aspect | Solo CKPool | BraiinsP2Pool | Datum (Ocean) | Standard Pool |
|--------|-------------|----------------|----------------|---------------|
| Variance | Full (per miner) | Shared (chain) | Per template | Pool absorbs |
| Centralization | None | None | Low | High |
| Tx censorship | Miner choice | Miner choice | Miner choice | Pool choice |
| Setup complexity | Medium | High | Medium | Easy |
| Network share | Tiny | Tiny | Small | Major |

## Use cases

- **Censorship resistance**: ensure your txs don't get filtered out
  by major pools.
- **Solo mining**: small operations targeting a winning block (high
  variance).
- **Reducing pool centralization** at network level.

## Limitations

- **High variance** — most miners need pool-style smoothing.
- **Lower hashrate** in network share = longer wait between rewards.
- **Setup complexity** for non-pool variants.

## Why this matters

Bitcoin's security depends on no single mining cartel. The top 3-4
pools control > 60% of hashrate (as of 2025). Decentralized pools +
SV2 reduce this concentration over time.

## See also

- [stratum-v2/SKILL.md](../stratum-v2/SKILL.md)
- [pool-architectures/SKILL.md](../pool-architectures/SKILL.md)
- [firmware/SKILL.md](../firmware/SKILL.md)
