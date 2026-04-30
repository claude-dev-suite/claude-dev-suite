---
name: bitcoin-l2-botanix
description: |
  Botanix: EVM-compatible Bitcoin L2 using "Spiderchain" architecture
  (federated multisig rotated by orchestrators). stBTC native staking.
  USE WHEN: deploying EVM apps on Botanix, evaluating Spiderchain
  vs other federation models.
allowed-tools: Read, Grep, Glob
---

# Botanix

Bitcoin L2 with EVM compatibility and a novel **Spiderchain**
architecture for federation rotation.

## Spiderchain architecture

- Federation multisig periodically rotates.
- Each "spider" is a federation slice with its own multisig.
- BTC distributed across multiple spiders for redundancy.
- Trust assumption: at least one spider's quorum honest.

## EVM

Standard EVM execution. Solidity contracts deployable.

## Native token

- **stBTC**: staked BTC, earns Botanix-native yield.
- **BTC** bridged 1:1.

## Position

Mid-tier Bitcoin L2 in 2025-2026. Smaller TVL than Merlin but
distinguishes via Spiderchain design.

## Use cases

- **EVM DeFi** on Bitcoin.
- **stBTC yield** for staked BTC.
- **Cross-bridge ecosystem**.

## Limitations

- **Spiderchain rotation** still implies federation trust per
  rotation cycle.
- **Newer ecosystem** vs Stacks / RSK.

## See also

- [bitlayer/SKILL.md](../bitlayer/SKILL.md)
- [hemi/SKILL.md](../hemi/SKILL.md)
- [bob/SKILL.md](../bob/SKILL.md)
- [merlin/SKILL.md](../merlin/SKILL.md)
