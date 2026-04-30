---
name: bitcoin-metaprotocols-runes
description: |
  Runes: Casey Rodarmor's UTXO-native fungible token protocol.
  Activated at halving April 2024. Smaller on-chain footprint than
  BRC-20, native validation rules.
  USE WHEN: building Runes apps, comparing with BRC-20 / Atomicals.
allowed-tools: Read, Grep, Glob
---

# Runes

Casey Rodarmor's fungible token protocol for Bitcoin. Activated at
the **2024 halving** (April 2024). Architecturally cleaner than
BRC-20 — uses Bitcoin's UTXO model directly.

## Mechanics

A Rune's state is encoded in `OP_RETURN` outputs called **runestones**:

```
OP_RETURN OP_13 <protocol_message>
```

`OP_RETURN OP_13` (`0x6a 0x5d`) is the Rune protocol marker.

The protocol message is varint-encoded, specifying:
- **Edicts** — transfer instructions (rune ID, amount, output index).
- **Etching** — issuance of new rune.
- **Pointer** — default output for unspecified rune balances.

## Rune ID

Identified by `<block>:<tx_index>` of the etching tx. E.g., `840000:1`
= the 2nd Rune etched at block 840000.

## Etching (issuance)

```
runestone {
    etching {
        rune: "BITCOIN.MAGAZINE",
        symbol: "B",
        divisibility: 8,
        spacers: 1024,            // visual spacing in display
        premine: 1000,           // amount to etcher
        terms {
            cap: 21_000_000,
            amount: 100,         // per-mint amount
            height: [840000, 1000000],   // mintable in this block range
            offset: [0, 525960],          // or relative-time
        }
    }
}
```

## Mint

```
runestone {
    mint: 840000:1,    // mint this rune
}
```

Mint is allowed if:
- The rune has open mint (cap not reached, time/block in range).
- Sender provides enough fee (no specific token gating).

## Transfer

```
runestone {
    edicts: [
        { id: 840000:1, amount: 100, output: 1 },
    ],
}
```

Output 1 receives 100 of rune 840000:1. Rest of rune balance defaults
to "first non-runestone output" or pointer.

## Compared to BRC-20

| Aspect | BRC-20 | Runes |
|--------|--------|-------|
| Architecture | JSON inscriptions | Native UTXO + OP_RETURN |
| Validation | Off-chain indexer | Protocol rules |
| Footprint | High (full inscription) | Low (small OP_RETURN) |
| Multiple ops per tx | No | Yes (multiple edicts) |
| Mint rules | Each indexer agrees | Protocol-defined |
| Bot resistance | Low | Slightly better |

## Indexers

- **mempool.space** — Runes view.
- **UniSat** — wallet + Runes index.
- **OKX** — Runes exchange.
- **Magic Eden** — marketplace.

Reference impl: ord client (also handles Runes since v0.18).

## Use cases

- **Memecoins** (DOG•TO•THE•MOON, RSIC•GENESIS•RUNE, etc.).
- **Loyalty tokens**.
- **Limited issuance assets**.

## Activation impact

April 2024 halving: Runes activated → massive fee spike (Block
840,000 had record mempool congestion). Subsequent weeks of high
fees as etching frenzy continued.

## Trade-offs vs BRC-20

Runes are:
- **More efficient** (smaller footprint).
- **Native** (validation rules are part of protocol, not indexer).
- **Newer** (less ecosystem maturity at launch but fast-growing).

## Common bugs

- Forgetting `pointer` field → defaults can send tokens to wrong
  output.
- Encoding errors in varint payload → tx is silently a no-op for
  Runes.
- Mint outside cap/time → indexer marks invalid.

## See also

- [brc-20/SKILL.md](../brc-20/SKILL.md)
- [atomicals/SKILL.md](../atomicals/SKILL.md)
- [ordinals/SKILL.md](../ordinals/SKILL.md)
- [inscriptions/SKILL.md](../inscriptions/SKILL.md)
