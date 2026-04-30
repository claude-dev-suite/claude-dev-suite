---
name: lightning-lnurl
description: |
  LNURL: bech32-encoded HTTP URL fetched by wallet to enable payment
  flows. LUDs (LNURL specs): LUD-01 (encoding), LUD-04 (auth), LUD-06
  (pay), LUD-09 (success action), LUD-12 (comment), LUD-16 (lightning
  address), LUD-21 (verify).
  USE WHEN: implementing LNURL servers/clients, building Lightning
  Address resolver, designing pay/withdraw/auth flows.
allowed-tools: Read, Grep, Glob
---

# LNURL

LNURL is a set of protocols for using Lightning via HTTP-mediated
flows. Wallet scans a bech32-encoded URL, fetches a JSON descriptor,
then follows the workflow indicated.

Specs (LUDs) live at `github.com/lnurl/luds`.

## Encoding (LUD-01)

```
LNURL = bech32(hrp="lnurl", data=URL bytes)
```

Example URL `https://example.com/pay/123` →
`LNURL1DP68GURN8GHJ7MR9VAJKUEPWD3HXY6T5WVHXXMMD9AKXUATJDSKHQCT5`

Wallets scan QR with `LNURL...` prefix or `lightning:LNURL...` URI.

## Common LNURL types

### LUD-04: LNURL-auth

Login via Lightning. Server issues challenge, wallet signs with
derived key per server, server verifies.
- Stateless: server's pubkey derived from `challenge_response`.
- Per-domain key derivation: `derive_lnurl_key(seed, domain)` →
  same wallet's "identity" with same domain across sessions.

Use case: account login / OAuth-like.

### LUD-06: LNURL-pay

Wallet fetches metadata:
```json
{
  "tag": "payRequest",
  "minSendable": 1000,
  "maxSendable": 100000000,
  "metadata": "[[\"text/plain\",\"Coffee\"]]",
  "callback": "https://example.com/lnurl/pay/123/callback",
  "commentAllowed": 200
}
```

User chooses amount, optional comment, then GETs callback:
```
GET /callback?amount=5000&comment=Thanks
→ { "pr": "lnbc50u1...", "successAction": {...} }
```

Wallet pays the BOLT11 invoice. After success, optionally show
`successAction` (URL, message, AES-encrypted message).

### LUD-09: Success Action

After payment success:
- `message`: text to show user.
- `url`: redirect (e.g., download link).
- `aes`: encrypted blob decrypted by preimage.

### LUD-12: Comment

If `commentAllowed > 0`, payer can attach a free-form text comment
to the payment.

### LUD-16: Lightning Address

`user@domain.com` — see [lightning-address/SKILL.md](../lightning-address/SKILL.md).
Resolves to `https://domain.com/.well-known/lnurlp/user`, returns
LNURL-pay metadata.

### LUD-21: Verify

Allow client to verify payment status post-pay:
```
GET /callback/verify/<payment_hash>
→ { "settled": true, "preimage": "..." }
```

### LUD-XX: LNURL-withdraw

Server pre-funds a withdrawal. User scans, wallet calls callback,
server pays the wallet's invoice. Used for faucets, refunds, voucher
redemption.

## URL hashing for invoice metadata

LNURL-pay binds the metadata to the invoice via:
```
description_hash = SHA256(metadata_json_string)
```

The BOLT11 invoice has tag `h` (description_hash) instead of `d`
(description). Wallet verifies that the displayed metadata matches.

## Flow example: LNURL-pay end to end

```
1. User scans QR → wallet decodes → URL = https://merchant.com/pay/abc
2. GET https://merchant.com/pay/abc
   → { tag: "payRequest", minSendable, maxSendable, metadata, callback, ... }
3. Wallet shows description (from metadata), user picks amount.
4. GET <callback>?amount=<msat>
   → { pr: "lnbc...", successAction }
5. Wallet decodes pr, verifies description_hash == SHA256(metadata_json).
6. Wallet pays the invoice.
7. After success, wallet shows successAction.
```

## Security considerations

- Always verify `description_hash`. Otherwise server could swap
  metadata mid-flow.
- `successAction.url` should be on the same domain as the callback
  (mitigate phishing).
- LNURL-auth: per-domain derivation prevents replay across services.

## Implementation libraries

- **LNURL.js** — Node/browser.
- **lnurl-rust** — Rust.
- **pylnurl** — Python.
- **BTCPay Server**, **LNbits**, **Phoenix**, **Mutiny** — built-in
  client/server.

## Common bugs

- Skipping description_hash verification → MITM swaps invoice
  description silently.
- Comment too long (>commentAllowed) → server rejects, payment fails.
- Treating LNURL as a wallet address — it's a URL, not a pubkey.
- Fetching callback with HTTP (not HTTPS) on production → MITM risk.

## See also

- [lightning-address/SKILL.md](../lightning-address/SKILL.md)
- [bolt12/SKILL.md](../bolt12/SKILL.md)
- [webln/SKILL.md](../webln/SKILL.md)
- [nwc/SKILL.md](../nwc/SKILL.md)
