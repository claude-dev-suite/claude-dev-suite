---
name: bitcoin-l2-solv
description: |
  Solv Protocol: SolvBTC / xSolvBTC tokenized Bitcoin distributed
  across many chains, custody behind Safe multisigs with a Vault
  Guardian and FROST signing partners. Migrated bridging from
  LayerZero to Chainlink CCIP on 7 May 2026. BRO Vault incident,
  5 March 2026: 38.0474 SolvBTC (~$2.7M), fully compensated.
  USE WHEN: integrating SolvBTC, threat-modelling multi-chain
  wrapped BTC, reviewing BTCFi custody incidents.
allowed-tools: Read, Grep, Glob
---

# Solv Protocol (SolvBTC)

SolvBTC is a tokenized, yield-bearing Bitcoin asset deployed across
many chains. Solv is the same team that authored the **ERC-3525**
semi-fungible token reference implementation, and its repo set shows
SolvBTC contracts well outside EVM — `SolvBTC-Solana-Contract`,
`SolvBTC-Stellar-Contract`, `SolvBTC-SUI-Interface`.

`xSolvBTC` is the yield-bearing variant; plain `SolvBTC` is the
transferable base asset.

Figures from Solv's own 7 May 2026 announcement: **$700M+ in
tokenized Bitcoin across SolvBTC and xSolvBTC**, **$2.8B total
managed assets**. DefiLlama put Solv Protocol TVL at ~$577.3M on
15 September 2026. Those are different metrics measured on different
dates; do not blend them. Re-check:
https://defillama.com/protocol/solv-protocol

## Custody and signing

- **Solv Vault Guardian** — a Safe (Gnosis) *Guard* contract. It
  "exclusively permits Safe Wallet with multiple signatures to
  execute operations within a defined range", i.e. the multisig is
  constrained to a whitelisted action set even when a quorum signs.
- **FROST multi-sig partners** — Solv announced institutional FROST
  signing partners on 30 March 2026. FROST gives threshold Schnorr
  signing that looks like a single key on-chain; see
  [cryptography/frost](../../cryptography/frost/SKILL.md) for the
  protocol itself.
- **Antalpha** partnership for SolvBTC security (per the SolvBTC
  repo README).

## Cross-chain

On **7 May 2026** Solv migrated SolvBTC and xSolvBTC bridging from
**LayerZero to Chainlink CCIP** across all supported chains,
deprecating the LayerZero bridges on Corn, Berachain, Rootstock and
TAC. Stated rationale: cross-chain bridges "remain one of the most
sensitive and high-risk areas in DeFi".

Practical consequence: SolvBTC balances on two different chains are
not the same object, and a bridge compromise on the minority chain
is a mint vector. Always check which bridge a given deployment is
behind before treating SolvBTC as fungible across chains.

## BRO Vault incident, March 2026

Solv's own post-incident review (published 30 March 2026) states:

- Identified and contained **5 March 2026**.
- Loss: **38.0474 SolvBTC**, approximately **$2.7M** at the time.
- Affected two participants in a **single BRO Vault deployment** —
  a standalone, non-public vault created for the Solv Token listing,
  not part of the standard product suite. No other products or user
  funds were affected.
- Stated cause is process, not mechanism: "the BRO Vault had not
  been subject to the same level of operational process and security
  rigor". **The report does not disclose the technical
  vulnerability.** Third-party write-ups calling it a
  "double-minting" bug are going beyond the primary source — do not
  repeat that label as fact.
- **100% of losses compensated as of 9 March 2026.**
- Remediation: external audit review required for all contract
  deployments, plus formal risk assessment and change-management
  approval.

Source:
https://solvfinanceblog-bwpvl.wpcomstaging.com/post-incident-review-bro-vault-incident-and-strengthened-security-commitments/

The transferable lesson matches the rest of this group: the Bitcoin
side of a wrapped-BTC product is rarely what breaks. Peripheral
deployments that inherit the brand but not the review process are.

## Use cases

- **BTC exposure inside DeFi on chains with no native BTC bridge.**
- **Yield aggregation** — xSolvBTC routes to whatever strategy Solv
  is running, so diligence is on the strategy, not the token.
- **Institutional rails** via the Safe + Guardian + FROST stack.

## Limitations

- **Custodial in substance.** A Safe multisig with a Guard is a
  policy-constrained federation. Bitcoin enforces nothing here.
- **Strategy opacity** — "yield-bearing" hides what is actually
  generating the yield; that is where the risk lives.
- **Per-chain divergence** — many deployments, many bridges, varying
  maturity.
- **Incident precedent** — the March 2026 loss was small and fully
  compensated, but it happened in a deployment outside the audited
  process. Ask which process a given vault went through.

## See also

- [lombard/SKILL.md](../lombard/SKILL.md)
- [babylon/SKILL.md](../babylon/SKILL.md)
- [threshold-tbtc/SKILL.md](../threshold-tbtc/SKILL.md)
- [rootstock-rsk/SKILL.md](../rootstock-rsk/SKILL.md)
