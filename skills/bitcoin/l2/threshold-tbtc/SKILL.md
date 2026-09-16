---
name: bitcoin-l2-threshold-tbtc
description: |
  Threshold Network (tBTC): federated BTC bridge to Ethereum/EVM
  chains with t-of-n threshold signers, random group selection.
  USE WHEN: bridging BTC to Ethereum DeFi, evaluating tBTC vs wBTC.
allowed-tools: Read, Grep, Glob
---

# Threshold Network (tBTC)

Decentralized BTC-pegged token on Ethereum-compatible chains. Uses
**threshold signatures** with **randomly selected signers** rather
than single custodian (like wBTC) or fixed federation.

## Architecture

- **Random signing groups** of 100 nodes, drawn by sortition from the
  staked operator pool.
- **t-of-n threshold ECDSA** — 51-of-100. `EcdsaDkgValidator.sol` in
  keep-network/keep-core pins `groupSize = 100`, `groupThreshold = 51`,
  `activeThreshold = 90`; those constants are unchanged on `main` as of
  September 2026.
- **Slashing**: malicious nodes lose stake.
- **Native token**: T (Threshold).

## Peg-in (BTC → tBTC)

1. User submits SPV proof of BTC deposit to Ethereum tBTC contract.
2. Random signing group verifies, mints tBTC.
3. tBTC = ERC-20 on Ethereum, redeemable 1:1 for BTC.

## Peg-out (tBTC → BTC)

1. User submits redemption request on Ethereum.
2. Signing group signs BTC release tx.
3. BTC sent to user.

## Compared to wBTC

| Aspect | tBTC | wBTC |
|--------|------|------|
| Custody | Decentralized signers | BitGo (single custodian) |
| Trust | Threshold + slashing | Trust BitGo |
| Decentralization | Higher | Centralized |
| Status | Live | Live |
| TVL | ~$333M | ~$8.8B |

TVL figures are DefiLlama, 16 September 2026: wBTC is roughly 27x tBTC.

## Compared to BitVM-based bridges

| Aspect | tBTC | BitVM2 (Citrea) |
|--------|------|-----------------|
| Verification | Threshold signers | Optimistic challenge |
| Liveness | Signers must be online | Challengers must be online |
| Withdrawal time | Quick (signing) | 24+ hours challenge window |
| Audit complexity | Standard | Complex |

## Downstream: Mezo

**Mezo**, the Bitcoin-first chain from the same shop (Thesis),
mainnet 28 May 2025, is a significant tBTC consumer: it bridges BTC
in over tBTC, uses BTC for gas, and collateralises its MUSD CDP
stablecoin with it. Two DefiLlama figures for scale, both
15 September 2026 — tBTC protocol ~$336.0M, Mezo chain ~$71.7M (not
all of which is tBTC). So tBTC's signer assumptions now sit
underneath a stablecoin as well as under EVM DeFi positions. See
[mezo/SKILL.md](../mezo/SKILL.md).

## Use cases

- **Bringing BTC to Ethereum DeFi** (lending, AMMs).
- **Cross-chain composition** between BTC + EVM ecosystems.
- **Collateral for Bitcoin-native credit markets** (Mezo / MUSD).

## Limitations

- **Threshold trust** — though distributed, still trust-based.
- **Random group rotation** complexity.
- **Smaller TVL** than wBTC despite better decentralization (UX).

## See also

- [babylon/SKILL.md](../babylon/SKILL.md)
- [bitvm/SKILL.md](../bitvm/SKILL.md)
- [bsquared/SKILL.md](../bsquared/SKILL.md)
- [mezo/SKILL.md](../mezo/SKILL.md)
- [lombard/SKILL.md](../lombard/SKILL.md)
