---
name: bitcoin-l2-citrea
description: |
  Citrea: first ZK-rollup on Bitcoin (mainnet 27 Jan 2026), zkEVM,
  BitVM2 trustless bridge, ctUSD stablecoin, native BTC lending.
  USE WHEN: building zkEVM apps on Bitcoin, integrating with Citrea,
  evaluating ZK rollups vs sidechains.
allowed-tools: Read, Grep, Glob
---

# Citrea

The first zero-knowledge rollup on Bitcoin. Mainnet activated **27
January 2026**. zkEVM execution + BitVM2-based bridge.

Repo: `citrea.xyz`.

## Architecture

- **Off-chain execution**: Citrea sequencer runs an EVM (Solidity-
  compatible) and processes transactions off-chain.
- **State commitments**: validity proofs (ZK-SNARKs) posted to
  Bitcoin.
- **Data availability**: tx data also committed to Bitcoin (full
  rollup, not validium).
- **Bridge**: BitVM2-based, **trust-minimized** (does not require
  federation trust for peg-in/out).

## ZK proof system

zkEVM type-2 (compatible with Ethereum bytecode at gas cost of
running on Citrea). Validity proof posted with each batch.

## BitVM2 bridge

Trust-minimized peg out via BitVM2:
- Optimistic challenge model: peg-out claims posted; anyone can
  challenge.
- Challengers can dispute fraud and reclaim funds; honest claims pay
  out after challenge window.
- No federation key custody — bridge security derives from
  game-theoretic + ZK proof properties.

## Native features

- **ctUSD**: native stablecoin on Citrea.
- **BTC lending**: native protocols using bridged BTC.
- **EVM apps**: any Ethereum dApp can deploy on Citrea (with minimal
  modifications).

## Compared to other Bitcoin L2s

| Aspect | Citrea | Stacks | RSK | Liquid |
|--------|--------|--------|-----|--------|
| Smart contracts | EVM | Clarity | EVM | Limited |
| Bridge | BitVM2 (trustless) | Threshold | Federation | Federation |
| Settlement | Validity proofs | Anchored | Merge mining | Federation |
| Maturity | 2026 mainnet | 2024 Nakamoto | 2018 | 2018 |
| TVL (early) | growing | medium | medium | medium |

## Status (early 2026)

- Mainnet active since Jan 2026.
- Early ecosystem: ctUSD launched, dApps deploying.
- Validator/sequencer set: limited at launch, decentralizing over
  time.

## Limitations

- **New** — limited audit history; bugs likely in early phase.
- **Sequencer centralization** at launch (typical for early ZK
  rollups).
- **BitVM2 challenge windows** add latency to peg-out (24+ hours
  typical).

## Use cases

- **DeFi on BTC** with EVM tooling.
- **Stable coins** (ctUSD).
- **Cross-chain bridge** to Ethereum L2s.
- **Long-term**: settlement layer for higher-frequency apps.

## Implementations

- **citrea-node** — Rust full node.
- **MetaMask compatible** with custom RPC.
- **ethers.js, web3.js** work out of the box.

## See also

- [bitvm/SKILL.md](../bitvm/SKILL.md)
- [strata/SKILL.md](../strata/SKILL.md)
- [bsquared/SKILL.md](../bsquared/SKILL.md)
- [babylon/SKILL.md](../babylon/SKILL.md)
- [stacks/SKILL.md](../stacks/SKILL.md)
