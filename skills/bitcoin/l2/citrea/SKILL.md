---
name: bitcoin-l2-citrea
description: |
  Citrea: first ZK-rollup on Bitcoin (mainnet 27 Jan 2026), zkEVM,
  BitVM2 trustless bridge, ctUSD stablecoin, native BTC lending.
  USE WHEN: building zkEVM apps on Bitcoin, integrating with Citrea,
  evaluating ZK rollups vs sidechains.
allowed-tools: Read, Grep, Glob
---

# Citrea

The first zero-knowledge rollup on Bitcoin. Mainnet activated **27
January 2026**. zkEVM execution + BitVM2-based bridge.

Repo: `citrea.xyz`.

## Architecture

- **Off-chain execution**: Citrea sequencer runs an EVM (Solidity-
  compatible) and processes transactions off-chain.
- **State commitments**: validity proofs (ZK-SNARKs) posted to
  Bitcoin.
- **Data availability**: tx data also committed to Bitcoin (full
  rollup, not validium).
- **Bridge**: Clementine, BitVM2-based, **trust-minimized** (does not
  require federation trust for peg-in/out). **Fixed denomination**:
  exactly 10 BTC in / 10 cBTC out per operation (Citrea docs, as of
  September 2026).

## ZK proof system

zkEVM type-2 (compatible with Ethereum bytecode at gas cost of
running on Citrea). Validity proof posted with each batch.

## BitVM2 bridge

Clementine is the canonical bridge. Trust-minimized peg out via
BitVM2:
- Optimistic challenge model: peg-out claims posted; anyone can
  challenge.
- Challengers can dispute fraud and reclaim funds; honest claims pay
  out after challenge window.
- No federation key custody — bridge security derives from
  game-theoretic + ZK proof properties.
- Peg-out trust reduces to **1-of-N honesty**: one honest signer, one
  honest watchtower or one rational challenger is enough.

### Fixed 10 BTC denomination

Clementine is usable **only at a fixed size**: each deposit moves
exactly 10 BTC and mints 10 cBTC; each withdrawal burns exactly 10
cBTC and pays out ~10 BTC net of fees. There are no partial or custom
amounts — bridging 40 BTC means four separate 10 BTC deposits. This
comes from the pre-signed BitVM2 transaction graph, not a policy knob
(Citrea docs, as of September 2026).

Anything below 10 BTC does **not** go through Clementine at all;
Citrea's own docs route those users to third-party cross-chain swaps
(Symbiosis, Atomiq Exchange — the latter also with a Lightning route),
which carry ordinary AMM/liquidity trust and slippage, not Clementine's
security model.

## Native features

- **ctUSD**: native Citrea stablecoin, **issued by MoonPay and
  powered by M0** (announced 15 January 2026) — 1:1 USD, backed by
  cash and short-term US T-bills. It is a permissioned, compliance-
  gated asset, not a protocol-native one. MoonPay fiat on/off-ramps
  went live 19 August 2026 across 124 countries plus most of the US;
  excluded as of that date: New York, Colorado, the US Virgin
  Islands, Canada, the UK and the EEA.
- **BTC lending**: native protocols using bridged BTC.
- **EVM apps**: any Ethereum dApp can deploy on Citrea (with minimal
  modifications).

## Compared to other Bitcoin L2s

| Aspect | Citrea | Stacks | RSK | Liquid |
|--------|--------|--------|-----|--------|
| Smart contracts | EVM | Clarity | EVM | Limited |
| Bridge | BitVM2 (trustless) | Threshold | Federation | Federation |
| Settlement | Validity proofs | Anchored | Merge mining | Federation |
| Maturity | 2026 mainnet | 2024 Nakamoto | 2018 | 2018 |
| TVL (early) | low | medium | medium | medium |

## Status (as of September 2026)

- Mainnet active since 27 January 2026.
- Clementine processed **~150 BTC cumulative bridging volume** in its
  first six months of production (Citrea blog, 4 August 2026) — small
  in absolute terms; Citrea attributes the volume to institutional
  partners, consistent with the 10 BTC denomination.
- ctUSD live since launch; supply peaked above 24M with a $6M+
  baseline (Citrea blog, 19 August 2026).
- CTR, the governance/coordination token, launched 26 May 2026.
- Citrea is working on a **BitVM3**-based Clementine redesign to cut
  operator collateral and simplify the protocol; a technical write-up
  was still pending as of 4 August 2026.
- Validator/sequencer set: limited at launch, decentralizing over
  time.

## Limitations

- **New** — limited audit history; bugs likely in early phase.
- **Sequencer centralization** at launch (typical for early ZK
  rollups).
- **BitVM2 challenge windows** add latency to operator reimbursement
  (~1.5 days per Citrea docs, as of September 2026) — the *user* is
  paid immediately by the optimistic or operator payout; it is the
  operator's capital that is locked.
- **10 BTC granularity** puts the canonical bridge out of reach for
  retail-size flows, which must fall back to third-party swap venues.

## Use cases

- **DeFi on BTC** with EVM tooling.
- **Stable coins** (ctUSD).
- **Cross-chain bridge** to Ethereum L2s.
- **Long-term**: settlement layer for higher-frequency apps.

## Implementations

- **citrea-node** — Rust full node.
- **MetaMask compatible** with custom RPC.
- **ethers.js, web3.js** work out of the box.

## See also

- [bitvm/SKILL.md](../bitvm/SKILL.md)
- [strata/SKILL.md](../strata/SKILL.md)
- [bsquared/SKILL.md](../bsquared/SKILL.md)
- [babylon/SKILL.md](../babylon/SKILL.md)
- [stacks/SKILL.md](../stacks/SKILL.md)
