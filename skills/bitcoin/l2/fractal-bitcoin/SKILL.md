---
name: bitcoin-l2-fractal-bitcoin
description: |
  Fractal Bitcoin: a Bitcoin Core-derived scaling chain with ~30s
  blocks and Cadence Mining (part merge-mined with Bitcoin, part
  permissionless, part Index Mining since FIP-101). Mainnet 9 Sept
  2024. FIP-102 / fractald v0.4.0 hard-forked at block 2,100,000,
  combining the first and second FB halvings; the chain passed that
  height before 15 September 2026.
  USE WHEN: building on Fractal, indexing BRC-20 on Fractal,
  reasoning about merge-mined Bitcoin-derived chains.
allowed-tools: Read, Grep, Glob
---

# Fractal Bitcoin

Not a rollup and not a sidechain with a foreign VM: Fractal runs
**Bitcoin Core's own codebase**, retuned. The launch press release
calls it "the only Bitcoin native scaling solution that uses the
Bitcoin Core code itself to recursively scale unlimited layers on
top", claiming "complete consensus consistency with the Bitcoin
network" and "20x increase in capacity per layer".

Mainnet launched **9 September 2024**. Node client is
`fractal-bitcoin/fractald-release`; latest tag as of 15 September
2026 is **v0.4.0**, published 10 August 2026.

| Property | Value |
|---|---|
| Block time | ~30s or less |
| Consensus code | Bitcoin Core derivative |
| Native asset | FB |
| Halving interval | 2,100,000 blocks |
| Core contributor | UniSat team |

## Cadence Mining

Blocks are not all mined the same way. At launch the split was
**1:2, merge-mined : permissionless** — one block in three carries a
merge-mined commitment from Bitcoin miners, the other two are mined
permissionlessly on Fractal itself.

**FIP-101** (created 2025-12-31, status Deployed, activation height
**1,500,000**) changed that split to **1:1:1 — Merged Mining :
Permissionless Mining : Indexing**, introducing a third reward class
for operators of the Fractal Standard Indexing Service. It also
added **Taproot-based non-custodial FB staking**: users stake FB
through Taproot scripts, funds stay under the user's own key, and
stakers can exit or migrate between indexing instances without
operator permission. Index verification and reward settlement are
explicitly kept off the block-production critical path so indexing
cannot stall the chain.

## FIP-102 and the double halving

**FIP-102** (created 2026-07-28, "Native FB on Bitcoin Mainnet"),
implemented by fractald **v0.4.0** as a consensus-tightening hard
fork at block **2,100,000**:

- The first scheduled halving fires at 2,100,000: **25 FB → 12.5 FB**.
- FIP-102 brings the **second** halving forward to the same height:
  **12.5 FB → 6.25 FB**.
- The 6.25 FB that the second halving would have retired is not
  burned — it is redirected to **distribution on Bitcoin mainnet**,
  rolled out progressively over roughly three months.
- Every subsequent reward level is advanced by one 2,100,000-block
  interval. Max supply and allocation are unchanged; only timing is.

Target allocation after activation:

| Path | Share | FB per Fractal block equivalent |
|---|---:|---:|
| Merged Mining | 1/6 | ~2.0833 |
| Permissionless Mining | 1/6 | ~2.0833 |
| Index Mining | 1/6 | ~2.0833 |
| Bitcoin mainnet distribution | 1/2 | 6.25 |
| **Total** | **1** | **12.5** |

The three Fractal-side figures are averages: an eligible block pays
6.25 FB, with one block in each three-block cycle going to each
mechanism.

The Fractal chain tip was at height **2,121,967** on 15 September
2026, so the fork height has been passed and the combined halving is
live. The eligible on-chain interactions and distribution rules for
the Bitcoin-mainnet half are deferred to **FIP-103**, which was not
yet published in `fractal-bitcoin/fips` on that date (the repo held
FIP-30, FIP-101, FIP-102 and FIP-104).

Note the release-notes discrepancy: the v0.4.0 body text says
"Release Date: September 2026" while the GitHub tag was published
2026-08-10. Trust the tag timestamp.

## Upgrade posture

v0.4.0 *tightens* consensus. Older non-mining nodes will keep
following the chain after activation but will not independently
enforce the new rules — a silent-downgrade footgun. Miners and
pools did not need to change mining software; node operators did
need to upgrade.

## Use cases

- **High-throughput BRC-20 / Ordinals indexing** — the reason the
  UniSat team built it, and why FIP-101 pays indexers directly.
- **Merge-mining revenue** for Bitcoin pools at no extra hash cost.
- **Testing Bitcoin Core-compatible logic** at ~30s block times
  against near-identical consensus code.

## Limitations

- **Not secured by Bitcoin.** Only one block in three is
  merge-mined; the permissionless and index blocks are secured by
  whatever hash rate shows up. "Consensus consistency with Bitcoin"
  is about code, not about Bitcoin validating Fractal.
- **No trust-minimised peg** — FB is Fractal's own asset, not BTC.
- **Governance concentration** — FIPs are authored by the "Fractal
  Team" and the reference indexer is UniSat's. FIP-102 rewrote the
  emission schedule mid-flight.
- **Emission changes are frequent** — two consensus hard forks
  (FIP-101, FIP-102) inside nine months. Pin a version and read the
  FIP before assuming a reward number.

## See also

- [counterparty/SKILL.md](../counterparty/SKILL.md)
- [drivechains-spacechains/SKILL.md](../drivechains-spacechains/SKILL.md)
- [liquid/SKILL.md](../liquid/SKILL.md)
- [rootstock-rsk/SKILL.md](../rootstock-rsk/SKILL.md)
