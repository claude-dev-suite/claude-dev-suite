---
name: bitcoin-l2-map-protocol
description: |
  MAP Protocol: omnichain interoperability layer with Bitcoin
  integration. Cross-chain messaging across many chains; positions
  itself as Bitcoin L2 connector. Butter Bridge V3.1 was exploited
  on 20 May 2026; read the status note before treating it as
  production bridge infrastructure.
  USE WHEN: building cross-chain apps spanning Bitcoin + others.
allowed-tools: Read, Grep, Glob
---

# MAP Protocol

Omnichain interoperability protocol with Bitcoin focus. Provides
cross-chain messaging + bridges including Bitcoin.

## Status (September 2026)

> **Butter Bridge V3.1 exploit, 20 May 2026.** MAP Protocol shut down
> the bridge connecting MAPO ERC-20 on Ethereum to the MAPO mainnet
> after a reported exploit of Butter Bridge V3.1, paused mainnet
> operations, and began a migration to new token contracts. As of
> 15 September 2026 no post-mortem appears on mapprotocol.io or
> docs.mapprotocol.io - neither carries any notice of the incident -
> and MAP's Medium account has published nothing since April 2022.
> Press reporting on 20 May 2026 said the exploit mechanism and the
> extent of losses had not been disclosed.

Press reporting (20-21 May 2026, not confirmed by MAP) describes an
attacker deploying a contract that manipulated an oracle
multisig-signed message to mint roughly a quadrillion MAPO, then
dumping ~1B of them on Uniswap for ~52 ETH (~$180k). Treat those
figures as press-reported, not disclosed. Independent corroboration
of the date does exist: CoinGecko records MAPO's all-time low of
$0.00034224 on 20 May 2026.

The 1:1 swap to new Ethereum and BNB Chain token contracts has since
completed; CoinGecko lists both at
`0x7046933234A82AF77F14625e8d0fA9Bcc5044a7E` as of 15 September 2026,
and mapprotocol.io again advertises live cross-chain traffic. Whether
the Ethereum <-> mainnet bridge itself reopened could not be
independently confirmed.

**Practical stance**: treat MAP primarily as a case study in
light-client/mint-authority bridge design. Do not route value through
it without your own audit of the current MOS/Butter contracts.

## Architecture

- **Light-client based bridges** between MAP-compatible chains.
- **Bitcoin integration**: SPV-style verification for cross-chain
  Bitcoin transactions.
- **Native token**: MAPO.

## Use cases

- **Cross-chain swaps** Bitcoin ↔ EVM chains.
- **Multi-chain dApps**.
- **Asset bridges**.

## Position

Niche player; smaller TVL than dominant L2s. Focus on
interoperability rather than smart-contract execution. As of
15 September 2026 MAPO's market cap is roughly $8M (CoinGecko rank
~#1346) and the price is still well below its pre-exploit level
(~$0.003 reported on 20 May 2026), so the economic security backing
maintainer bonds is correspondingly thin.

## See also

- [bob/SKILL.md](../bob/SKILL.md)
- [hemi/SKILL.md](../hemi/SKILL.md)
- [threshold-tbtc/SKILL.md](../threshold-tbtc/SKILL.md)
