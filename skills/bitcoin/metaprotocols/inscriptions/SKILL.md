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

## Relay policy: datacarrier / OP_RETURN

In **Bitcoin Core** the `-datacarrier*` options govern `OP_RETURN`
outputs only, so they never applied to inscriptions, which ride in
the **witness**. Knots differs: `-datacarrierfullcount` defaults to 1
there ("Apply datacarriersize limit to all known datacarrier
methods") and its `DatacarrierBytes()` walks the input witness, so
the Knots `-datacarriersize=83` default *does* bear on envelopes
(`v29.4.1.knots20260508`, Sept 2026). Core's defaults changed
materially in **30.0 (October 2025)** and still stand in
**31.1 (July 2026)**:

```
                       <= 29.x      30.0+
-datacarriersize       83 bytes     100,000 bytes (aggregate)
OP_RETURN outputs/tx   1            many (relay + mining)
-minrelaytxfee         1 sat/vB     0.1 sat/vB
-incrementalrelayfee   1 sat/vB     0.1 sat/vB
-blockmintxfee         1 sat/vB     0.001 sat/vB
```

100,000 bytes "effectively uncaps the limit, as the maximum
transaction size limit will be hit first" (30.0 release notes): an
`OP_RETURN` scriptPubKey is non-witness, 4 WU per byte, so 100 KB of
it already blows past the 400,000 WU standard-tx weight limit.

Consequences for metaprotocols:
- `OP_RETURN` is now a relay-viable data channel of effectively
  arbitrary size, and no longer capped at one output per tx. Matters
  most for protocols that encode state there (Runes).
- It does **not** make `OP_RETURN` cheaper than a witness envelope:
  witness bytes cost 1 WU, `OP_RETURN` bytes cost 4 WU, so bulk
  inscription payloads stay ~4x cheaper in the witness.
- Both options still exist and are still settable;
  `-datacarriersize=83` restores the old cap. The removal proposal
  discussed during 30.0 development was dropped — neither option
  carries a deprecation marker as of 31.1 (July 2026).

## Status / criticism

Some Bitcoin developers see inscriptions as **chain spam** — using
chain space for non-monetary data. Bitcoin Knots filters them by
default: at `v29.4.1.knots20260508` (Sept 2026) `-rejectparasites=1`
("refuse to relay or mine parasitic overlay protocols") and
`-rejecttokens=1` are the shipped defaults, alongside
`-datacarriersize=83` and `-minrelaytxfee` of 1 sat/vB.

Counterview: inscriptions pay full market fees, are legitimate
tx, and can't be filtered without arbitrary mempool policy that
deviates from consensus. Core moved its own defaults the other way
(see above); the uncapping merged as PR #32406 on 9 June 2025, four
months before 30.0 shipped on 13 October 2025. The dispute ran
alongside a node-share surge over the same period: Knots went from
~400 reachable nodes in Jan 2025 to a peak of 7,112 on 14 Sep 2025,
and sits at 4,399 — 17.0% of 25,864 reachable public nodes — as of
15 September 2026 (coin.dance). Reachable-node counts are not
sybil-resistant, so read that surge as a signal, not a headcount.

On **Core's chain** this stays **policy, not consensus**: a filtered
tx remains valid and confirms as soon as any miner includes it. That
is no longer true of current Knots builds. BIP-110 ("Reduced Data
Temporary Softfork") invalidates, at the consensus layer, Tapscripts
that execute `OP_IF`/`OP_NOTIF`, pushdata payloads and script-argument
witness items over 256 bytes, and Taproot annexes — which covers the
inscription envelope itself. Its mandatory-signaling window opened on
8 August 2026, the chain split, the minority chain stalled, and the
BIP was marked **Closed** in the BIPs repo days later (bips#2245,
"following a chain split with stalled mining"). It never reached its
55% threshold by signaling; instead it took effect as a flag day at
block 961,640 (30 August 2026), the first block of a separate BLAKE2b
proof-of-work chain, with the data limits running to 1 September 2027.
That change shipped in the `v29.4.1.knots20260508` line (rc1 tagged
21 August 2026; final release 2 September 2026). UTXOs created before
the flag-day height are grandfathered, so inscriptions made earlier
stay spendable there. So as of September 2026: policy on Core's chain,
consensus on the Knots BLAKE2b chain — and those are two different
chains. See [../../core/knots/SKILL.md](../../core/knots/SKILL.md).

## Tools

- **ord client** — primary creation/viewing.
- **OrdinalsBot, Gamma.io** — services for minting + marketplace.
- **Magic Eden** — history: its Ordinals/Runes marketplace closed
  9 March 2026 and the Bitcoin API followed on 27 March 2026.
  `api-mainnet.magiceden.dev/v2/ord/btc/*` returns
  `503 no healthy upstream` as of September 2026 — do not code
  against it.
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
