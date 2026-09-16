---
name: bitcoin-l2-hemi
description: |
  Hemi Network: hybrid Bitcoin + Ethereum L2 with "superfinality"
  via Bitcoin PoW. Chain TVL under $1M across 44 listed
  protocols (DefiLlama, September 2026), down from a ~$330M
  peak in June 2025.
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

Small and shrinking as of September 2026. DefiLlama put Hemi
chain TVL at ~$0.84M on 16 September 2026; L2BEAT total value
secured was ~$0.80M on 16 September 2026. DefiLlama lists 44
protocols on Hemi, only 13 of them above $10k. That is down
from a DefiLlama peak of ~$330M (June 2025) and ~$14M as
recently as January 2026.

A further ~$42M of native HEMI sits in Hemi Staking; chain TVL
excludes it as the chain's own token (DefiLlama, September
2026). Historically Hemi was among the more active "hybrid
Bitcoin L2" projects through 2025 - treat that framing as
history, not current position.

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
