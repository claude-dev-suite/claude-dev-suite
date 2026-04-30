---
name: bitcoin-l2-bsquared
description: |
  B² Network (BSquared): hybrid ZK + optimistic Bitcoin L2 with EVM
  compatibility. Live since 2024.
  USE WHEN: evaluating B² for deployment, integrating with their
  bridge, comparing Bitcoin L2 options.
allowed-tools: Read, Grep, Glob
---

# B² Network (BSquared)

Bitcoin L2 with EVM compatibility, ZK proof rollup combined with
optimistic challenge mechanism. Deployed 2024, growing 2025-2026.

## Architecture

- **EVM execution** (Solidity contracts).
- **ZK proofs** for state validity.
- **Optimistic challenges** as backup verification.
- **Bridge**: federation + planned BitVM upgrade.
- **Native token**: B²BTC (peg-style) + B² (governance/utility).

## Use cases

- **DeFi**: yield protocols, lending, AMMs.
- **Bitcoin staking-like products**: bridged BTC earns yield in
  B² ecosystem.
- **NFTs / Asset issuance**.

## Position

One of multiple "Bitcoin L2" projects competing for TVL in 2024-2025.
Notable but smaller than Stacks, RSK, Merlin in TVL terms (early
2026).

## Limitations

- **Federation trust** for current bridge.
- **EVM compatibility** but smaller dApp ecosystem.
- **Unclear path** to fully trustless bridging.

## See also

- [strata/SKILL.md](../strata/SKILL.md)
- [citrea/SKILL.md](../citrea/SKILL.md)
- [bitlayer/SKILL.md](../bitlayer/SKILL.md)
- [merlin/SKILL.md](../merlin/SKILL.md)
