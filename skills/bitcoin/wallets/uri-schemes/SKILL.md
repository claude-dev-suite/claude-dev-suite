---
name: bitcoin-uri-schemes
description: |
  Bitcoin payment URI scheme (BIP21), Lightning URIs, BIP70/72 (mostly
  deprecated), PayJoin URI extension (BIP78), unified URIs combining
  on-chain + Lightning.
  USE WHEN: parsing/generating bitcoin: URIs, building QR codes,
  designing wallet payment requests.
allowed-tools: Read, Grep, Glob
---

# Bitcoin Payment URI Schemes

## BIP21 — Base format

```
bitcoin:<address>?<params>
```

Parameters (all optional):
- `amount=` — in **BTC** (yes, not sats).
- `label=` — recipient name.
- `message=` — note for the payer.
- `r=` — BIP70 payment request URL (deprecated).

Examples:
```
bitcoin:bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh
bitcoin:bc1qxy2...?amount=0.001&label=Coffee%20Shop
bitcoin:bc1qxy2...?amount=0.0005&message=Order%20%23123
```

Unknown params with `req-` prefix MUST cause the parser to reject the
URI (forward-compat hard requirement). Other unknown params can be
ignored.

## BIP70 / BIP72 (legacy, deprecated)

`r=https://example.com/pay/123` pointed to a server-served payment
request with X.509 cert. Discontinued in modern wallets due to:
- TLS cert chain trust issues.
- Centralization (server must be online).
- Phishing surface.

Bitcoin Core removed BIP70 in 2021.

## PayJoin URI (BIP78)

Extends BIP21:
```
bitcoin:bc1q...?amount=0.001&pj=https://payjoin.example.com/endpoint
```

`pj=` is the PayJoin endpoint. Wallet sees this and offers a PayJoin
flow: instead of sending a normal tx, the wallet posts the unsigned
tx to the endpoint, which adds receiver inputs/outputs and returns
a modified PSBT to sign.

PayJoin v2 (async):
```
&pjos=0&pjes=...    # additional params for v2 relay handshake
```

## Lightning URIs

Lightning has its own URI:
```
lightning:lnbc100u1p...   (BOLT11 invoice)
lightning:lnbc1...        (BOLT12 offer; same prefix, different format)
lightning:lnurl...        (LNURL-bech32)
```

LNURL itself uses bech32 encoding for the underlying URL:
```
LNURL1DP68GURN8GHJ7MR... → https://example.com/lnurl/pay/123
```

Wallets recognize either prefix.

## Unified URIs (BOLT12 + on-chain)

Modern wallets support combined URIs:
```
bitcoin:bc1q...?amount=0.001&lightning=lnbc100u1p...
```

The wallet picks based on availability:
- Lightning if recipient has a usable invoice and sender has LN.
- On-chain otherwise.

Some wallets default to Lightning if both work.

## Lightning Address (LN-Addr spec)

Email-style address:
```
user@domain.com
```

Resolution:
```
GET https://domain.com/.well-known/lnurlp/user
→ returns LNURL-pay metadata
→ wallet asks for amount → POST /callback → receives invoice
```

Render in QR as `lightning:lnurl1...` (the LNURL-pay encoded URL).

## QR encoding

Bitcoin URIs in QR codes use UPPER CASE for higher density (alphanumeric
mode) when possible. Bech32 is already uppercase-friendly. URL params
preserve case (URL-encoded).

Example: `BITCOIN:BC1QXY2...?AMOUNT=0.001` is denser than mixed-case.
But mixed-case URIs are still valid; both should be accepted.

## Implementations

- `bitcoinjs-lib`: `bitcoin-uri` package.
- `python-bitcoinlib`: `bitcoin.bip21`.
- BDK: `bdk::Address::parse_url()`.
- Most wallets accept both bare addresses and full URIs.

## Common bugs

- Treating `amount=` as sats (it's BTC, decimal). Off-by-1e8 errors
  are common.
- URL-decoding `message=` on receipt without sanitization → XSS in
  wallet UI.
- Failing to reject unknown `req-` params → security hole if a future
  spec adds a `req-must-not-pay-to-this-address` param.
- Generating QR with mixed-case bech32 → some scanners reject (Bech32
  spec mandates all-lower or all-upper).
- Missing `lightning:` prefix on LN URIs → wallet doesn't recognize.

## See also

- [../../lightning/lnurl/SKILL.md](../../lightning/lnurl/SKILL.md)
- [../../lightning/lightning-address/SKILL.md](../../lightning/lightning-address/SKILL.md)
- [../../privacy/payjoin/SKILL.md](../../privacy/payjoin/SKILL.md)
