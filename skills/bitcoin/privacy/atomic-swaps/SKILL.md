---
name: bitcoin-privacy-atomic-swaps
description: |
  Cross-chain atomic swaps: BTC ↔ LTC / BTC ↔ Liquid / BTC ↔ Monero
  via HTLC or adaptor signature schemes. Trustless swaps without
  centralized exchange.
  USE WHEN: building atomic swap services, evaluating cross-chain
  bridges, integrating with COMIT / submarine-swap variants.
allowed-tools: Read, Grep, Glob
---

# Cross-Chain Atomic Swaps

Atomic = either both sides settle or neither. Achieved via shared
preimage (HTLC) or shared scalar (adaptor signature).

## HTLC-based swap (classic)

For BTC ↔ LTC swap:
1. User generates preimage `P`, hash `H = SHA256(P)`.
2. User publishes BTC HTLC: `to LTC-side after CLTV, OR claim
   immediately with P + LTC-side's signature`.
3. LTC-side publishes LTC HTLC: `to BTC-side after CLTV, OR claim
   immediately with P + BTC-side's signature`.
4. User claims LTC HTLC (revealing P).
5. LTC-side uses P to claim BTC HTLC.

Atomic: P revealed in one chain instantly enables claim on the
other.

## Adaptor-signature swap (scriptless)

Uses adaptor signatures (see [../../cryptography/adaptor-sigs/](../../cryptography/adaptor-sigs/SKILL.md)):
- No HTLC scripts on chain — looks like ordinary tx.
- Same shared scalar `t` unlocks both sides.

Used in:
- **BTC ↔ Monero** swaps (XMR doesn't support HTLCs directly;
  adaptor sigs are the standard).
- **BTC ↔ Liquid** privacy-preserving swaps.

## BTC ↔ Monero (FarCaster, COMIT, Atomic Swap protocol)

XMR uses ring signatures + stealth addresses. Atomic swaps via
adaptor signatures + Monero-specific protocols.

Implementations:
- **FarCaster** — multi-network protocol.
- **COMIT** — atomic swap library.
- **Atomic Swap (XMR ↔ BTC) by COMIT** — production.

Trade-offs: complex, slow (often 30-60 minutes per swap), but
trustless.

## BTC ↔ Liquid

Boltz supports BTC ↔ Liquid swaps via submarine swap mechanism.
See [../../lightning/submarine-swaps/SKILL.md](../../lightning/submarine-swaps/SKILL.md).

## BTC ↔ Lightning

Lightning ↔ on-chain BTC swaps (different chain not technically
needed; same network):
- Lightning Loop, Boltz, peerswap.

## Privacy benefit

Adaptor-sig variants:
- Tx looks like normal cooperative spend on chain.
- Counterparty's chain analysis can't link the two legs.

HTLC variants:
- Hash + CLTV scripts visible on chain.
- Both legs share same hash (correlatable).

## Use cases

- **Privacy via diversification**: BTC → XMR → BTC = breaks chain
  analysis.
- **DEX-like trading** without centralized exchange.
- **Cross-chain liquidity**.

## Limitations

- **Liquidity** — atomic swaps need a counterparty.
- **Latency** — multi-confirmation waits per chain (BTC = 10 min,
  XMR = 2 min × multiple blocks).
- **Implementation complexity** — adaptor sigs are subtle.

## See also

- [../../cryptography/adaptor-sigs/SKILL.md](../../cryptography/adaptor-sigs/SKILL.md)
- [../../lightning/submarine-swaps/SKILL.md](../../lightning/submarine-swaps/SKILL.md)
- [coinjoin/SKILL.md](../coinjoin/SKILL.md)
- [p2p-exchanges/SKILL.md](../p2p-exchanges/SKILL.md)
