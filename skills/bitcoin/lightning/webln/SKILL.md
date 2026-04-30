---
name: lightning-webln
description: |
  WebLN: browser API for Lightning. window.webln exposed by wallet
  extensions / mobile webviews. Methods: enable, getInfo, sendPayment,
  makeInvoice, signMessage. Bitcoin Connect (modern wrapper).
  USE WHEN: building web apps with Lightning payments, integrating
  with Alby/getalby, designing WebLN-compatible flows.
allowed-tools: Read, Grep, Glob
---

# WebLN

WebLN is a JavaScript API that lets web pages interact with the
user's Lightning wallet via a browser extension or in-page provider.

Spec: <https://www.webln.guide/>

## Detection

```js
if (typeof window.webln !== "undefined") {
    await window.webln.enable();
    // Now you can call other methods
}
```

`enable()` triggers a permission prompt the first time on a new
domain.

## Methods

### `getInfo()`

```js
const info = await window.webln.getInfo();
// { node: { alias, pubkey, color }, methods: [...] }
```

Returns wallet info; `methods` lists supported operations.

### `sendPayment(invoice)`

```js
const r = await window.webln.sendPayment("lnbc100u...");
// { preimage: "abcd..." }
```

Invokes wallet UI to confirm payment. Returns preimage on success.

### `makeInvoice(args)`

```js
const r = await window.webln.makeInvoice({
    amount: 1000,    // sats
    defaultMemo: "Coffee"
});
// { paymentRequest: "lnbc1u..." }
```

User confirms amount; wallet generates invoice.

### `signMessage(message)`

```js
const r = await window.webln.signMessage("Hello");
// { signature: "...", message: "Hello" }
```

Signs with the wallet's node key (BIP137-style). Used for auth.

### `verifyMessage(signature, message)`

Verify a signature against the wallet's node pubkey.

### `keysend(args)` (some impls)

```js
await window.webln.keysend({
    destination: "<pubkey>",
    amount: 100,
    customRecords: { "1234": "abc" }
});
```

## Providers

| Provider | Type |
|----------|------|
| **Alby Browser Extension** | Most popular, supports custodial + connect-to-node |
| **getalby.com hosted** | Web-based, login provides webln |
| **Joule** | Older, less maintained |
| **Mutiny Wallet** | Web-based, exposes webln in its iframe |
| **Custom** (e.g., businesses) | Backend-API-backed window.webln shim |

## Bitcoin Connect

A wrapper library that handles WebLN + LNURL + NWC fallbacks:
```html
<script src="https://cdn.jsdelivr.net/npm/@getalby/bitcoin-connect/dist/index.js"></script>
<bc-button label="Connect Wallet"></bc-button>
<script>
window.bitcoinConnect.onConnected(() => {
  window.webln.sendPayment(invoice);
});
</script>
```

Auto-detects:
- Existing webln provider.
- Connect via NWC (Nostr Wallet Connect) URL paste.
- Connect via LNC (Lightning Node Connect, LND-specific).
- Connect via Alby OAuth.

## Permissions model

Per-domain. User explicitly approves:
- `enable()` first time.
- Each `sendPayment` call by default (some wallets allow auto-approve
  rules).

`makeInvoice` typically silent (no permission needed; it's just
generating a receive-side invoice).

## Use cases

- Tipping buttons on blogs.
- Browser-based donation pages.
- Lightning paywalls (server-issued invoice → window.webln pays
  → unlock content).
- LN-based auth (signMessage + server verification).

## Common bugs

- `window.webln` exists but `enable()` not called → all methods
  reject.
- Hard-coding amount in sats vs millisats — webln uses **sats** for
  `makeInvoice`'s `amount`, but invoices internally are msat.
- Not handling user rejection (user closes wallet popup).
- Detecting webln via feature detection only; some wallets expose
  WebLN via shim that fails on actual call.

## See also

- [lnurl/SKILL.md](../lnurl/SKILL.md)
- [nwc/SKILL.md](../nwc/SKILL.md)
- [lightning-address/SKILL.md](../lightning-address/SKILL.md)
