---
name: lightning-submarine-swaps
description: |
  Submarine swaps: atomic on-chain ↔ Lightning conversions via shared
  HTLC preimage. Boltz protocol, Loop protocol, Peerswap (P2P), trustless
  variants with adaptor signatures.
  USE WHEN: building swap services, integrating with Boltz/Loop, designing
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

## Boltz protocol

Boltz is the most popular swap service. Two flow types:

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

Boltz API: REST endpoints for quotes + swap construction.

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

CLN plugin and LND-via-lncli plugin available.

## Boltz-specific features

- **Liquid swaps** — Boltz also supports BTC ↔ Liquid Bitcoin (LBTC)
  swaps.
- **Refund tool**: pre-signed refund tx in case Boltz disappears
  before completing.
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
