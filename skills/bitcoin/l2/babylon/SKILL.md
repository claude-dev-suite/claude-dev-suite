---
name: bitcoin-l2-babylon
description: |
  Babylon: native BTC staking protocol securing PoS chains. Trustless
  Bitcoin Vaults via BitVM3, integration with Cosmos chains. No
  bridging / wrapping required.
  USE WHEN: building BTC-secured PoS chains, integrating Babylon
  staking, evaluating BTCFi yield options.
allowed-tools: Read, Grep, Glob
---

# Babylon

Bitcoin staking protocol — let BTC holders **stake BTC** to secure
external Proof-of-Stake systems (Cosmos chains, L2s, DA layers)
**without bridging** or wrapping.

Backed by Babylon Labs. Live mainnet for staking. **Trustless Vaults**
via BitVM3 announced August 2025.

## Architecture

- **Native BTC staking**: BTC stays on Bitcoin chain in special
  staking output.
- **Slashable security**: misbehavior on PoS chain → slash via
  pre-signed slashing tx.
- **No custody**: no third party holds the BTC.
- **Self-custodial**: stakers control their keys.

## Mechanism

```
1. BTC holder locks BTC in a Bitcoin staking output (specialized script).
2. Holder signs (off-chain) attestations for blocks on a PoS chain.
3. PoS chain rewards BTC stakers (in PoS chain's native token).
4. If staker double-signs / equivocates → pre-signed slashing tx
   spendable, BTC slashed from staking output.
```

Key: BTC never leaves Bitcoin. Slashing path enforced via Bitcoin
script (CSV + spending conditions).

## Trustless Bitcoin Vaults (BitVM3)

Aug 2025 announcement: BitVM3-based vaults enable BTC liquidity
flow into BTC-secured PoS systems WITHOUT custodian:
- Vault output spendable only via pre-defined BitVM3 contract.
- Slashing or normal redemption follow protocol-enforced paths.
- No federation, no wrapping, no third-party signers.

## Bridge to Cosmos

January 2025 collaboration with **Fiamma**:
- BitVM2-based trustless Bitcoin bridge to Cosmos chains.
- Babylon-secured: Cosmos chain pays BTC stakers; if Cosmos validators
  fail, BTC stakers slash Cosmos validators (not the BTC).

## Use cases

- **BTC staking yield** without giving up custody.
- **Securing new PoS chains** with Bitcoin's economic value.
- **Cross-chain Bitcoin DeFi** without wrapping.

## Status & roadmap

- **Babylon Genesis** mainnet active 2024.
- **Trustless Vaults** announcement Aug 2025.
- **Q2 2026**: deeper integrations with multiple PoS chains.

## Compared to BTC wrapping

| Aspect | Babylon staking | wBTC / tBTC / etc. |
|--------|-----------------|---------------------|
| Custody | Self | Custodian / threshold |
| Bridge tx | Bitcoin only | Cross-chain bridge tx |
| Slashing | Via Bitcoin script | Via centralized authority |
| Fee | Bitcoin tx fee for stake / unstake | Bridge fee + chain fee |
| Yield source | PoS chain's emission | Bridge service fees / DeFi yield |

## Limitations

- **PoS chain dependency** — yield depends on which chain you secure.
- **BitVM3 is new** — early audit phase.
- **Slashing complexity** — staker must understand penalty conditions.

## See also

- [bitvm/SKILL.md](../bitvm/SKILL.md)
- [threshold-tbtc/SKILL.md](../threshold-tbtc/SKILL.md)
- [stacks/SKILL.md](../stacks/SKILL.md)
- [bitlayer/SKILL.md](../bitlayer/SKILL.md)
