---
name: lightning-address
description: |
  Lightning Address (LUD-16): email-style identifier resolving to
  LNURL-pay endpoint. user@domain.com → /.well-known/lnurlp/user.
  USE WHEN: building/registering Lightning Addresses, designing
  resolver / payer wallet logic.
allowed-tools: Read, Grep, Glob
---

# Lightning Address

A Lightning Address looks like an email: `user@domain.com`. It's a
**human-friendly identifier** that resolves to a LNURL-pay endpoint.

Spec: LUD-16 in `github.com/lnurl/luds`.

## Resolution

```
input: user@domain.com

GET https://domain.com/.well-known/lnurlp/user
  Accept: application/json

→ same JSON as LNURL-pay (LUD-06):
  {
    "tag": "payRequest",
    "minSendable": 1000,
    "maxSendable": 100000000,
    "metadata": "[[\"text/plain\",\"Pay user@domain.com\"]]",
    "callback": "https://domain.com/lnurl/pay/user/callback"
  }
```

From there, standard LNURL-pay flow.

## Server implementation

A simple Lightning Address server:
1. Web server with `/.well-known/lnurlp/<user>` endpoint per user.
2. Backend connects to LN node (LND, CLN, LDK, phoenixd).
3. On `<callback>?amount=...`, generate BOLT11 invoice, return JSON.
4. Forward incoming Lightning payments to user's account.

Custodial: server holds keys.
Non-custodial: server forwards via LSP / NWC to user-controlled wallet.

## Provider examples

- **getalby.com** — custodial.
- **Wallet of Satoshi** — custodial.
- **Phoenix** — non-custodial via custom resolver.
- **LNbits** — self-hostable.
- **BTCPay Server** — self-hostable.
- **Zaprite** — service for businesses.
- **bitcoin-vn-net** — open-source self-host.

## Privacy

- Same as email: server sees who pays whom.
- No public-key leak (LNURL handles that).
- Receiver privacy depends on whether final hop is custodial.

## Compared to BOLT12

| Aspect | Lightning Address | BOLT12 Offer |
|--------|-------------------|--------------|
| Human-friendly | yes | partial (longer string) |
| Self-custodial possible | depends on server | yes natively |
| Spec-level | LUD-16 (LNURL) | BOLT12 |
| Universal wallet support | yes (most) | partial (CLN, LDK best) |
| Privacy from server | no (server sees) | better (blinded paths) |
| HTTP dependency | yes | no (onion messages) |

## DNS / hosting

Most users get a Lightning Address via a service. Self-host:
- Buy domain.
- Run `phoenixd` or `LNbits` etc.
- Configure web server to serve `/.well-known/lnurlp/<user>`.

## Common bugs

- Failing to handle `min/maxSendable` boundary correctly → wallet
  rejects.
- Description_hash mismatch (forgot to update when changing metadata).
- HTTP instead of HTTPS — wallets reject.
- Caching `/.well-known/lnurlp/<user>` aggressively → stale callback
  URLs after server restart.

## See also

- [lnurl/SKILL.md](../lnurl/SKILL.md)
- [bolt12/SKILL.md](../bolt12/SKILL.md)
- [../../infrastructure/btcpay/SKILL.md](../../infrastructure/btcpay/SKILL.md)
