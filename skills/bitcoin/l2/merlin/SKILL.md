---
name: bitcoin-l2-merlin
description: |
  Merlin Chain: Polygon-CDK Bitcoin L2 with EVM and a federation peg;
  its Bitcoin fraud-proof module is still unshipped as of September
  2026. Was the TVL leader in 2024; DeFi TVL is down ~98% from that
  peak as of September 2026.
  USE WHEN: evaluating Merlin for deployment, BTC DeFi.
allowed-tools: Read, Grep, Glob
---

# Merlin Chain

Bitcoin L2 with EVM compatibility. Held the largest TVL among Bitcoin
L2s during 2024; that is no longer true. Two metrics, both DefiLlama,
both 15 September 2026:

| Metric | Value | Peak |
|---|---|---|
| Merlin chain DeFi TVL | ~$9.3M | ~$529M (5 May 2024) |
| Merlin's Seal bridge vault (BTC locked) | ~$410M | ~$2.65B (29 Mar 2024) |

On the same date Stacks (~$79.3M) and Rootstock (~$79.0M) each hold
roughly 8x Merlin's chain DeFi TVL, and BOB (~$10.2M) is ahead of it
too. Bridge-locked BTC and value actually deployed in Merlin DeFi are
not the same number and have diverged by ~40x. DefiLlama tracked 27
protocols on Merlin on that date, 9 of them holding more than $10k.
Re-check before quoting: https://defillama.com/chain/Merlin for chain
DeFi TVL, https://defillama.com/protocol/merlins-seal for the vault.

## Architecture

- **ZK rollup** posting state commitments to Bitcoin.
- **EVM execution**.
- **Federation peg** for BTC bridging.
- **Native token**: MERL.

## Ecosystem

- **DeFi**: lending, AMMs, stable coins.
- **Inscriptions / Ordinals integrations**.
- **Cross-chain bridges** to Ethereum L2s.

## Position

Was the "leading TVL" Bitcoin L2 through 2024, on TVL that was partly
inflated by yield-farming incentives; when the incentives tapered the
TVL left with them. Chain DeFi TVL slid from ~$169M (1 Jan 2025) to
~$9.3M (15 September 2026). The contraction is sector-wide, not
Merlin-specific: over the same window Bitlayer went ~$361M -> ~$0.46M
and BSquared ~$89M -> ~$2.6M (DefiLlama, same dates). Mainnet is still
live and producing blocks — ~4.05s average block time, ~850
transactions logged by 18:49 UTC on 15 September 2026 per the
Blockscout explorer — but at a fraction of its 2024 activity. The
project continues to ship: merlinchain.io was advertising a 45% APR
MERL staking program on 15 September 2026. Critique: heavy reliance
on federation for now, slower path to trust-minimization.

## Use cases

- **BTC yield products**.
- **EVM dApps** with Bitcoin-themed user base.
- **Cross-chain liquidity hubs**.

## Limitations

- **Federation trust** — still the dominant risk: the Merlin's Seal
  vault held ~$410M of BTC on 15 September 2026, orders of magnitude
  more than the chain's own DeFi TVL, and the Bitcoin fraud-proof
  module has not replaced it.
- **TVL was inflated** by mercenary yield-farming users, and the
  2025-2026 drawdown is what that unwinding looks like. Treat any TVL
  or dApp-count figure in this skill as a dated snapshot, not a fact.
- **Thin on-chain liquidity** — 9 protocols above $10k TVL on
  15 September 2026 (DefiLlama). Expect slippage and shallow markets.
- **Centralization concerns** common to early L2s.

## See also

- [bitlayer/SKILL.md](../bitlayer/SKILL.md)
- [bsquared/SKILL.md](../bsquared/SKILL.md)
- [hemi/SKILL.md](../hemi/SKILL.md)
- [bob/SKILL.md](../bob/SKILL.md)
