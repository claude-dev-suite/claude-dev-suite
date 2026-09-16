---
name: bitcoin-l2-botanix
description: |
  Botanix: RETIRED EVM-compatible Bitcoin L2 using "Spiderchain"
  architecture (federated multisig rotated by orchestrators). stBTC
  native staking. Mainnet 1 July 2025; wind-down announced 5 June 2026.
  USE WHEN: studying Spiderchain federation rotation as a design, or
  explaining why Botanix is no longer a deployment target.
allowed-tools: Read, Grep, Glob
---

# Botanix

> **RETIRED.** Botanix Labs announced the wind-down of the Botanix
> network on 5 June 2026; the wind-down was staged from 1 July 2026,
> with final network shutdown scheduled no later than 1 August 2026. Not
> a deployment target. Everything below describes the network as it
> operated between mainnet launch (1 July 2025) and the wind-down.

Bitcoin L2 with EVM compatibility and a novel **Spiderchain**
architecture for federation rotation.

## Status (as of September 2026)

- **Wind-down announced** 5 June 2026 in the official post "Winding
  Down Botanix: What We Built, and Why We're Stopping".
- **Withdrawal deadline**: the botanixlabs.com banner reads "Botanix is
  shutting down on July 1, 2026 ... Please withdraw your assets before
  this deadline." The post gives a staged plan: target 1 July 2026, a
  two-week grace period to 15 July, then if needed two more weeks to
  **1 August 2026**, "when the final shutdown of the network occurs".
- **After shutdown**: "the federation will sweep the remaining Bitcoin
  and the company starts its dissolving process"; capital return was
  expected to run into October 2026. Secondary press (Decrypt,
  crypto.news, cryptotimes.io) reported a 9 July 2026 cutoff and that
  non-BTC tokens become permanently unrecoverable - neither statement
  appears in the official post.
- **Not a technical or security failure.** The post claims "a year of
  mainnet operation with one hundred percent uptime and zero security
  incidents", 25 million transactions and 200,000 wallets across the
  mainnet year (July 2025 - 2026), after nearly four years of building.
  The reasons given are demand-side: mistiming the Bitcoin community's
  appetite for L2 utility, token-incentive bootstrapping no longer
  working, and wrapped BTC on an existing L2 such as Arbitrum being
  sufficient for most Bitcoin DeFi demand.
- **docs.botanixlabs.com is stale**: it still reads as a live network
  with a forward roadmap. Do not treat it as evidence the chain runs.

## Spiderchain architecture

- Federation multisig periodically rotates.
- Each "spider" is a federation slice with its own multisig.
- BTC distributed across multiple spiders for redundancy.
- Trust assumption: at least one spider's quorum honest.

## EVM

Standard EVM execution. Solidity contracts were deployable unchanged.

## Native token

- **stBTC**: staked BTC, earned Botanix-native yield.
- **BTC** bridged 1:1.

## Position

Mid-tier Bitcoin L2 from mainnet (1 July 2025) to the wind-down
announced 5 June 2026. Smaller TVL than Merlin but distinguished by the
Spiderchain design. As of September 2026 it is of architectural
interest only.

## Use cases (historical, 2025-2026)

- **EVM DeFi** on Bitcoin.
- **stBTC yield** for staked BTC.
- **Cross-bridge ecosystem**.

## Limitations

- **Spiderchain rotation** still implies federation trust per
  rotation cycle.
- **Newer ecosystem** vs Stacks / RSK - and never deep enough to
  sustain the chain. Press coverage of the June 2026 wind-down
  (crypto.news; news.bitcoin.com, "Botanix Pulls Plug on Bitcoin L2
  After 4 Years as Fee Income Falls Short", 10 June 2026) attributes it
  to activity and fee revenue that did not cover long-term operating
  costs; the official post frames the same outcome in demand-side terms.

## See also

- [bitlayer/SKILL.md](../bitlayer/SKILL.md)
- [hemi/SKILL.md](../hemi/SKILL.md)
- [bob/SKILL.md](../bob/SKILL.md)
- [merlin/SKILL.md](../merlin/SKILL.md)
