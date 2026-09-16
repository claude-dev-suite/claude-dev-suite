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

Both sides have Nostr keypairs. Communication is end-to-end
encrypted, relayed by untrusted public relays.

Encryption is NIP-44 v2. NIP-04 is deprecated and retained only for
peers that have not migrated (NIP-47 as of September 2026). The two
sides negotiate: the wallet service lists what it supports in an
`encryption` tag on its kind 13194 info event
(`["encryption", "nip44_v2 nip04"]`), and the client puts the scheme
it chose in an `encryption` tag on every kind 23194 request. Absence
of the tag means NIP-04. Clients MUST prefer `nip44_v2` whenever the
wallet offers it; asking for a scheme the wallet lacks returns
`UNSUPPORTED_ENCRYPTION`.

## Connection URI

```
nostr+walletconnect://<wallet_pubkey>?relay=<wss://relay.example.com>&secret=<32-byte-hex>
```

User scans QR or pastes; app stores. Subsequent calls use this
binding.

## Methods

NIP-47 was split on 2026-08-01 (nostr-protocol/nips#2419) into a small
core plus optional extension specs. Core NIP-47 commands, as of
September 2026:
- `pay_invoice(invoice)` — pay BOLT11.
- `make_invoice(args)` — generate BOLT11.
- `lookup_invoice(args)`.
- `get_balance()`.
- `get_info()`.

Everything else lives in optional NWC extension specs at
`github.com/nostr-wallet-connect/nwc` (as of September 2026):

| Ext | Adds |
|-----|------|
| 02 | notifications (`payment_received`, `payment_sent`) |
| 03 | hold invoices (`make_hold_invoice`, `cancel_hold_invoice`, `settle_hold_invoice`) |
| 04 | `pay_keysend` |
| 05 | `list_transactions` |
| 06 | metadata conventions |
| 07 | deep links |
| 08 | client-initiated ("1-click") connection creation |
| 09 | `lookup_payment` |
| 12 | BOLT12 `make_offer` |
| 321 | BIP-321 `pay` / `receive` |

A wallet advertises these in an `extensions` tag on kind 13194
(`["extensions", "02 03 04 06 07 08"]`) and in the `extensions` array
of `get_info`. Gate every non-core method on that capability event —
never assume it is there.

History: `multi_pay_invoice` and `multi_pay_keysend` were core NIP-47
commands until nostr-protocol/nips#2210 (merged 2026-02-11) dropped
them, six months ahead of the split. `sign_message` was never specified
in NIP-47 at all — it only ever appeared inside the appendix example
info event's content string, and is a wallet-level extension (Alby Hub
implements one). None of the three is defined in the core spec or in
any current NWC extension spec as of September 2026. Wallets may still
answer them; treat them as non-standard.

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

Method-level scoping is wallet-side, bound to the connection secret.
The `nostr+walletconnect://` URI carries only `relay`, `secret` and
`lud16` (NIP-47, as of September 2026) — there is no `&methods=` or
`&budget=` parameter. A call the connection was not granted returns
`RESTRICTED`; the client reads what it actually holds from the kind
13194 info event and from `get_info`.

A client can request a scope up front only via NWC-08 (client-initiated
connections), whose authorization request takes `request_methods` /
`optional_request_methods` (URL-encoded, space-separated) plus
`max_amount` in msat with `renewal_period` (`never` | `daily` |
`weekly` | `monthly` | `yearly`):
```
nostr+walletauth://<client_pubkey>?relay=wss%3A%2F%2Frelay.example.com
  &state=<128-bit-hex>&request_methods=pay_invoice%20get_balance
  &max_amount=1000000&renewal_period=monthly
```

The wallet service MUST grant every method in `request_methods` or
decline the request, and MUST enforce `max_amount` over that period or
decline. Per-app budgets outside that flow are a wallet feature, not
spec — Alby Hub sets a spending budget per app connection in its own UI
(as of September 2026).

## Compared to WebLN / LNURL

| Aspect | WebLN | LNURL | NWC |
|--------|-------|-------|-----|
| Browser-only | yes | wallet | yes |
| Cross-device | no | partial | **yes** |
| Persistent connection | per-page | per-call | persistent |
| Encrypted | https | https | NIP-44 |
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
