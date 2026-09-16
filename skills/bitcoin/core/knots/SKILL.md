---
name: bitcoin-knots
description: |
  Bitcoin Knots: Luke Dashjr's Bitcoin Core fork with stricter mempool
  policy and additional configuration. Since the 2026 BIP-110 and
  BLAKE2b hardforks it is also a separate consensus network, not only a
  policy downstream. Differences vs Core, when to consider,
  compatibility.
  USE WHEN: evaluating Knots for stricter mempool policy, reviewing a
  node deployment that uses Knots, understanding policy and consensus
  divergence between Core and Knots.
allowed-tools: Read, Grep, Glob
---

# Bitcoin Knots

Bitcoin Knots is a fork of Bitcoin Core maintained primarily by Luke
Dashjr. It applies a series of patches on top of each Core release,
historically focused on **mempool / standardness policy**, additional
options, and stricter defaults.

> **As of September 2026 this is no longer only a policy fork.** Current
> Knots releases carry consensus changes — BIP-110 (RDTS) and a BLAKE2b
> proof-of-work hardfork — and follow a different chain from Bitcoin
> Core. See [Consensus rules](#consensus-rules-policy-only-until-2026)
> before deploying anything.

## Key differences from Core

### Mempool policy

- **Stricter standardness** for what can be relayed:
  - `OP_RETURN` / datacarrier: `-datacarriersize` defaults to 83
    bytes of `scriptPubKey` (`MAX_OP_RETURN_RELAY` in
    `src/policy/policy.h` at `v29.4.1.knots20260508`), and only one
    nulldata output per tx is relayed (`multi-op-return` reject).
    Bitcoin Core 30.0 (October 2025) raised its own default to
    100,000 and relays multiple nulldata outputs, so this is now the
    widest policy gap — see
    [Relay policy since 30.0](../operations/SKILL.md#relay-policy-since-300).
    Knots' own 83 is a raise from 42, made in `v29.2.knots20251110`
    (2025-11-10) and described in those release notes as temporary,
    to be "reverted back to 42 in a future version".
  - More aggressive filtering of inscriptions / non-standard tx
    patterns by default.
- **`-rejectparasites` and similar flags** to refuse to relay txs
  Luke considers spam (in particular Ordinals/inscriptions in some
  configurations). These are **on by default** in current releases, not
  opt-in: `src/policy/policy.h` at `v29.4.1.knots20260508` has
  `DEFAULT_REJECT_PARASITES{true}`, `DEFAULT_REJECT_TOKENS{true}`,
  `DEFAULT_PERMIT_BAREMULTISIG{false}` and
  `DEFAULT_PERMITBAREDATACARRIER{false}`. `-rejecttokens` was flipped to
  default-on in `v29.4.1` and also detects Counterparty transactions.

### Additional options

Some options exist in Knots but not Core (e.g., specific spam-filter
heuristics, more granular feature toggles). Always cross-reference
the Knots docs for the version in use.

### Consensus rules: policy-only until 2026

**Historically (through `v29.3.knots20260210`, 2026-02-10)** Knots did
*not* modify consensus. A Knots node validated the same blockchain as a
Core node, and the two diverged only at the **mempool** / relay layer:
- A tx accepted by Core's mempool may be rejected by Knots and vice
  versa.
- A miner using Knots may exclude txs Core would have included, and
  produce blocks Core nodes still accept.

That still describes the *policy* delta, but it is no longer the whole
picture. Two consensus changes landed in 2026:

- **BIP-110 "Reduced Data Temporary Softfork" (RDTS)** shipped in
  `v29.3.knots20260508` (2026-05-09). Enforcement was opt-in in that
  release — it required `consensusrules=rdts` in `bitcoin.conf` or a
  GUI confirmation — and a non-RDTS build of the same version was
  published as `v29.3.knots20260507` (2026-05-08). BIP-110 signals on
  version bit 4 with a 1109/2016 (55%) threshold, and makes blocks that
  do not signal bit 4 invalid across blocks 961632-963647. The RDTS
  consent requirement was removed again in `v29.4.1` (knots#362).
- **A BLAKE2b proof-of-work hardfork** shipped in
  `v29.4.1.knots20260508` (2026-09-02). Its release notes state that
  mitigating the situation "requires a backward-incompatible protocol
  change", and list a BLAKE2b PoW algorithm, a temporary 800 kWU block
  weight limit (~300 kB), RDTS activation at the PoW-change flag day,
  and fixes for CVE-2013-2292 / CVE-2020-14199 / CVE-2017-12842.

What happened in practice: at block 961,632 (2026-08-08) AntPool mined
the first non-signaling block. The main network accepted it; BIP-110
nodes rejected it and followed a minority chain that produced two blocks
in roughly eight hours while the main chain advanced 48, then stalled —
only 2.53% of blocks had signaled bit 4 over the preceding two weeks,
against the 55% threshold. BIP-110 was marked **Closed** in the BIPs
repo on 2026-08-09. Per bitcoinknots.org, BLAKE2b then activated as a
flag day at block 961,640 of the Knots chain (2026-08-30), with the RDTS
data limits running to 2027-09-01.

> **Running a current Knots release means following a different chain,
> under a different proof-of-work algorithm.** As of September 2026 that
> is a hard fork, not a configuration preference. Builds are identified
> by their date suffix, not their base version: everything up to and
> including `v29.3.knots20260210` (2026-02-10), plus the non-RDTS
> `v29.3.knots20260507`, still validates the same chain as Bitcoin Core.
> RDTS enforcement starts at `v29.3.knots20260508` and is unconditional
> from `v29.4.1.knots20260508`.

## When to consider Knots

Rows below are for the **current** release line (`v29.4.x`, which is
consensus-incompatible with Core as of September 2026):

| Use case | Knots? |
|----------|--------|
| Default Bitcoin node | No (use Core; ~83% of public nodes do, Sept 2026) |
| Strict spam filter at the relay layer | Only on an RDTS-free build (up to `v29.3.knots20260210`, or `v29.3.knots20260507`); current releases change consensus too |
| Mining with custom policy | No — current Knots mines a BLAKE2b chain that Core rejects |
| Lightning service | No (Core is the standard, better support) |
| Block explorer / indexer | No (Core has better tooling support) |
| Deliberately following the Knots/BLAKE2b chain | Yes — that is what the current line is for; treat it as a separate network |

## Compatibility

- RPC: near-identical to Core, with Knots-specific extensions.
  `v29.4.1` added block header fields to `getblockheader` / `getblock`:
  `txcount` (replacing the deprecated `nTx`), `header_version`,
  `nonce2`, `nonce3`, `extranonce`, `time_offset`, `header_flags`,
  `xor_key`, `xor_key_mask_clear_bits` and `mm_rhs`.
- ZMQ: identical.
- File formats: identical (cookie, debug.log, wallet.dat, descriptors).
- P2P: same protocol and message types, but `v29.4.1` added a
  `NODE_BLAKE2B` service bit and prefers those peers over
  `NODE_REDUCED_DATA` (knots#368), and bases DNS-seed cadence on the
  `NODE_BLAKE2B` peer count (knots#386).

An RDTS-free Knots node (up to `v29.3.knots20260210`, or
`v29.3.knots20260507`) in your network is indistinguishable from a
Core node to peers — only the mempool admission decisions differ. A
`v29.4.x` node is not: it validates a different chain, so blocks are not
interchangeable in either direction.

## Releases

- Tagged based on Core releases: `vX.Y.Z.knots20YYMMDD`.
- Released after each Core minor version, with a delay of weeks-months.
- Backports of Core bugfixes are applied along with Knots-specific
  patches.
- Current release as of 2026-09-15 is **`v29.4.1.knots20260508`**
  (published 2026-09-02), preceded by `v29.4.knots20260508`
  (2026-08-07), the `v29.3.knots20260508` / `v29.3.knots20260507` pair
  (2026-05-09 / 2026-05-08) and `v29.3.knots20260210` (2026-02-10).
- Knots is still on the 29.x base while Bitcoin Core's own line has
  reached `v31.1` (2026-07-08), so "based on the current Core release"
  no longer holds.
- Subversion strings append a separate `Knots:<date>/` segment after
  the base-version field: current builds report
  `/Satoshi:29.4.1/Knots:20260508/`, 2024-era builds reported
  `/Satoshi:27.1.0/Knots:20240801/`, and the suffix is emitted by
  `FormatSubVersion()` as far back as `v21.2.knots20210629`. Detect
  Knots by matching the `Knots:` segment, not the base version.

## Verification

Like Core, Knots ships signed releases. Verification process is the
same:
```bash
gpg --verify SHA256SUMS.asc
sha256sum -c SHA256SUMS
```

Luke Dashjr's GPG fingerprint is the primary signer.

## Common bugs / gotchas

- **Mempool divergence** confusing operators: a tx broadcast to a
  Knots node may not propagate if other peers are Core (they accept
  it but Knots peer's first hop drops it). Or vice versa.
- **Build options differ**; Knots build instructions diverge from
  Core in some cases.
- **Some features lag Core** in Knots due to maintainer bandwidth.
- **Upgrading a Knots node across the 2026 releases changes which chain
  it follows.** Moving from a build up to `v29.3.knots20260210` (or the
  non-RDTS `v29.3.knots20260507`) to `v29.4.1.knots20260508` moves the
  node onto the BLAKE2b chain. The `v29.4.1` release notes warn that a
  node that was "old, pruned, and followed invalid blocks" may need a
  full resync. Audit the exact build string
  (`getnetworkinfo.subversion`) before assuming a deployment is still on
  the Core-compatible chain.

## Network share

As of 2026-09-15, Coin Dance reports Knots on 4,399 of 25,864 public
nodes (~17.0%) against Bitcoin Core's 21,431 (~82.8%). A Bitnodes
snapshot the same day independently counts 4,420 Knots user agents out
of 26,478 reachable nodes (~16.7%). Knots is a double-digit minority of
public nodes, on both counts.

The figure is volatile — check a live tracker (coin.dance/nodes/share,
bitnodes.io) rather than trusting a number written here. Two caveats
when reading it:
- Node share is not hashrate and is not a measure of consensus support.
- Since the August 2026 split the crawlers bucket by user agent, so a
  Knots node on the BLAKE2b chain and a Core node on the SHA256d chain
  appear in the same total despite validating different chains.

## Status

Knots is a **maintained, active** Bitcoin implementation, not
abandonware — `v29.4.1.knots20260508` shipped 2026-09-02. Since that
release it is best understood as a **separate network** rather than a
niche configuration of the same one. The mainstream chain is still the
Core one, by node count (~83%, Sept 2026) and by the fact that the
BIP-110 chain managed two blocks in the eight hours after the split
while the Core chain advanced 48.

## See also

- [release-engineering/SKILL.md](../release-engineering/SKILL.md)
- [operations/SKILL.md](../operations/SKILL.md) — in particular
  [Relay policy since 30.0](../operations/SKILL.md#relay-policy-since-300),
  the Core defaults this fork diverges from
- [../../metaprotocols/inscriptions/SKILL.md](../../metaprotocols/inscriptions/SKILL.md)
