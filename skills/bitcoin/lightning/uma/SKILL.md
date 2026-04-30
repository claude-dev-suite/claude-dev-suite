---
name: lightning-uma
description: |
  UMA (Universal Money Address): Lightspark's spec extending Lightning
  Address with non-USD currencies, KYC compliance, sender attestation,
  multi-currency exchange via Lightning routing.
  USE WHEN: integrating with UMA-enabled providers (mostly enterprise),
  building cross-currency LN payment flows.
allowed-tools: Read, Grep, Glob
---

# UMA (Universal Money Address)

UMA is Lightspark's open-spec extension to Lightning Address that
supports:
- Multi-currency invoices (USD, EUR, ARS, NGN, ...).
- Sender / receiver attestation (KYC compliance).
- Travel Rule data exchange (FATF compliance).
- Currency conversion via Lightning's routing.

Format: same as Lightning Address — `user@domain.com` — but the
backend implements UMA on top of LNURL-pay.

Spec: <https://uma.me/>, repo `uma-universal-money-address/protocol`.

## Why UMA

Lightning Address solves "human-friendly identifier", but doesn't
help with:
- "I want to send 50 USD to user@bank.com" — wallet needs to know
  USD value mapping.
- Compliance (banks need sender info).
- Cross-currency conversion.

UMA addresses these for **regulated financial institutions**.

## Resolution

Standard Lightning Address path:
```
GET https://domain.com/.well-known/lnurlp/user
```

But response includes UMA-specific fields:
```json
{
  "tag": "payRequest",
  "currencies": [
    { "code": "USD", "decimals": 2, "minSendable": 1, "maxSendable": 100000 },
    { "code": "EUR", ... },
    { "code": "BTC", ... }
  ],
  "compliance": {
    "kycStatus": "VERIFIED",
    "utxoCallback": "https://...",
    ...
  },
  ...
}
```

## Travel Rule data

For payments above thresholds:
- Sender info: name, address, account number.
- Receiver info: similar.
- Data exchanged via signed payload during invoice request.

## Currency conversion

UMA-enabled receiver might accept "100 USD" → produces a BOLT11
invoice for the BTC equivalent at current rate. Exchange happens
at receive time.

Multi-hop currency: sender → bank → exchange → receiver bank, all
via Lightning routing.

## Implementations

- **Lightspark** — primary, customers include Coinbase, Kraken-some
  jurisdictions, hodl, etc.
- **UMA SDK** — TypeScript / Go / Python / Kotlin reference impls.

## Comparison

| Feature | Lightning Address | UMA |
|---------|-------------------|-----|
| Multi-currency | no | yes |
| Sender info | none | KYC-attested |
| Compliance / Travel Rule | no | yes |
| Adoption | wide (hobbyists + services) | narrow (regulated providers) |
| Privacy | server sees | server + counterparty institution sees |

## Use cases

- Cross-border remittances between regulated providers.
- Payment from a regulated wallet (e.g., Coinbase) to a UMA address.
- Compliance-required Lightning payments at exchanges.

## Privacy trade-off

UMA explicitly trades user privacy for regulatory compatibility. Not
intended for general-purpose Lightning use; reserved for regulated
flows. Self-custodial Lightning users typically use plain Lightning
Address or BOLT12.

## Common confusions

- UMA != AMP. AMP = Atomic Multipath. UMA = Universal Money Address.
- UMA is **server-side**; it doesn't change BOLT11/BOLT12 wire format.
- UMA addresses look identical to Lightning Addresses — distinguishable
  only by the `currencies`/`compliance` fields in the LNURL-pay JSON.

## See also

- [lightning-address/SKILL.md](../lightning-address/SKILL.md)
- [lnurl/SKILL.md](../lnurl/SKILL.md)
- [../../l2/spark/SKILL.md](../../l2/spark/SKILL.md)
