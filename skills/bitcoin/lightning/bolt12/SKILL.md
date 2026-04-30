---
name: lightning-bolt12
description: |
  BOLT12 offers: reusable invoices, blinded paths, recurring payments,
  multi-asset (Taproot Assets layered). Replaces BOLT11 for many use
  cases.
  USE WHEN: implementing/integrating offers, designing recurring
  payments, evaluating BOLT11 vs BOLT12 trade-offs.
allowed-tools: Read, Grep, Glob
---

# BOLT12 Offers

BOLT12 is a flexible payment protocol that addresses BOLT11's
limitations:
- BOLT11 invoices are **single-use** and **expire**.
- BOLT11 reveals destination pubkey.
- BOLT11 has no built-in support for recurring payments or refunds.

BOLT12 offers a static, reusable identifier (the "offer") that lets
payers fetch a fresh invoice each payment via Lightning's onion
message system.

## Three message types

1. **Offer** (`lno1...`) — long-lived, signed by recipient. Encodes:
   - Description, amount (or "any"), expiry (or none).
   - Issuer pubkey (potentially blinded).
   - Allowed currencies / quantities.
2. **Invoice request** (`lnr1...`) — payer sends via onion message,
   asks for an invoice for this offer.
3. **Invoice** (`lni1...`) — receiver responds with one-time invoice.
   Standard payment proceeds.

## Bech32 encoding

All three types use the BOLT11-style bech32 encoding with `lno1`,
`lnr1`, `lni1` prefixes (no chain prefix; chain encoded in TLV).

## TLV-only

Unlike BOLT11's tag/data tuples, BOLT12 uses pure TLV everywhere.
Future-proof; new fields don't break old parsers.

## Blinded paths

Offers can include **blinded paths** — partial routes that hide the
recipient's node id. The offer is signed by an "introduction node" +
blinded route data; recipient is anonymous to the payer.

## Recurring payments

Offers can specify recurrence:
```
quantity_min: 1, quantity_max: 100
recurrence: monthly for 12 months
```

Same offer used for subscription: payer fetches a fresh invoice each
month.

## Multi-asset (Taproot Assets layered)

BOLT12 + Taproot Assets together enable invoices priced in non-BTC
assets routed over LN. Recipient gets BTC amounts; payer pays in
asset terms; intermediate hops handle conversion.

## Use cases vs BOLT11

| Use case | BOLT11 | BOLT12 |
|----------|--------|--------|
| One-time payment with known amount | yes | yes |
| Static "donate to me" QR code | hacky (LNURL-pay) | native |
| Recurring subscription | manual | native |
| Refund flow | no | yes |
| Hidden destination | no | yes (blinded paths) |
| Multi-asset | no (need TAP/RGB) | yes |

## Implementation status (late 2025)

| Implementation | Send | Receive | Recurring |
|----------------|------|---------|-----------|
| CLN | yes | yes | yes |
| LDK | yes | yes | partial |
| LND | partial | partial | no |
| Eclair | yes | yes | partial |
| phoenixd | yes (receive especially) | yes | partial |

## Common bugs

- Treating `lno1...` as a single-use invoice → it's not, can be
  reused.
- Failing to fetch invoice via onion message → expecting BOLT11
  flow.
- Caching invoice from offer → invoices are one-shot; fetch fresh
  each payment.
- Missing onion-message support (`option_onion_messages` feature
  bit) → can't fetch invoice request response.

## See also

- [bolts/SKILL.md](../bolts/SKILL.md)
- [onion/SKILL.md](../onion/SKILL.md)
- [lnurl/SKILL.md](../lnurl/SKILL.md)
- [../../l2/taproot-assets/SKILL.md](../../l2/taproot-assets/SKILL.md)
