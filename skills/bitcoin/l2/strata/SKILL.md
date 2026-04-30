---
name: bitcoin-l2-strata
description: |
  Strata by Alpen Labs: ZK rollup on Bitcoin, BitVM-based bridge,
  EVM-compatible execution. Emerging Bitcoin L2 in 2025-2026.
  USE WHEN: evaluating Strata for deployment, comparing with Citrea.
allowed-tools: Read, Grep, Glob
---

# Strata (Alpen Labs)

ZK rollup on Bitcoin developed by Alpen Labs. Aims to be a flexible
execution environment with EVM compatibility and a trust-minimized
bridge to Bitcoin.

## Architecture

- **Off-chain execution** (zkEVM-style).
- **Validity proofs** committed to Bitcoin.
- **BitVM-class bridge** for trust-minimized peg-in/out.
- **Sequencer** for ordering txs (initially centralized, decentralizing).

## Status

- Active development; testnet phases through 2025-2026.
- Mainnet: pending (check current docs).
- Comparable goals to Citrea but distinct implementation choices.

## Use cases

- **DeFi**: Solidity contracts on Bitcoin.
- **Cross-chain bridges** for assets.
- **High-throughput payment apps** that need EVM-style programmability.

## Comparison

| Aspect | Strata | Citrea | BSquared |
|--------|--------|--------|----------|
| Status (early 2026) | Testnet → mainnet pending | Mainnet (Jan 2026) | Live |
| ZK system | zkVM | zkEVM type-2 | zk + optimistic hybrid |
| Bridge | BitVM | BitVM2 | Federation + zk |
| Backing | Alpen Labs | Citrea team | B² Network |

## See also

- [citrea/SKILL.md](../citrea/SKILL.md)
- [bsquared/SKILL.md](../bsquared/SKILL.md)
- [bitvm/SKILL.md](../bitvm/SKILL.md)
- [bitlayer/SKILL.md](../bitlayer/SKILL.md)
