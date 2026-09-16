---
name: bitcoin-l2-core-dao
description: |
  Core (Core DAO): EVM sidechain whose Satoshi Plus consensus elects
  validators from delegated Bitcoin hash power, delegated CORE stake
  and non-custodial CLTV-timelocked BTC stake. Chain ID 1116, 3s
  blocks, 24h election rounds. Latest client v1.0.26 (2 Sept 2026);
  CoreRewardFix hard fork activated 3 Sept 2026.
  USE WHEN: building on Core, implementing non-custodial BTC staking
  or hash-power delegation, evaluating BTCFi yield venues.
allowed-tools: Read, Grep, Glob
---

# Core (Core DAO)

EVM sidechain built as "an evolution of the Geth codebase", borrowing
BSC's throughput work but replacing the consensus engine. The engine
is literally named `satoshi` in `params/config.go` and prints as
`Consensus: Satoshi (proof-of-staked--authority)` — the double hyphen
is verbatim upstream (`params/config.go` line 626, 15 September 2026),
so grep for it accordingly.

Chain parameters, from `coredao-org/core-chain` `params/config.go`
(fetched 15 September 2026):

| Parameter | Mainnet | Testnet2 |
|---|---|---|
| Chain ID | 1116 | 1114 |
| Block period | 3s | 3s |
| Epoch | 200 blocks | 200 blocks |
| Election round | 86400s (24h) | 86400s (24h) |

## Satoshi Plus consensus

Three inputs feed one **hybrid validator score**; the top-scoring
candidates form the validator set for the next round:

- **Delegated PoW** — Bitcoin miners point hash power at Core by
  writing a delegation to an `OP_RETURN` in their Bitcoin coinbase
  transaction. Core verifies the coinbase and its Merkle proof.
- **Delegated PoS** — CORE holders delegate stake to validators.
- **Non-custodial BTC staking** — BTC holders lock coins on Bitcoin
  under a CLTV timelock and delegate the weight to a validator. The
  BTC never leaves Bitcoin and no third party can move it.

Validators are re-elected every round (86400s). Rewards are
distributed per round to validators and to all three delegator
classes.

## Bitcoin light client

Cross-chain reads from Bitcoin are done on-chain, not by an oracle
committee. Per the `core-chain` README the light client is two parts:

1. A **stateless precompiled contract** performing Bitcoin header
   verification, coinbase transaction verification and Merkle proof
   verification.
2. A **stateful Solidity contract** storing Bitcoin block hashes and
   headers.

This is what lets hash-power delegation and BTC-stake delegation be
proven rather than attested.

## Genesis system contracts

Staking logic lives in genesis-deployed system contracts
(`core/systemcontracts/const.go`, master, 15 September 2026):

| Contract | Address |
|---|---|
| `PledgeCandidateContract` | `0x…1007` |
| `StakeHubContract` | `0x…1010` |
| `BTCAgentContract` | `0x…1013` |
| `BTCStakeContract` | `0x…1014` |
| `BTCLSTStakeContract` | `0x…1015` |
| `BTCLSTTokenContract` | `0x…10001` |

`StakeHub` is the router across the three stake types; the `BTCLST*`
pair implements Core's own BTC liquid-staking token on top of
timelocked BTC stake.

## Fork history

From `params/config.go` (`CoreChainConfig`), fetched 15 September
2026. Block-height forks came first, time-based forks after:

| Fork | Activation |
|---|---|
| Zeus | block 8,020,000 |
| Hera | block 12,195,500 |
| Poseidon | block 13,232,049 |
| Berlin / London / Hertz | block 19,537,200 |
| Shanghai / Kepler / Demeter | 2024-11-19 07:00 UTC |
| Athena | 2025-02-03 01:00 UTC |
| Theseus / Cancun | 2025-06-25 08:00 UTC |
| TheseusFix | 2025-07-31 08:00 UTC |
| Luban / Plato / Bohr / Pascal / Prague / Hermes | 2025-11-25 08:00 UTC |
| CoreRewardFix | 2026-09-03 13:00 UTC |

`CoreRewardFix` shipped in client **v1.0.26**, published 2 September
2026; the release notes give the mainnet hard-fork time as
2026-09-03 13:00 UTC. Re-check the tag list before quoting a
"latest version": https://github.com/coredao-org/core-chain/releases

## Position

Core is a sidechain with its own validator set, not a rollup and not
a Bitcoin-enforced L2 — Bitcoin does not validate Core state. What
it genuinely gets from Bitcoin is (a) miner hash power committed via
coinbase `OP_RETURN` and (b) BTC-denominated stake weight, both
verified by the on-chain light client.

Chain DeFi TVL was ~$4.32M on 15 September 2026 (DefiLlama, chain
"CORE"). Note that this is *chain DeFi TVL* and is a different, much
smaller number than BTC delegated to Core validators — do not
conflate them, and re-check both before quoting:
https://defillama.com/chain/CORE

## Use cases

- **Non-custodial BTC yield** — CLTV-locked BTC earns CORE emissions
  without bridging or wrapping.
- **Hash-power monetisation** for mining pools, via coinbase
  delegation with no extra mining work.
- **EVM dApps** wanting BTC-weighted security assumptions.

## Limitations

- **Sidechain trust** — security is the validator set's, not
  Bitcoin's. Delegated hash power influences *who validates*; it
  does not make Core reorg-resistant via Bitcoin PoW.
- **Bridged assets are still bridged** — only the staking path is
  non-custodial. BTC used inside Core DeFi is wrapped like anywhere
  else.
- **Timelock illiquidity** — CLTV-staked BTC is unspendable until
  the locktime, with no early exit. Core's own BTC LST exists
  precisely to paper over this, and reintroduces contract risk.
- **Thin chain-level DeFi** relative to the BTC-staking headline.

## See also

- [babylon/SKILL.md](../babylon/SKILL.md)
- [bitlayer/SKILL.md](../bitlayer/SKILL.md)
- [rootstock-rsk/SKILL.md](../rootstock-rsk/SKILL.md)
- [lombard/SKILL.md](../lombard/SKILL.md)
