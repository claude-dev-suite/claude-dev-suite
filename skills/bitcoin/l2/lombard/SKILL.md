---
name: bitcoin-l2-lombard
description: |
  Lombard: LBTC, a cross-chain yield-bearing wrapped BTC issued by a
  10-of-14 institutional notary consortium running a Cosmos appchain
  (the Lombard Ledger), with HSM key custody (CubeSigner) and an
  independent Bascule verification layer. LBTC yield moved OFF
  Babylon staking to a Bitwise covered-call strategy in 2026.
  USE WHEN: integrating LBTC, threat-modelling consortium-issued
  wrapped BTC, evaluating BTC "liquid staking" yield claims.
allowed-tools: Read, Grep, Glob
---

# Lombard (LBTC)

LBTC is, per `lombard-finance/evm-smart-contracts`, "liquid Bitcoin;
it's yield-bearing, cross-chain, and 1:1 backed by BTC". It is a
**consortium-issued wrapped BTC**, not a Bitcoin-enforced construct.

docs.lombard.finance advertised "$3 billion in Bitcoin onboarded"
(cumulative, not outstanding) and integration with "Aave, Morpho, and
50+ DeFi protocols across 10 blockchains" when fetched on 15
September 2026. DefiLlama put Lombard's TVL at ~$906.7M on the same
date — re-check before quoting: https://defillama.com/protocol/lombard

## The yield source changed — read this first

LBTC launched as Babylon-staked BTC and that is how most older
write-ups still describe it. It is no longer true.

| Period | Yield source |
|---|---|
| Launch – 22 July 2025 | Babylon staking; BABY claimed manually in-app |
| From 22 July 2025 | Same source, auto-compounded into the LBTC/BTC rate |
| During 2026 | Transitioned off Babylon to a **covered-call options strategy managed by Bitwise Investment Manager, LLC** |

The docs state a **2.5% net APY target in BTC terms**, explicitly
variable and "not a guarantee". Lombard's docs give only "2026" for
the Bitwise switchover, not a day — do not invent one. Source:
https://docs.lombard.finance/use/lbtc/understanding-yield

The security implication is the point: LBTC yield is now *option
premium sold by a regulated asset manager*, with a short-volatility
risk profile, not PoS staking rewards. A holder is exposed to
capped upside in a sharp BTC rally.

## Architecture

- **Lombard Ledger** — a Cosmos-based appchain running CometBFT,
  operated by the Security Consortium. Every deposit, mint,
  redemption and cross-chain transfer is recorded here *before* any
  token appears on a destination chain.
- **Security Consortium** — 14 institutional members; every action
  needs signatures from **10 of 14** (two-thirds supermajority). Per
  the members page (last updated 26 August 2026): Galaxy, OKX,
  Kraken, DCG (crypto institutions); Amber, Wintermute (market
  makers); Antpool, F2Pool (mining pools); Bitwise Onchain
  Solutions, Figment, Kiln, P2P (validators); Cubist, Nansen
  (security/research).
- **CubeSigner** — keys generated and held inside HSMs; they never
  leave secure hardware. No consortium member, Lombard employee or
  Cubist engineer can extract them.
- **Bascule drawbridge** — an independent verification layer run by
  Cubist. On deposit it confirms the BTC exists before mint; the
  Reverse Bascule confirms LBTC was actually burned before a BTC
  payout is authorised.
- **Bridging** — Chainlink CCIP, requiring authorisation from both
  the Consortium *and* Chainlink.

## Mint / redeem

```
Mint:   BTC to consortium address -> relayer observes -> consortium
        verifies (6 confirmations) -> Bascule confirms -> contract
        mints LBTC
Redeem: burn LBTC -> Ledger records -> Bascule verifies the burn ->
        CubeSigner authorises the BTC payout
```

## Contract surface

From the `evm-smart-contracts` README:

| Contract | Role |
|---|---|
| `Consortium` | notary consortium multi-signature verification |
| `Bascule` | drawbridge, blocks bad mints before they land |
| `LBTC` | the ERC-20 |
| `Bridge` | multi-factor bridge, CCIP as second factor |
| `OFTAdapters` | LayerZero adapters for LBTC |
| `PoR` | Bitcoin address storage with ownership proofs |
| `StakeAndBake` | stake BTC and deposit LBTC to a vault in one tx |
| `PMMs` | swap pools accepting cbBTC, BTCb |
| `BARD` | ERC-20 governance token |

Non-EVM deployments exist too: `sol-svm-contracts`, `sui-move-contracts`.

## Use cases

- **BTC collateral in EVM DeFi** with a yield accrual built into the
  exchange rate rather than a rebase.
- **Cross-chain BTC** without fragmenting liquidity per chain.
- **Custody-adjacent products** — Lombard's docs claim LBTC powers
  Bitcoin products for Ledger, Binance and Bybit users.

## Limitations

- **This is a federation.** 10-of-14 named institutions can mint.
  The threshold is high and the members are reputable, but the trust
  model is closer to wBTC-with-more-signers than to tBTC's random
  group selection or a BitVM bridge.
- **HSM custody is still custody** — CubeSigner prevents key
  *extraction*; it does not prevent a quorum from signing.
- **Yield is directional risk**, not protocol revenue. See above.
- **Bridge dependency** — LBTC on a non-Ethereum chain additionally
  depends on CCIP or LayerZero.
- **Do not describe LBTC as "Babylon liquid staking"** in anything
  written after 2025 without re-checking the yield page.

## See also

- [babylon/SKILL.md](../babylon/SKILL.md)
- [solv/SKILL.md](../solv/SKILL.md)
- [threshold-tbtc/SKILL.md](../threshold-tbtc/SKILL.md)
- [core-dao/SKILL.md](../core-dao/SKILL.md)
