---
name: bitcoin-dlcs
description: |
  Discreet Log Contracts: smart contracts on Bitcoin via oracle
  attestations + adaptor signatures. Oracle publishes nonces upfront,
  reveals signed outcomes; CETs (Contract Execution Transactions)
  enforce payouts. No on-chain footprint of the contract logic.
  USE WHEN: building betting / prediction markets, parametric
  insurance, derivatives, oracle-driven settlements on Bitcoin.
allowed-tools: Read, Grep, Glob
---

# Discreet Log Contracts (DLCs)

DLCs let two parties bet on real-world outcomes (price, sports, weather)
with on-chain settlement, **without** revealing contract terms on
chain. The oracle never knows about the bet; the chain only sees a
2-of-2 multisig + a CET that looks like an ordinary cooperative spend.

Original 2017 paper: Tadge Dryja. Modern specs: DLC Specification
working group (`github.com/discreetlogcontracts/dlcspecs`).

## Core mechanism

1. **Oracle setup** (one-time):
   - Oracle has long-term key `P_oracle`.
   - For each event, oracle publishes nonce `R_event = k * G` in
     advance.
   - Oracle pledges: when event happens, publishes `s_outcome` such that
     `s_outcome * G = R_event + e_outcome * P_oracle` where
     `e_outcome = H(R_event, outcome_label)`.

2. **Funding** (party setup):
   - Alice and Bob agree on contract: payout function `(outcome → (a, b))`.
   - They pre-sign **all possible CETs** as adaptor signatures over
     each outcome's `T_outcome = R_event + e_outcome * P_oracle`.
   - Together they fund a 2-of-2 multisig output (the funding tx).

3. **Settlement**:
   - Oracle publishes `s_outcome` for the actual outcome.
   - The party favored by that outcome adapts their pre-signed CET
     with `s_outcome` and broadcasts.
   - Settlement happens in a single tx, looking like a generic 2-of-2
     spend on chain.

4. **Refund** (timeout):
   - If oracle never publishes (event canceled), parties can refund
     via a CSV time-locked refund tx pre-signed during funding.

## Why "discreet"

- On chain, an observer sees: funding tx (2-of-2 multisig output),
  settlement tx (a regular spend). No contract terms, no oracle key,
  no payout structure.
- Oracle never learns about the contract. Oracles can serve many
  unrelated DLCs from one event publication.

## Numerical outcomes

For continuous outcomes (e.g., BTC price ∈ [0, 100k]), oracle uses
**multi-nonce attestation**: publishes one `R_i` per bit / digit of
the outcome. Parties pre-sign CETs covering ranges of bit patterns.

CET count grows with precision:
- 0.1% precision over a 100k range → ~1000 CETs.
- Modern DLC libraries use **CET trees** + adaptor combinator tricks
  to compress.

## DLC vs other primitives

| Property | DLC | HTLC | LN PTLC |
|----------|-----|------|---------|
| On-chain footprint | 1 funding + 1 settlement | 1 setup + 1 redeem | LN channel update |
| Oracle/preimage | external oracle attestation | internal preimage | internal point |
| Outcome space | discrete or numerical | binary (revealed/not) | binary |
| Atomicity | enforced via adaptor sigs | enforced via hash | enforced via point |

## Standardization

`github.com/discreetlogcontracts/dlcspecs` defines:
- Funding protocol.
- CET construction.
- Adaptor sig encoding.
- Oracle attestation format.

Wire protocol uses Lightning-style TLV messages over Tor / clearnet.

## Implementations

- **`rust-dlc`** (Crypto Garage) — most complete; production-grade.
  - `rust-dlc-manager` orchestrates funding/CET/refund tx chain.
  - Integrates with `rust-bitcoin`, `bdk`.
- **`dlc-protocol`** (DLC.dev) — Python.
- **`dlc-tools`** — JS/TS utility libs.
- **DLCKit** — Bitfinex's iOS DLC client.

## Use cases

- **Sports betting** — outcome = team A or B wins.
- **Price hedging** — bilateral derivatives on BTC/USD.
- **Parametric insurance** — payout based on weather oracle.
- **Lightning Loop alternatives** — DLC-based off-chain mechanisms.
- **Lava / Atomic Finance** — production DLC apps.

## Operational considerations

- **Oracle availability**: parties must trust the oracle to publish
  the outcome. Multiple oracles → "DLC with k-of-n oracles" combines
  attestations.
- **CET storage**: pre-signed CETs (per outcome) can total megabytes
  of data per contract. Both parties must persist their share.
- **Fee management**: each pre-signed CET has a fixed fee at construction
  time. If mempool fee rates spike, settlement may not confirm.
  Mitigation: CPFP via anchor outputs, RBF if not pre-signed
  immutably, or fee-bump-via-replacement on a per-CET basis.

## Security caveats

- **Oracle compromise** = funds at risk. Use multi-oracle (k-of-n)
  structure for high-value contracts.
- **Replay across CETs** — adaptor points must be unique per outcome
  (built-in via `e_outcome` derivation).
- **Refund path** must always exist; otherwise oracle outage =
  permanent fund lock.

## Common pitfalls

- Underestimating CET storage requirements for fine-grained numerical
  contracts.
- Hard-coding fee rates instead of using anchor outputs / fee bumping.
- Trusting a single oracle for high-value contracts.
- Confusing **DLC oracles** (which are just signers, no chain) with
  **chain oracles** like UMA, Chainlink, etc.

## See also

- [adaptor-sigs/SKILL.md](../adaptor-sigs/SKILL.md)
- [schnorr/SKILL.md](../schnorr/SKILL.md)
- [../../libraries/rust-dlc/SKILL.md](../../libraries/rust-dlc/SKILL.md)
- [../../privacy/atomic-swaps/SKILL.md](../../privacy/atomic-swaps/SKILL.md)
