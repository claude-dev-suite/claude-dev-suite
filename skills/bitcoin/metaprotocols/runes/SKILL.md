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

## Relay policy: the runestone is an OP_RETURN

Because the whole protocol message rides in an `OP_RETURN`, the
node's `-datacarrier*` policy decides whether an etch, mint or
transfer propagates at all. Core and Knots diverge sharply here.

| | Core <= 29.x | Core 30.0+ | Knots |
|--------|--------|-------|-------|
| `-datacarriersize` | 83 bytes | 100,000 bytes | 83 bytes |
| OP_RETURN outputs/tx | 1 | many | 1 |
| Runestone relayed? | if <= 83 B | yes | never |

**Bitcoin Core 30.0 (October 2025)** raised the `-datacarriersize`
default to 100,000 bytes, applied to the aggregate scriptPubKey size
across all nulldata outputs, and began relaying and mining multiple
`OP_RETURN` outputs per tx. Both still hold in **31.1 (July 2026)**,
where `MAX_OP_RETURN_RELAY` is `MAX_STANDARD_TX_WEIGHT /
WITNESS_SCALE_FACTOR` = 100,000. Size was never the binding
constraint for Runes — a typical mint or single-edict transfer is
tens of bytes — but a many-edict transfer or an etching with a long
name and full `terms` can approach the old 83-byte cap.

**Bitcoin Knots rejects runestones outright, by name.** At
`v29.4.1.knots20260508` (Sept 2026) `-rejecttokens` defaults to 1,
and `IsStandardTx` flags any nulldata output whose second byte is
`OP_13` with the reject reason `tokens-runes` — i.e. exactly the
`0x6a 0x5d` marker above. The 83-byte `MAX_OP_RETURN_RELAY`, the
one-nulldata-output rule (`multi-op-return`) and
`-rejectparasites=1` are also Knots defaults, but `-rejecttokens` is
the one that matters: on a default Knots node no runestone relays,
whatever its size. Operators who want Runes traffic must set
`-rejecttokens=0`.

Consequence: a runestone that your Core node accepts can still stall
if the peers or the miner in front of it run Knots. Check the reject
reason before assuming an encoding bug.

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

- **mempool.space** — decodes runestones inline in the transaction
  view (`shared/ord/rune.utils.ts`); there is no standalone Runes
  browser or `/runes` route, and the REST API exposes no Runes
  endpoints (checked September 2026).
- **UniSat** — wallet + Runes index; UniHexa, its self-custody
  Bitcoin-asset exchange, is still pre-launch as of September 2026 —
  unisat.io marks it "Coming Soon" and links only to a beta host.
- **OKX** — Runes exchange.
- **Xverse** — Runes wallet + mint/portfolio tooling.

Reference impl: ord client (also handles Runes since 0.18.0,
11 April 2024). Latest release as of September 2026: **0.29.0**
(5 August 2026).

**Magic Eden exited Bitcoin (history).** Magic Eden ran the dominant
Ordinals/Runes venue — reported at roughly 80% of Bitcoin
Ordinals/Runes trading volume at its 2023-2024 peak — then wound it
down in 2026 to refocus on Solana. Per its own service-change notice:
Bitcoin marketplace support ended **9 March 2026**, the Bitcoin/Runes
APIs were discontinued **27 March 2026**, and the Magic Eden Wallet
left the app stores **1 April 2026** and shut down fully
**1 May 2026** (keys not exported before then are unrecoverable).
`api-mainnet.magiceden.dev/v2/ord/btc/*` returns
`503 no healthy upstream` as of September 2026 — do not code against
it.

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
