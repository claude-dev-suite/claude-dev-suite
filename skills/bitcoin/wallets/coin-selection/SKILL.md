---
name: bitcoin-coin-selection
description: |
  Coin selection algorithms: branch-and-bound (BnB), knapsack, single
  random draw (SRD), Murch's waste metric, change avoidance. Determines
  which UTXOs to spend for a given target.
  USE WHEN: implementing wallet send flow, choosing which UTXOs to
  consolidate, optimizing fees, designing privacy-preserving selection.
allowed-tools: Read, Grep, Glob
---

# Coin Selection

Coin selection chooses **which subset of available UTXOs** to spend
for a target amount + fee. Trade-offs: fee minimization, privacy,
change-output dust avoidance, UTXO-set hygiene.

## Inputs to the algorithm

- Target amount (`T`).
- Fee rate (`r` sat/vB).
- Available UTXOs `{ (value_i, vsize_when_spent_i) }`.
- Per-output-type vsize constants (P2WPKH ~ 68 vB to spend, P2TR ~ 57 vB).
- Min change amount (dust threshold + small overhead).

## Algorithm 1: Branch and Bound (BnB)

Bitcoin Core's primary algorithm (Murch 2017).

Goal: find a **subset that sums exactly to** `T + fee + change_buffer`,
avoiding change output entirely.

```
branch_and_bound(utxos, target):
  utxos.sort_by(value, descending)
  best = None
  recurse(included=[], remaining=utxos, sum=0):
    if sum > target + threshold: return  # exceed
    if abs(sum - target) <= waste_metric:
      best = included; return
    if remaining empty: return
    # branch: include / exclude next utxo
    recurse(included + [head], tail, sum + head.value)
    recurse(included, tail, sum)
```

Backtracking with pruning. If BnB finds an exact-match solution
(within rounding), no change output needed → **saves the cost of a
change output** (~31 vB for P2WPKH change).

If BnB fails (no exact match), wallet falls back to knapsack or SRD.

## Algorithm 2: Knapsack

Heuristic: iterate UTXOs, include each if it fits, else continue.
Simple but may select more inputs than necessary. Pre-Murch default.

## Algorithm 3: Single Random Draw (SRD)

Randomly draw UTXOs until sum ≥ target + fee. Privacy-friendly: no
heuristic-readable patterns from chain analysis.

```
srd(utxos, target):
  shuffle(utxos)
  selected = []; sum = 0
  for u in utxos:
    selected.push(u); sum += u.value
    if sum >= target + fee_for_count(len(selected)): break
  return selected
```

## Waste metric (Murch)

Defines "best" selection as one that minimizes:
```
waste = excess + change_cost + (input_count - 1) * fee_per_input
```
- `excess` = sum(selected) - target - change.
- `change_cost` = vsize of change output × fee rate (cost of the
  change output) + future cost to spend that change later.

Wallets use this to compare candidate solutions.

## Change avoidance

If sum(selected) is within ~$change_threshold$ of target (typically
~1000 sats above), spend everything as fee instead of creating dusty
change. Algorithmic threshold = `change_cost`.

## UTXO consolidation

When fee rates are low, batch many UTXOs into one output. Saves
future tx fees but reveals on-chain history correlation.
- **Privacy cost**: consolidates the chain-analysis cluster into
  one identifiable cluster.
- **Mitigation**: use **CoinJoin** before consolidation, or
  consolidate within a single account that's already correlated.

## Privacy-aware selection

Heuristics chain analysts use:
- **Common Input Ownership Heuristic** — multiple inputs in one tx
  likely owned by same entity. Mitigation: include only one UTXO per
  tx when feasible.
- **Round-amount payment heuristic** — round payment outputs are likely
  the recipient. Mitigation: avoid round amounts.
- **Same-script-type clustering** — tx with all P2WPKH inputs from
  one wallet style. Mitigation: vary script types across wallets.

Privacy-focused wallets (Wasabi, Sparrow with PayJoin) use SRD to
avoid heuristic-friendly patterns.

## Implementations

| Wallet | Algorithm |
|--------|-----------|
| Bitcoin Core | BnB primary, SRD fallback, knapsack legacy |
| BDK | BnB + SRD configurable |
| Sparrow | BnB + SRD + privacy-aware |
| Wasabi | Privacy-first with random draws + CoinJoin pre-step |

## Common bugs

- Selecting the largest UTXO regardless of need → big change output,
  high fees.
- Not accounting for fee rate when computing the target → underpaid
  fee → tx stuck.
- Treating dust outputs (< 546 sats P2PKH, < 294 sats P2WPKH) as
  spendable in the future → unspendable, just dead weight.
- Forgetting that change output adds vbytes (~31 P2WPKH change ≈ 124 WU).

## See also

- [fee-estimation/SKILL.md](../fee-estimation/SKILL.md)
- [rbf-cpfp/SKILL.md](../rbf-cpfp/SKILL.md)
- [../privacy/coinjoin/SKILL.md](../../privacy/coinjoin/SKILL.md)
