---
name: lightning-nwc
description: |
  Nostr Wallet Connect (NWC, NIP-47): wallet remote control via Nostr
  relays. App on one device drives wallet on another via signed JSON
  messages over Nostr.
  USE WHEN: integrating wallet-side or app-side NWC, designing
  remote-control flows, evaluating NWC vs WebLN.
allowed-tools: Read, Grep, Glob
---

# Nostr Wallet Connect (NWC)

NWC lets apps control a Lightning wallet remotely via Nostr relays.
Defined in NIP-47 (Nostr Implementation Possibility 47).

Use case: a web app or another device wants to send / receive payments
via your wallet without holding keys directly.

## Architecture

```
[App (browser/mobile)]
     │ encrypted JSON payload
     ▼
  Nostr relay
     ▲
     │ encrypted response
[Wallet (mobile/extension/server)]
```

Both sides have Nostr keypairs. Communication encrypted via NIP-04
(end-to-end), relayed by untrusted public relays.

## Connection URI

```
nostr+walletconnect://<wallet_pubkey>?relay=<wss://relay.example.com>&secret=<32-byte-hex>
```

User scans QR or pastes; app stores. Subsequent calls use this
binding.

## Methods

NIP-47 defines:
- `pay_invoice(invoice)` — pay BOLT11.
- `pay_keysend(args)` — keysend.
- `make_invoice(args)` — generate BOLT11.
- `lookup_invoice(args)`.
- `list_transactions(args)`.
- `get_balance()`.
- `get_info()`.
- `multi_pay_invoice(invoices[])` — batch.
- `sign_message(message)`.

## Message format

NIP-47 events on Nostr:
- App publishes `kind=23194` event with encrypted request to wallet's
  pubkey.
- Wallet processes, publishes `kind=23195` with encrypted response.

Payload (decrypted JSON):
```json
{
    "method": "pay_invoice",
    "params": { "invoice": "lnbc..." }
}
```

Response:
```json
{
    "result_type": "pay_invoice",
    "result": { "preimage": "..." }
}
```

## Providers

| Provider | Type |
|----------|------|
| **Alby** | Hosted custodial, free NWC |
| **Mutiny** | Self-custodial, NWC built-in |
| **Phoenix** | NWC plugin available |
| **LNbits** | NWC extension |
| **Cashu Mints** | NWC for mint operations |

## App integrations

- **Damus, Amethyst** (Nostr clients) — zaps via NWC.
- **Bitcoin Connect** — NWC as a fallback connector.
- **Habla.news** — Nostr-LN content payments.
- **Yakihonne, Coracle** — Nostr clients.
- **Stacker.news** — uses NWC for content payments.

## Permissions

Method-level scoping. NWC URI can include allow/deny method lists:
```
nostr+walletconnect://...&methods=pay_invoice,make_invoice
```

Or wallet-side rate / amount limits.

## Compared to WebLN / LNURL

| Aspect | WebLN | LNURL | NWC |
|--------|-------|-------|-----|
| Browser-only | yes | wallet | yes |
| Cross-device | no | partial | **yes** |
| Persistent connection | per-page | per-call | persistent |
| Encrypted | https | https | NIP-04 |
| Relay | direct | server | nostr |
| Method coverage | rich | pay-only | rich |

## Security considerations

- Wallet pubkey + secret in URI = full control of those methods on
  that wallet. Treat URI as sensitive (don't paste in untrusted
  apps).
- Per-app secret recommended (don't reuse across apps).
- Spending limits on wallet side (max-amount-per-tx, daily limit)
  defend against compromised app.

## Common bugs

- Misconfigured relay (rate-limited, not subscribed) → no responses
  arrive.
- Using same NWC URI across multiple apps → can't revoke selectively.
- Latency: Nostr relays add 1-5 second round trip, slower than
  WebLN.

## See also

- [webln/SKILL.md](../webln/SKILL.md)
- [lnurl/SKILL.md](../lnurl/SKILL.md)
- [bolt12/SKILL.md](../bolt12/SKILL.md)
