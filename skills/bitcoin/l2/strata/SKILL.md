---
name: bitcoin-l2-strata
description: |
  Strata by Alpen Labs: ZK rollup on Bitcoin, glock (garbled lock) bridge,
  EVM-compatible execution. Emerging Bitcoin L2 in 2025-2026.
  USE WHEN: evaluating Strata for deployment, comparing with Citrea.
allowed-tools: Read, Grep, Glob
---

# Strata (Alpen Labs)

ZK rollup on Bitcoin developed by Alpen Labs. Aims to be a flexible
execution environment with EVM compatibility and a trust-minimized
bridge to Bitcoin.

Naming note (as of September 2026): Alpen Labs now splits the stack in
two. **Alpen** is the EVM-compatible execution rollup; **Strata** is the
lightweight orchestration layer that anchors state to Bitcoin and hosts
the enshrined **Strata bridge**. Older material that calls the whole
rollup "Strata" predates this split.

## Architecture

- **Off-chain execution** (zkEVM-style, Reth-based).
- **Validity proofs** committed to Bitcoin via Strata checkpoints.
- **Glock (garbled lock) bridge** for trust-minimized peg-in/out,
  1-of-N honest-operator trust model.
- **Sequencer** for ordering txs (initially centralized, decentralizing).

## Status

- Active development; testnet phases through 2025-2026.
- **Testnet III** live on Bitcoin **signet** since 28 July 2026, with
  21+ launch partners; Stakely and Chainflow run independent bridge
  operators alongside Alpen Labs.
- Mainnet: **not launched as of September 2026**; docs still state
  mainnet support is "planned for a future release".
- Comparable goals to Citrea but distinct implementation choices.

## Bridge design history

- 2024-2025: Alpen built and published a **BitVM2**-style bridge design
  (the original "Strata bridge" post, December 2024).
- July-August 2025: Alpen announced **Glock** (garbled circuit-based
  script locks) and reoriented to it, citing BitVM2's transaction cost,
  design complexity and ~5 BTC operator stake as unfixable within that
  paradigm.
- 7 May 2026: Alpen announces **Mosaic** - the production fault-proof
  verifier that realizes Glock (eprint 2026/812, received April 2026,
  revised July 2026; github.com/alpenlabs/mosaic).
- July 2026: Testnet III ships the glock-based bridge, which Alpen
  describes as the first publicly usable garbled-circuit verifier for
  Bitcoin applications.

The BitVM2 Take/Assert/Disprove flow is therefore **superseded** for
Strata; Alpen's own 2024 bridge post now carries a historical-note
banner saying so.

## Use cases

- **DeFi**: Solidity contracts on Bitcoin.
- **Cross-chain bridges** for assets.
- **High-throughput payment apps** that need EVM-style programmability.

## Comparison

| Aspect | Strata | Citrea | BSquared |
|--------|--------|--------|----------|
| Status | Testnet III on signet (Jul 2026); no mainnet as of Sep 2026 | Mainnet (Jan 2026) | Mainnet (Apr 2024) |
| ZK system | zkVM | zkEVM type-2 | zk + optimistic hybrid |
| Bridge | Glock / Mosaic garbled locks (2026) | BitVM2 | Federation + zk |
| Backing | Alpen Labs | Citrea team | B² Network |

BSquared status re-checked 16 September 2026 against the B² mainnet
RPC (`rpc.bsquared.network`): chain ID 223, genesis block timestamp
15 April 2024, still producing blocks.

## See also

- [citrea/SKILL.md](../citrea/SKILL.md)
- [bsquared/SKILL.md](../bsquared/SKILL.md)
- [bitvm/SKILL.md](../bitvm/SKILL.md)
- [bitlayer/SKILL.md](../bitlayer/SKILL.md)
