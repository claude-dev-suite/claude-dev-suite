---
name: bitcoin-l2-hemi
description: |
  Hemi Network: hybrid Bitcoin + Ethereum L2 with "superfinality"
  via Bitcoin PoW. ~$1.2B TVL, 90+ protocols (early 2026).
  USE WHEN: building cross-chain DeFi, evaluating Hemi vs BOB.
allowed-tools: Read, Grep, Glob
---

# Hemi Network

Hybrid L2 by Hemi Labs combining Bitcoin and Ethereum. Featured
"superfinality": uses Bitcoin's PoW to provide an additional
finality layer beyond Ethereum's.

## Architecture

- **EVM execution** with Solidity.
- **Anchored to Ethereum** for DA.
- **PoW finality from Bitcoin**: state checkpoints periodically
  committed to Bitcoin chain.
- **Bridge**: Multi-chain bridge to BTC, ETH, and other L2s.

## Superfinality

After Ethereum-style finality, Hemi additionally requires Bitcoin
checkpoint:
- Provides "irreversibility" akin to Bitcoin's beyond Ethereum's.
- Trade-off: longer effective finality time.

## Position

Significant TVL (~$1.2B early 2026), 90+ protocols deployed.
Among the more active "hybrid Bitcoin L2" projects.

## Use cases

- **Cross-chain DeFi**.
- **Apps requiring strongest finality** from both chains.
- **NFT bridges** Bitcoin Ordinals ↔ Ethereum NFTs.

## Limitations

- **Complex security model**.
- **Dual chain dependency**.

## See also

- [bob/SKILL.md](../bob/SKILL.md)
- [merlin/SKILL.md](../merlin/SKILL.md)
- [bsquared/SKILL.md](../bsquared/SKILL.md)
