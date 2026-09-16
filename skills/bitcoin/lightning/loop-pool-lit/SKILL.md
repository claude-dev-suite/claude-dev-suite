---
name: lightning-loop-pool-lit
description: |
  Lightning Labs liquidity tools: Loop (off-chain ↔ on-chain swaps),
  Pool (auction-based liquidity market), Lightning Terminal (Lit, web
  UI). Submarine swap mechanics behind Loop. As of September 2026
  Loop is the live general-purpose option: Boltz swaps are offline
  (suspended 2026-08-03) and Peerswap rejects new L-BTC swaps
  (v7.0.1, 2026-09-07).
  USE WHEN: managing channel liquidity, evaluating Loop vs Boltz vs
  Peerswap, deploying Lit for fleet management.
allowed-tools: Read, Grep, Glob
---

# Lightning Loop / Pool / Terminal

Lightning Labs' suite of liquidity-management tools, built on top of
LND.

## Loop — submarine swaps

Loop lets you convert between on-chain and Lightning balance:

### Loop Out (LN → on-chain)
Use case: drain channels, reduce Lightning balance into on-chain.
```
LND ──── HTLC payment ────► Loop server
                           Loop server publishes on-chain HTLC
LND watches chain, receives on-chain payout via preimage reveal.
```

### Loop In (on-chain → LN)
Use case: inbound liquidity, rebalance.
```
LND publishes on-chain HTLC ────► Loop server
                                Loop server pays LND HTLC over LN
On-chain HTLC settled via preimage.
```

Loop = **submarine swap**. Atomic via shared preimage / HTLC scripts.
Fees: ~0.5% typically.

### loopd

```bash
loop in --amt 1000000 --htlc_conf_target 6
loop out --amt 5000000 --channel <chan-id>
loop monitor   # watch ongoing swaps
```

## Pool — channel auction

Pool is a marketplace where:
- **Makers** (liquidity providers) commit liquidity for sale.
- **Takers** (channel-needers) bid for inbound.

Pool runs per-block batched auctions. Winning matches get a
dual-funded channel.

### poold

```bash
pool accounts new --amt 1000000   # deposit funds for bidding
pool orders submit ask --amt 500000 --duration 144 ...   # offer to provide
pool orders submit bid --amt 1000000 --duration 144 ...   # request liquidity
```

## Lightning Terminal (Lit)

Web UI bundling LND + Loop + Pool + Faraday + Taproot Assets daemon
+ Pool. Single web dashboard for node management.

```bash
litd  # runs LND + sub-services + UI on port 8443
```

Web UI features:
- Balance, channels, payments tracker.
- Loop interface (one-click in/out).
- Pool interface (submit orders, view auctions).
- Taproot Assets management.

## Submarine swap protocol detail

Both Loop In and Loop Out use atomic swaps via HTLC:

### Loop Out flow
1. User generates preimage `P`, hash `H = SHA256(P)`.
2. User pays LN invoice with `H` to Loop server. HTLC route ends at
   Loop server with `H`.
3. Loop server's HTLC has not yet been fulfilled by user (no `P`
   revealed).
4. Loop server publishes on-chain HTLC at user's specified address,
   spendable by user with `P`, refundable by Loop server after CLTV.
5. User claims on-chain output, revealing `P`.
6. Loop server uses `P` to fulfill the LN HTLC, gets paid.

Atomic: either both swap legs settle or neither (both refund).

## Alternatives

- **Boltz** — competing submarine swap service, also supports
  Liquid swaps. Offline since 2026-08-03 after AI-assisted attacks;
  non-custodial, so refunds stayed up. No relaunch date as of
  2026-09-15 — protocol reference only, not a live API.
- **Peerswap** (CLN plugin, LND lncli plugin) — peer-to-peer swaps,
  no third-party trust. Bitcoin only as of 2026-09-15: v7.0.1
  (2026-09-07) rejects new L-BTC swaps after a Liquid Network
  security incident; v7.0.0 (2026-08-19) fixed two Liquid issues
  under a withheld CVE. Bitcoin swaps unchanged.
- **Splice-out** (CLN, ldk) — built-in; no third-party.

Lightning Loop has the broadest impl support; Peerswap is more
trust-minimized but requires both parties to support it, and as of
September 2026 covers Bitcoin swaps only.

## Common bugs

- Loop fails on swap due to mismatched fees: server's quote vs
  current mempool fee → use higher `htlc_conf_target`.
- Stuck swap: user's LN HTLC sent but server's on-chain HTLC delayed
  → wait for CLTV refund or resubmit.
- Lit web UI requires LND macaroon; misconfigured → Auth failures.

## See also

- [submarine-swaps/SKILL.md](../submarine-swaps/SKILL.md)
- [lnd/SKILL.md](../lnd/SKILL.md)
- [../../l2/taproot-assets/SKILL.md](../../l2/taproot-assets/SKILL.md)
