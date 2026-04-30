---
name: bitcoin-metaprotocols-brc-20
description: |
  BRC-20: fungible token standard via JSON inscriptions. Deploy /
  mint / transfer operations. Permissionless and unaudited; large
  ecosystem post-2023.
  USE WHEN: building BRC-20 tooling, evaluating token issuance on
  Bitcoin, comparing with Runes / Taproot Assets.
allowed-tools: Read, Grep, Glob
---

# BRC-20

Token standard defined via JSON inscriptions. Created May 2023 by
@domodata. Originally a "fun experiment", became massive ecosystem.

## Mechanics

Each operation is a JSON inscription:

### Deploy
```json
{
  "p": "brc-20",
  "op": "deploy",
  "tick": "ordi",
  "max": "21000000",
  "lim": "1000"
}
```

`tick` = 4-character ticker (case-insensitive). Once deployed, max
supply fixed.

### Mint
```json
{
  "p": "brc-20",
  "op": "mint",
  "tick": "ordi",
  "amt": "1000"
}
```

Each mint must respect `lim` and total `max`. First-come-first-served
until cap.

### Transfer (two steps)

Step 1: inscribe transfer:
```json
{
  "p": "brc-20",
  "op": "transfer",
  "tick": "ordi",
  "amt": "100"
}
```

Step 2: send the inscription to recipient. Receipt = balance moves.

## State tracking

BRC-20 has **no on-chain validation** — it's an indexer convention.
Each indexer must:
- Watch inscriptions for BRC-20 ops.
- Compute balances per address.
- Validate against `max` / `lim` constraints.

Indexers must agree on rules (otherwise different indexers see
different balances).

## Major indexers

- **OrdiScan** — primary public indexer.
- **UniSat** — wallet + indexer.
- **OKX** — exchange-side.
- **Magic Eden** — marketplace with BRC-20 support.

## Compared to other token standards

| Aspect | BRC-20 | Runes | Taproot Assets |
|--------|--------|-------|----------------|
| Activation | May 2023 | April 2024 (halving) | 2023 |
| Mechanism | JSON inscriptions | Native protocol op_returns | Client-side validation |
| State tracking | Off-chain indexer convention | Native (each rune is a UTXO commitment) | Client-side merkle |
| Efficiency | High overhead | Native, smaller | Smaller |
| Validation rules | Indexer-defined | Protocol-defined | Schema-defined |

Most agree: Runes > BRC-20 in efficiency. BRC-20 is "first-mover"
but architecturally suboptimal.

## Critique

- **Off-chain validation** = consensus uncertainty about what is
  "valid".
- **First-mint-wins** rewards bots over real users.
- **High fees** during deployment / minting frenzies.

## Status

- Active ecosystem; many tokens exist.
- Trading volume on UniSat, OKX, Magic Eden, etc.
- Some migration to Runes underway (similar use cases).

## Use cases

- **Memecoins on Bitcoin**.
- **Loyalty / community tokens** for projects.
- **Trading vehicles** within Bitcoin.

## Common bugs

- Indexer disagreement on edge cases (e.g., simultaneous mints in
  same block, ordering rules).
- Stale balance display when wallet doesn't sync indexer state.
- Two-step transfer: forgetting step 2 (just inscribing transfer
  doesn't move funds).

## See also

- [inscriptions/SKILL.md](../inscriptions/SKILL.md)
- [runes/SKILL.md](../runes/SKILL.md)
- [atomicals/SKILL.md](../atomicals/SKILL.md)
