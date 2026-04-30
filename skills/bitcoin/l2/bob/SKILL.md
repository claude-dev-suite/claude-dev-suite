---
name: bitcoin-l2-bob
description: |
  BOB (Build on Bitcoin): hybrid Bitcoin/Ethereum L2 using OP Stack
  + Bitcoin security. Bridges to Bitcoin via threshold signatures
  + zk-proofs.
  USE WHEN: building cross-chain Bitcoin/Ethereum apps, evaluating
  BOB hybrid model.
allowed-tools: Read, Grep, Glob
---

# BOB (Build on Bitcoin)

Hybrid L2 combining Bitcoin and Ethereum. Built on **Optimism's OP
Stack** but with Bitcoin-anchored security mechanisms.

## Architecture

- **OP Stack** for execution (Optimistic rollup style).
- **Anchored to Ethereum** for data availability + initial security.
- **Bitcoin anchoring**: state hashes also committed to Bitcoin
  via inscriptions / Taproot commitments.
- **Bridges**: native to Ethereum, with Bitcoin via federation +
  zk proofs.

## Hybrid security

The "hybrid" model means BOB inherits both:
- **Ethereum's** data availability + fraud proofs.
- **Bitcoin's** PoW for state finality (via anchoring).

Trade-off: complex architecture, but potentially stronger long-term
guarantees.

## Use cases

- **Cross-chain DeFi** spanning BTC + ETH ecosystems.
- **Apps that benefit from EVM tooling + Bitcoin anchoring**.
- **NFT bridges** between Ordinals / Ethereum NFTs.

## Comparison

| Aspect | BOB | Citrea | RSK |
|--------|-----|--------|-----|
| Execution | EVM (OP Stack) | zkEVM | EVM |
| Settlement | Ethereum + Bitcoin | Bitcoin only | Bitcoin merge mining |
| Bridge | Multi-asset | BitVM2 | Federation |

## Limitations

- **Complex security model** — harder to audit.
- **Dual-chain dependence** — outages on either Ethereum or Bitcoin
  affect.
- **Smaller community** than EVM-only L2s.

## See also

- [hemi/SKILL.md](../hemi/SKILL.md)
- [bsquared/SKILL.md](../bsquared/SKILL.md)
- [merlin/SKILL.md](../merlin/SKILL.md)
- [botanix/SKILL.md](../botanix/SKILL.md)
