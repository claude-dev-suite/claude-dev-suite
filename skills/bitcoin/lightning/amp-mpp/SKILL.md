---
name: lightning-amp-mpp
description: |
  Multi-Path Payments (MPP) — split a payment across multiple
  parallel routes; same payment hash, payment_secret binds parts.
  AMP (Atomic Multipath) — variant where each part has different hash;
  receiver derives shared secret.
  USE WHEN: implementing payment splitting, debugging "couldn't route
  full amount", evaluating MPP vs AMP.
allowed-tools: Read, Grep, Glob
---

# MPP and AMP

When a single channel can't carry the full payment amount or no
single path has enough liquidity, the sender splits the payment.

## MPP (Multi-Path Payments) — BOLT 9 bit 16

Split into N parts, each with the **same** payment hash and
`payment_secret` (BOLT 11 's' tag).

Receiver's wallet:
1. Receives first HTLC; sees `total_msat = X`, this part's amount.
2. Holds HTLC; doesn't fulfill yet.
3. Waits for more parts to arrive (with same payment_secret).
4. When `sum(amounts) >= total_msat`, atomically fulfills all HTLCs
   with the preimage.

If timeout reached and not enough collected: fail all parts. Funds
return to sender (minus any that already timed out on chain).

## AMP (Atomic Multipath) — BOLT 9 bit 18 (semi-deprecated)

Each part has a **different** payment hash (`payment_hash_i`),
derived from a master secret + per-part nonce:
```
master_secret = random
payment_secret_i = HKDF(master_secret, i)
payment_hash_i = SHA256(payment_secret_i)
```

Receiver:
1. Receives first part; cannot derive preimage yet.
2. As more parts arrive, accumulates info.
3. Once enough parts arrive (≥ k threshold), can derive
   `master_secret` (Shamir-like) → derive each part's preimage →
   fulfill atomically.

AMP supports "spontaneous payments" (keysend-AMP) where sender
doesn't need a pre-issued invoice.

## When to use MPP vs single-path

Single-path:
- Sufficient channel capacity exists.
- Lower overhead (1 HTLC, 1 onion).
- Easier to reason about.

MPP:
- Total amount exceeds single-channel capacity.
- Improved success probability (split across paths with independent
  liquidity).
- Cost: more HTLCs in flight (higher channel slot usage), longer
  total time.

## Split sizing strategies

Pick split sizes:
- **Equal split**: parts of equal size.
- **Probability-weighted**: smaller parts on higher-probability
  routes.
- **Pickhardt-flow**: optimization-based, jointly chooses parts +
  routes.

Most impls: 4-16 parts max, sized to channel capacity constraints.

## Implementation status

| Impl | Basic MPP | AMP keysend |
|------|-----------|-------------|
| LND | yes | yes |
| CLN | yes | partial |
| LDK | yes | yes |
| Eclair | yes | partial |

## Common bugs

- `payment_secret` not included in invoice → MPP receiver fails:
  cannot bind parts.
- Sender splits past CLTV-block budget — total time across MPP
  exceeds invoice expiry.
- Retry loops: failed part retried over same path → repeat failure.
- Receiver fulfills before all parts arrive → partial payment, sender
  short-paid.

## Channel slot exhaustion

Each in-flight HTLC consumes an HTLC slot per channel (default
max 483 from `accept_channel`'s `max_accepted_htlcs`). MPP across
many small parts fills slots fast.

## See also

- [routing/SKILL.md](../routing/SKILL.md)
- [htlcs/SKILL.md](../htlcs/SKILL.md)
- [keysend/SKILL.md](../keysend/SKILL.md)
- [bolts/SKILL.md](../bolts/SKILL.md)
