---
name: lightning-submarine-swaps
description: |
  Submarine swaps: atomic on-chain ↔ Lightning conversions via shared
  HTLC preimage. Boltz protocol, Loop protocol, Peerswap (P2P), trustless
  variants with adaptor signatures. Boltz swaps are offline (suspended
  2026-08-03); Loop, Peerswap and Blockstream Swaps (beta) are the live
  options as of September 2026.
  USE WHEN: building swap services, integrating with Loop / Peerswap /
  Blockstream Swaps, reading Boltz as a protocol reference, designing
  trust-minimized swap flows.
allowed-tools: Read, Grep, Glob
---

# Submarine Swaps

A submarine swap atomically converts between on-chain BTC and
Lightning BTC (or vice versa) using a single shared preimage that
reveals one side, allowing the other side to claim.

## Atomicity primitive

```
Both sides commit to same hash H = SHA256(P) (or scalar T = t*G for PTLC).
Side 1 claims: requires P (or t).
Side 2 claims: refundable after timeout, or claimable with P (or t).

Whoever moves first reveals P → other side can immediately claim.
Either both legs settle, or both refund.
```

## Service status (September 2026)

| Service | Status as of 2026-09-15 | Notes |
|---------|-------------------------|-------|
| Boltz | **Offline** since 2026-08-03 | All mainchain, Lightning and Liquid swaps disabled "until further notice"; EVM-side swaps (USDT, USDC, TBTC, WBTC, RBTC) went first, on 2026-08-01. |
| Loop (Lightning Labs) | Operating | `lightninglabs/loop` v0.35.0-beta, released 2026-08-25. |
| Peerswap | Operating, Bitcoin only | v7.0.1 (2026-09-07) rejects new L-BTC swap requests in both directions after a Liquid Network security incident; Bitcoin swaps unchanged. |
| Blockstream Swaps | Beta since 2026-08-10 | In-house swaps feature for the Lightning and Liquid networks; beta testing with select participants, access by request. |

Boltz cited months of "automated, AI-assisted probing" of its
infrastructure and several exploits: attackers "iterate faster than a
team our size can find and patch". Because the swap design is
non-custodial, user funds were never at risk — Boltz absorbed the
losses on its own liquidity, the refund API stayed up, and unilateral
refunds never depended on Boltz infrastructure at all. On 2026-08-12
all three founders announced their departure, handing the project to an
undisclosed group of Bitcoiners supplying capital and engineering; no
relaunch date had been announced as of 2026-09-15.

Downstream integrators that lost swap functionality: ZEUS, Aqua (JAN3),
Bull Bitcoin.

**Practical consequence:** the Boltz sections below stay as a *protocol*
reference — the flows and script templates are unaffected by the
outage — but do not plan a new integration against the live Boltz API
until the service returns.

## Boltz protocol

Boltz was the most widely integrated swap service until its 2026-08-03
suspension (see status above). Two flow types:

### Boltz Reverse (LN → on-chain)
```
1. User generates preimage P, sends LN payment with H = SHA256(P) to
   Boltz.
2. Boltz holds the LN HTLC.
3. Boltz publishes on-chain HTLC at user's address, value =
   payment_amt - fee.
4. User claims on-chain HTLC by revealing P.
5. Boltz uses P to fulfill the LN HTLC.
```

### Boltz Submarine (on-chain → LN)
```
1. User publishes on-chain HTLC paying Boltz (value = lightning_amt + fee).
2. Boltz pays user's LN invoice (which has H = SHA256(P)).
3. User claims their own LN payment with P.
4. Boltz uses P to claim the on-chain HTLC.
```

Boltz API: REST endpoints for quotes + swap construction (v2 current,
v1 deprecated; docs at api.docs.boltz.exchange). Swap creation has been
disabled since 2026-08-03.

## Trustless variants (adaptor signatures)

Boltz / Loop are "service" submarine swaps — you trust the service
to act honestly within the timeout window.

Trustless / scriptless variants use **adaptor signatures**:
- Both legs pre-signed with adaptor secrets.
- Same secret reveals both legs atomically.
- No HTLC scripts on chain (privacy).

PTLC-based swaps (Schnorr point-locked, BOLT proposal):
- LN side uses PTLCs.
- On-chain side uses adaptor sig.
- Same scalar `t` unlocks both.

## Peerswap (P2P)

Peerswap enables direct peer-to-peer swaps without 3rd party:
- Two LN nodes who already have a channel can exchange channel
  liquidity for on-chain liquidity (or Liquid).
- No service fee; direct submarine swap protocol.

CLN plugin and LND-via-lncli plugin available. Swaps are only allowed
with allowlisted peers, and the project still labels itself beta-grade.

As of Peerswap v7.0.1 (2026-09-07) new L-BTC swap requests are rejected
in both directions — local RPC and incoming peer requests alike, and
L-BTC is dropped from capability announcements — following a Liquid
Network security incident. Bitcoin swaps are unchanged. Recovery of
already-persisted Liquid swaps stays enabled but is not guaranteed.

## Boltz-specific features

Offline along with the rest of the service as of 2026-09-15; listed
here because they define the feature surface a returning Boltz (or a
replacement) is expected to cover.

- **Liquid swaps** — Boltz also supports BTC ↔ Liquid Bitcoin (LBTC)
  swaps.
- **Refund tool**: pre-signed refund tx in case Boltz disappears
  before completing. This is the path that held during the 2026-08
  suspension — the refund API stayed live, and the unilateral refund
  does not need Boltz at all.
- **Boltz Pro** — enterprise features.

## Use cases

- **Mobile wallets** rebalancing (Phoenix, Mutiny use submarine
  swaps internally).
- **LSPs** for liquidity management.
- **Manual rebalancing** of public Lightning nodes.
- **Bridge to L2** — swap BTC ↔ Liquid ↔ Taproot Assets.

## Limits and fees

- Service fees: 0.1% - 1% typical.
- Minimum swap: usually 50,000 sats.
- Maximum swap: limited by service liquidity (~1-10 BTC).

## Common bugs

- HTLC timeout race: fee spike causes on-chain HTLC to confirm late;
  pre-signed refund tx not yet broadcastable → loss possible.
  Mitigation: always pre-build and sign refund tx with high fee
  buffer.
- Channel close during swap: counterparty force-closes the LN side,
  swap leg becomes unreliable.
- Fee assumption wrong → swap rejected by service.

## See also

- [loop-pool-lit/SKILL.md](../loop-pool-lit/SKILL.md)
- [../../cryptography/adaptor-sigs/SKILL.md](../../cryptography/adaptor-sigs/SKILL.md)
- [../../privacy/atomic-swaps/SKILL.md](../../privacy/atomic-swaps/SKILL.md)
