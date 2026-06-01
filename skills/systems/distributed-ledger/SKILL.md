---
name: distributed-ledger
description: |
  Distributed-ledger / blockchain architecture in general (engine-agnostic):
  when a ledger beats a database, consensus families (PoW/PoS/BFT), L1 vs L2
  (rollups, channels, sidechains), permissioned vs permissionless, UTXO vs
  account models, and the scalability trilemma. Architect-level, not coin-specific.

  USE WHEN: designing/evaluating a blockchain or DLT system in general, "L2",
  "rollup", "zk vs optimistic", "PoS vs PoW", "permissioned ledger", "consortium
  chain", "UTXO vs account", "do we even need a blockchain", token/state design.

  DO NOT USE FOR: Bitcoin-specific work (use the `bitcoin/*` skills); raw
  consensus internals (use `distributed-consensus`); ordinary app data (use
  database / data-intensive skills).
allowed-tools: Read, Grep, Glob
---
# Distributed-Ledger Architecture (general)

Generalizes the Bitcoin-specific `bitcoin/*` skills into engine-agnostic ledger
design. For deep Bitcoin/Lightning specifics, defer to those skills.

## First question: do you actually need a ledger?

A ledger is an **append-only, replicated, tamper-evident** log agreed by
mutually-distrusting parties. Use one only when you genuinely have:
multi-party **lack of trust**, a need for **shared auditable state**, and no
acceptable trusted intermediary. **If a single org controls the data, a normal
(possibly append-only/audited) database is simpler, faster, and cheaper** — most
"blockchain" projects should be databases.

## Consensus family (builds on `distributed-consensus`)

| Family | Sybil resistance | Trade-off |
|--------|------------------|-----------|
| **PoW** | Burn energy | Robust, slow, energy-heavy, probabilistic finality |
| **PoS** | Stake capital | Efficient, fast finality, weak-subjectivity/validator-set concerns |
| **BFT (PBFT/Tendermint)** | Known validator set | Fast deterministic finality, bounded validators → more permissioned |

Permissionless (open validator set) favors PoW/PoS; permissioned/consortium
favors BFT.

## Layering: L1 vs L2

- **L1** = base chain (security + data availability). Scaling it directly hits
  the trilemma.
- **L2** moves execution off L1 while inheriting its security:
  - **Rollups** post compressed data + proofs to L1. **ZK rollups** (validity
    proofs, fast finality, harder to build) vs **optimistic rollups** (fraud
    proofs, challenge window/withdrawal delay).
  - **State/payment channels** (e.g. Lightning) — off-chain bilateral updates,
    on-chain settlement; great for high-frequency payments.
  - **Sidechains** — own security, bridged; weaker guarantees.

## Other decisions

- **Permissioned vs permissionless**: trust model + regulatory needs.
- **State model**: **UTXO** (parallelizable, privacy, harder smart contracts) vs
  **account** (stateful contracts, simpler, sequential nonces).
- **Trilemma**: decentralization / security / scalability — you optimize two;
  L2s are the usual escape valve.
- **Finality**: probabilistic (PoW) vs deterministic/instant (BFT) — affects UX
  and bridge safety.

## Guidance
Single trust domain → database. Multi-party, open → permissionless L1 + L2 for
scale. Known consortium → permissioned BFT chain. High-frequency payments →
channels. Always justify the ledger over a database first.
