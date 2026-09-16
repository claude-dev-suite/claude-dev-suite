---
name: bitcoin-l2-bsquared
description: |
  B² Network (BSquared): hybrid ZK + optimistic Bitcoin L2 with EVM
  compatibility. Live since 2024; DeFi TVL is down ~97% from its
  December 2024 peak as of September 2026.
  USE WHEN: evaluating B² for deployment, integrating with their
  bridge, comparing Bitcoin L2 options.
allowed-tools: Read, Grep, Glob
---

# B² Network (BSquared)

Bitcoin L2 with EVM compatibility, ZK proof rollup combined with
optimistic challenge mechanism. Deployed 2024. Mainnet is still live as
of September 2026, but DeFi TVL is down ~97% from its December 2024
peak — see Position below.

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

One of multiple "Bitcoin L2" projects competing for TVL in 2024-2025,
and still smaller than Stacks, Rootstock and Merlin — but the absolute
scale has changed by orders of magnitude since then. Chain DeFi TVL,
DefiLlama, 16 September 2026:

| Chain | DeFi TVL |
|---|---|
| BSquared | ~$2.6M |
| Merlin | ~$8.9M |
| Stacks | ~$77.7M |
| Rootstock | ~$79.2M |

BSquared peaked at ~$103.3M on 7 December 2024 and was ~$89.1M on
1 January 2025, so this is a ~97% drawdown from peak. The contraction
is sector-wide rather than BSquared-specific — between 1 January 2025
and 16 September 2026 Bitlayer went ~$361M -> ~$0.46M and Merlin ~$169M
-> ~$8.9M. Treat every figure here as a dated snapshot, not a fact:
re-check https://defillama.com/chain/BSquared before quoting.

## Limitations

- **Federation trust** for current bridge.
- **EVM compatibility** but smaller dApp ecosystem.
- **Unclear path** to fully trustless bridging.

## See also

- [strata/SKILL.md](../strata/SKILL.md)
- [citrea/SKILL.md](../citrea/SKILL.md)
- [bitlayer/SKILL.md](../bitlayer/SKILL.md)
- [merlin/SKILL.md](../merlin/SKILL.md)
