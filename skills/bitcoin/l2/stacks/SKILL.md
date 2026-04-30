---
name: bitcoin-l2-stacks
description: |
  Stacks: Bitcoin smart contract layer with Clarity language, sBTC
  for native peg, Nakamoto upgrade for fast finality, PoX (Proof of
  Transfer) consensus.
  USE WHEN: building Bitcoin smart contracts, integrating sBTC,
  evaluating Stacks vs RSK / EVM alternatives.
allowed-tools: Read, Grep, Glob
---

# Stacks

Stacks is a Bitcoin Layer 2 for smart contracts. Original 2017
("Blockstack"), launched mainnet 2021. Major upgrade **Nakamoto**
(2024) added near-instant finality and **sBTC**.

## Architecture

- **Separate chain**: Stacks blocks reference Bitcoin blocks.
- **Anchored**: Stacks block hashes committed to Bitcoin via PoX.
- **Smart contracts**: written in **Clarity** (Stacks-specific lang).
- **Native token**: STX (used for fees, governance, staking).
- **Native BTC peg**: **sBTC** — 1:1 BTC-pegged asset on Stacks.

## PoX (Proof of Transfer)

Consensus mechanism:
- Stacks miners burn STX (or send BTC, varies by epoch).
- Miners earn STX block rewards + tx fees.
- Stackers (STX holders who lock for ~2 weeks) earn BTC rewards from
  miner BTC contributions.
- Bitcoin's security secures Stacks via the BTC commitment.

## Nakamoto upgrade

Activated in 2024. Major changes:
- **Sub-second finality** for Stacks-native transactions.
- **sBTC** activation: 1:1 BTC-pegged asset on Stacks via threshold
  signature signers.
- **Bitcoin reorg robustness**: Stacks chain remains stable through
  Bitcoin shallow reorgs.

## Clarity language

Stacks's smart contract language:
- **Decidable** — can analyze contracts statically (no halting
  problem).
- **No re-entrancy** by design (contracts can't call themselves).
- **LISP-like syntax**.
- **Source visible on-chain** (no opaque bytecode).

```clarity
(define-public (transfer (recipient principal) (amount uint))
  (ft-transfer? token amount tx-sender recipient))
```

## sBTC

- Bidirectional Bitcoin peg.
- Threshold signers (n-of-m) sign peg-out releases.
- Peg-in: send BTC to threshold signers' multisig → equivalent
  sBTC on Stacks.
- Peg-out: send sBTC + Stacks tx → BTC released after threshold
  approval.

## Use cases

- **DeFi on Bitcoin**: lending, AMMs, derivatives using sBTC.
- **Stable coins / RWA tokenization**: programmable assets.
- **DAO infrastructure**: governance via Clarity contracts.
- **Bitcoin-native NFTs**: pre-Ordinals NFT scene.

## Major projects

- **ALEX** — DEX/AMM on Stacks.
- **Arkadiko** — stablecoin protocol.
- **STSWAP, Bitflow** — DEX/AMM.
- **CityCoins** (historic, mostly inactive).

## Comparison

| Aspect | Stacks | RSK | Liquid |
|--------|--------|-----|--------|
| Smart contracts | Clarity | EVM | Limited (Elements opcodes) |
| BTC peg | sBTC (threshold) | RBTC (federation + merge mining) | L-BTC (federation) |
| Consensus | PoX | Merge mining | Federation |
| Bitcoin security | Anchored | Inherited via merge mining | Federation only |

## Implementations

- **stacks-node** (Rust) — full node.
- **Stacks.js** — JS / TS SDK for app dev.
- **stacks-py** — Python SDK.
- **Hiro Wallet** — primary wallet.
- **Xverse Wallet** — multi-chain Bitcoin wallet with Stacks support.

## Limitations

- **Threshold signer trust** for sBTC peg-out.
- **Smaller ecosystem** vs Ethereum L2s.
- **Clarity learning curve** (vs Solidity ubiquity).

## See also

- [rootstock-rsk/SKILL.md](../rootstock-rsk/SKILL.md)
- [liquid/SKILL.md](../liquid/SKILL.md)
- [babylon/SKILL.md](../babylon/SKILL.md)
- [bitvm/SKILL.md](../bitvm/SKILL.md)
