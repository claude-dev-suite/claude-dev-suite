---
name: lightning-keysend
description: |
  Keysend / spontaneous payments: send Lightning to a destination
  without an invoice. Receiver derives preimage from sender-supplied
  TLV record. BOLT 9 bit 50.
  USE WHEN: implementing tipping flows, designing zero-friction
  micro-payments, evaluating keysend vs BOLT11 invoice flow.
allowed-tools: Read, Grep, Glob
---

# Keysend / Spontaneous Payments

Keysend lets the sender pay a destination by **node pubkey** without
the receiver issuing a BOLT11 invoice first. The sender includes the
preimage as a TLV record in the onion; receiver extracts and fulfills.

## Mechanism

```
Sender:
  preimage_random = random(32 bytes)
  payment_hash = SHA256(preimage_random)
  Build onion with TLV record:
    type 5482373484 ("keysend"): preimage_random
  HTLC for amount → forwarded via onion routing → arrives at destination.

Receiver:
  Receives HTLC with payment_hash.
  Sees TLV type 5482373484 in onion payload.
  Extracts preimage. Verifies SHA256(preimage) == payment_hash.
  If matches, fulfill HTLC immediately.
```

## Why custom record number 5482373484?

Per BOLT 1: custom records ≥ 65536 are reserved for proprietary use.
The keysend type was chosen by Lightning Labs as a (large) sentinel.

## Limitations of bare keysend

- **No proof of payment**: receiver gets the preimage but sender
  never receives a signed invoice. Some compliance / accounting
  flows fail.
- **No metadata**: receiver doesn't know what the payment is for.
  Custom records (e.g., pubky podcast app) extend with `text/plain`
  type for memos.
- **Non-standard**: not in BOLT mainline. Different impls vary in
  feature support.

## Spontaneous payments + AMP

AMP-keysend combines AMP's per-part nonces with keysend's preimage-in-
onion mechanism. Each part contributes a Shamir share; receiver
reassembles preimage. Used by some podcast apps for streaming sats.

## Use cases

- **Lightning tips**: `boost` or `value4value` apps.
- **Streaming sats**: podcast apps, video streaming apps that send
  sats per minute.
- **Direct messaging payments**: Sphinx Chat, Damus zaps.
- **Mempool.space accelerator** for LN-paid mempool acceleration
  (some impls).

## Custom records (extend keysend)

Common custom record types:
- `34349334`: keysend message text.
- `7629169`: pubky / podcast-index sender info.
- `133773310`: app-specific.

These are app-defined; no global registry. Risk of conflicts; check
app docs.

## Implementation status

| Impl | Keysend send | Keysend receive |
|------|--------------|-----------------|
| LND | yes | yes |
| CLN | yes (via plugin) | yes |
| LDK | yes | yes |
| Eclair | yes | yes |
| Phoenix | partial | yes |

## BOLT12 keysend equivalent

BOLT12 supports an "offer" that allows arbitrary amount payments
WITHOUT pre-issued per-payment invoices, but with proper proof of
payment (signed by recipient).

For new builds, prefer BOLT12 keysend over bare keysend where
implementation supports it.

## Common bugs

- Receiver doesn't have keysend enabled → HTLC fails with
  "incorrect_payment_details".
- Sender forgets to include the keysend custom record → receiver
  treats as unknown payment_hash.
- Custom records exceed onion size budget (1300 bytes) → onion
  rejected at routing.
- Multi-hop keysend with custom records → some forwarders strip
  unknown TLVs (they shouldn't but happens).

## See also

- [bolts/SKILL.md](../bolts/SKILL.md)
- [onion/SKILL.md](../onion/SKILL.md)
- [bolt12/SKILL.md](../bolt12/SKILL.md)
- [amp-mpp/SKILL.md](../amp-mpp/SKILL.md)
