---
name: bitcoin-metaprotocols-inscriptions
description: |
  Inscriptions: arbitrary data committed to specific sats via Taproot
  envelope structure. Foundation for BRC-20, recursive inscriptions,
  "Bitcoin NFTs".
  USE WHEN: creating/parsing inscriptions, debugging inscription
  flow, evaluating inscription cost / fee impact.
allowed-tools: Read, Grep, Glob
---

# Inscriptions

Casey Rodarmor's scheme (Jan 2023) for embedding arbitrary data
on Bitcoin via Taproot script-path commitments. Combined with
ordinals, each inscription is "owned by" a specific sat.

## Mechanism

```
1. Construct a Taproot script tree containing an "envelope" leaf:
   OP_FALSE
   OP_IF
       OP_PUSH "ord"
       OP_PUSH 1                ; field 1 = content type
       OP_PUSH "image/png"
       OP_PUSH 0                ; field 0 = body
       OP_PUSH <data chunks>
       ...
   OP_ENDIF
2. Commit to the script tree in a Taproot output.
3. Reveal the inscription via spending that output, using script-path:
   - Witness includes the envelope + control block.
   - Data appears in the witness on chain.
```

The data is "inscribed on" the first sat of the spent input.

## Two-tx pattern

Most inscriptions use a 2-tx pattern:
- **Commit tx**: pay-to-Taproot output committing to envelope.
- **Reveal tx**: spend commit output, revealing inscription in
  witness.

This pattern allows re-use of prior key/script tree.

## Inscription envelope fields

```
field 0: body (the actual data)
field 1: content_type (MIME type)
field 2: pointer (sat offset within UTXO)
field 3: parent (parent inscription ID for relationships)
field 5: metadata (CBOR-encoded)
field 7: metaprotocol (e.g., "brc-20")
field 9: content_encoding (e.g., "br" for brotli)
```

## Recursive inscriptions

Field 6: `delegate` lets one inscription reference content of
another. Forms a graph; saves bytes by re-using inscribed data.

Inscription "scripts" that load JS/SVG/HTML can use
`/r/inscription/<id>` URLs to fetch other inscriptions on-chain.

## Privacy / cost impact

Inscriptions consume **witness space**, which is discounted 4x in
fee accounting. But they still cost real money:
- A 100 KB inscription costs ~25,000 vB ≈ a normal small block-size
  worth of fees.
- Big inscriptions (1+ MB images) can cost equivalent of a typical
  full block.

## Inscription waves

- **Jan 2023**: launch; high fees triggered.
- **May 2023**: BRC-20 wave caused massive fee spike.
- **Q1 2024**: ongoing constant inscription activity.
- **April 2024**: Runes launch (different mechanism, similar effect).

## Use cases

- **Bitcoin NFTs** — JPEG, PNG, SVG, HTML.
- **BRC-20** tokens (covered separately).
- **Recursive apps** — JS/HTML on chain.
- **Provenance** — digital art ownership.

## Status / criticism

Some Bitcoin developers see inscriptions as **chain spam** — using
chain space for non-monetary data. Bitcoin Knots specifically filters
inscriptions in some configurations.

Counterview: inscriptions pay full market fees, are legitimate
tx, and can't be filtered without arbitrary mempool policy that
deviates from consensus.

## Tools

- **ord client** — primary creation/viewing.
- **OrdinalsBot, Gamma.io, Magic Eden** — services for minting +
  marketplace.
- **OrdiScan, mempool.space** — explorers with inscription view.

## Common bugs

- Reveal tx must spend the commit's output; if you spend a different
  output, no inscription is created.
- Sat tracking: ord computes which sat owns the inscription (first
  sat of first input). Mistakes here lose the inscription's
  identity.
- Content too large: many providers reject > a few MB.

## See also

- [ordinals/SKILL.md](../ordinals/SKILL.md)
- [brc-20/SKILL.md](../brc-20/SKILL.md)
- [runes/SKILL.md](../runes/SKILL.md)
- [../../protocol/taproot/SKILL.md](../../protocol/taproot/SKILL.md)
