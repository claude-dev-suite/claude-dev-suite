---
name: lightning-address
description: |
  Lightning Address (LUD-16): email-style identifier resolving to
  LNURL-pay endpoint. user@domain.com → /.well-known/lnurlp/user.
  Also covers BIP 353 DNS payment instructions (₿user@domain, DNSSEC
  TXT record) and bLIP-32 onion-message DNS resolution.
  USE WHEN: building/registering Lightning Addresses or BIP 353 names,
  designing resolver / payer wallet logic.
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

## BIP 353 DNS payment instructions (the non-HTTP alternative)

LUD-16 is not the only human-readable identifier. BIP 353 "DNS Payment
Instructions" (Matt Corallo, Bastien Teinturier) puts a BIP 21 URI —
normally an `lno=` BOLT12 offer — in a DNSSEC-signed TXT record. Same
`user@domain` shape, displayed with a ₿ prefix, no web server in the
path. Status `Complete` in the BIPs repo as of September 2026 (Draft →
Proposed September 2025, Proposed → Complete January 2026 under the
revised BIP process).

Spec: `bip-0353.mediawiki` in `github.com/bitcoin/bips`; bLIP-32 and
bLIP-42 in `github.com/lightning/blips`.

```
₿<user>@<domain>  →  <user>.user._bitcoin-payment.<domain>.  IN TXT

matt.user._bitcoin-payment.mattcorallo.com. 1800 IN TXT "bitcoin:?lno=lno1qsgr30k..."
```

Rules that bite:
- Exactly one `bitcoin:` TXT RR at that label. Concatenate the RR's
  `<character-string>`s in RDATA order with no separator; never across
  RRs. Two matching RRs = invalid, refuse the instructions.
- Every record in the chain MUST be DNSSEC-signed (CNAME/DNAME
  indirection is allowed if each hop is signed). Clients MUST validate
  to the DNS root themselves — trusting a resolver's AD bit is not
  conformant — and MUST NOT accept SHA-1 or <1024-bit RSA signatures.
- MUST NOT cache longer than the lowest TTL in the DNSSEC chain. If the
  URI carries a BOLT12 offer, the TTL must expire before the offer does.
- The ₿ is display only; it is never part of the DNS label. Wallets
  copying the name include the ₿, but SHOULD copy the underlying URI.
- Wallets MUST prefer an explicit address or BIP 21 URI when one is
  already available; DNS resolution is for the human-readable form.
- On-chain addresses in the URI path SHOULD be rotated after each
  confirmed spend, or omitted entirely (leave the path empty).
- `PSBT_OUT_DNSSEC_PROOF = 0x35` (per-output, PSBT v0 and v2) carries a
  1-byte-length-prefixed name plus an RFC 9102 `AuthenticationChain`, so
  a hardware wallet can verify ₿user@domain instead of an opaque script.

### bLIP-32 onion-message resolution

A clearnet DNS lookup still signals to the network that you are about to
pay someone. bLIP-32 "Onion Message DNS Resolution" (Active) moves the
lookup onto Lightning: `dnssec_query` (65536), `dnssec_proof` (65538),
`dnssec_error` (65550) onion messages, with resolver nodes advertising
the `dns_resolver` feature bit 258/259 (bLIP-2). The sender validates the
returned RFC 9102 proof itself, so the resolver is untrusted.

bLIP-42 "Bolt 12 Contacts" (Active) layers on top: attach contact info to
payments made to a stored offer, so the payee can recognize a known
contact and pay back without further interaction.

### Implementations (as of September 2026)

- **LDK** — `lightning-dns-resolver` crate implements bLIP-32 resolution
  on top of the `dnssec-prover` crate.
- **Phoenix / phoenixd** — resolve `<user>.user._bitcoin-payment.<domain>`
  TXT records to a BOLT12 offer. phoenixd's `PayDnsAddress` queries a
  DNS-over-HTTPS resolver and checks the response `AD` flag rather than
  validating the chain locally — weaker than BIP 353 mandates, a common
  shortcut in mobile clients.

## Compared to BOLT12 / BIP 353

| Aspect | Lightning Address | BOLT12 Offer | BIP 353 name |
|--------|-------------------|--------------|--------------|
| Human-friendly | yes | partial (longer string) | yes (₿user@domain) |
| Self-custodial possible | depends on server | yes natively | yes (you own the TXT record) |
| Spec-level | LUD-16 (LNURL) | BOLT12 | BIP 353 (+ bLIP-32) |
| Universal wallet support | yes (most) | partial (CLN, LDK best) | partial (LDK, Phoenix/phoenixd as of Sept 2026) |
| Privacy from server | no (server sees) | better (blinded paths) | no payee round-trip; DNS leak unless bLIP-32 |
| HTTP dependency | yes | no (onion messages) | no (DNS; DoH in practice) |
| Trust anchor | TLS CA + server | none (offer is signed) | DNSSEC root |

## DNS / hosting

Most users get a Lightning Address via a service. Self-host:
- Buy domain.
- Run `phoenixd` or `LNbits` etc.
- Configure web server to serve `/.well-known/lnurlp/<user>`.

Self-host a BIP 353 name from the same domain (no web server needed):
- The zone must be DNSSEC-signed end to end — registrar-published DS
  record at the parent, not just a signed zone file.
- Publish `<user>.user._bitcoin-payment.<domain>` TXT =
  `bitcoin:?lno=<offer>`; leave the URI path empty unless you accept the
  on-chain address-rotation rules above.
- Keep the TTL below the offer's expiry, and low if you rotate.

## Common bugs

- Failing to handle `min/maxSendable` boundary correctly → wallet
  rejects.
- Description_hash mismatch (forgot to update when changing metadata).
- HTTP instead of HTTPS — wallets reject.
- Caching `/.well-known/lnurlp/<user>` aggressively → stale callback
  URLs after server restart.
- BIP 353: building the label as `<user>._bitcoin-payment.<domain>`. The
  literal `user` component stays — `<user>.user._bitcoin-payment.<domain>`.
- BIP 353: publishing the TXT record in an unsigned zone. Without a DS
  record at the parent, conformant wallets see no valid instructions.

## See also

- [lnurl/SKILL.md](../lnurl/SKILL.md)
- [bolt12/SKILL.md](../bolt12/SKILL.md)
- [../../infrastructure/btcpay/SKILL.md](../../infrastructure/btcpay/SKILL.md)
