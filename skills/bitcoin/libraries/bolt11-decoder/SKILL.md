---
name: bitcoin-libraries-bolt11
description: |
  bolt11 decoder libraries: parse / encode BOLT11 Lightning invoices
  in JS, Python, Rust, Go.
  USE WHEN: parsing LN invoices in app code, building Lightning
  payment flows.
allowed-tools: Read, Grep, Glob
---

# BOLT11 Decoder Libraries

BOLT11 invoices are bech32-encoded with structured TLV-like tags.
Multiple language libraries handle parsing.

## JavaScript / TypeScript

`bolt11` (npm):
```bash
npm install bolt11
```

```js
const bolt11 = require("bolt11");
const decoded = bolt11.decode("lnbc100u1p...");
// {
//   payeeNodeKey: "...",
//   tagsObject: { payment_hash, description, ... },
//   millisatoshis: "10000000",
//   timeExpireDate: ...
// }

// Encode
const enc = bolt11.encode({
    millisatoshis: "10000000",
    tags: [
        { tagName: "payment_hash", data: "abc..." },
        { tagName: "description", data: "Pay" },
    ],
}, { network: "bitcoin" });
```

Alternative: `light-bolt11-decoder`, `@atomiqlabs/bolt11`.

Maintenance status as of September 2026: npm `bolt11` is still frozen at
1.4.1, published 2023-03-22, and `light-bolt11-decoder` at 3.2.0,
published 2024-09-20. Both still decode today's invoices, but neither
has a live release line. For new code `@atomiqlabs/bolt11` is a
maintained fork of `bitcoinjs/bolt11` exporting the same
`decode` / `encode` / `sign` API, at 1.6.2 (2026-08-14). Whichever you
take, pin the version and keep an invoice corpus in your own tests
rather than assuming new tag types get handled.

## Python

`pylnurl`-style or `bolt11-py`:
```python
from bolt11 import decode
decoded = decode("lnbc100u1p...")
print(decoded.amount_msat, decoded.payment_hash)
```

## Rust

`lightning-invoice` (part of LDK):
```rust
// lightning-invoice = "0.34"   // 0.34.1, June 2026
use lightning_invoice::Bolt11Invoice;
let invoice: Bolt11Invoice = "lnbc100u1p...".parse()?;
println!("{:?}", invoice.amount_milli_satoshis());
```

## Go

`github.com/lightningnetwork/lnd/zpay32` — the BOLT11 codec that ships
inside LND — is the canonical Go implementation. There is no
`lightninglabs/lightning-invoice` module and no btcsuite BOLT11 package
(neither exists as of September 2026):
```go
import (
    "github.com/btcsuite/btcd/chaincfg"
    "github.com/lightningnetwork/lnd/zpay32"
)

invoice, err := zpay32.Decode("lnbc100u1p...", &chaincfg.MainNetParams)
// invoice.MilliSat, invoice.PaymentHash, invoice.Destination, invoice.Timestamp
```

Decoding is network-parameterised: the `chaincfg.Params` must match the
invoice HRP or `Decode` fails. Encoding is a method on `*Invoice` that
takes a signer — `invoice.Encode(signer)` with a `zpay32.MessageSigner`.

## BOLT12 decoder

For BOLT12 offers, separate libraries (newer):
- `lightning-offers` (Rust / LDK).
- `lib-bolt12` (Python).
- Limited JS/TS support so far.

## Common bugs

- Network mismatch (testnet vs mainnet decoding).
- Padding handling in bech32 — some libs strict, others lenient.
- Min-final-CLTV-expiry default if not in invoice.

## See also

- [../../lightning/bolts/SKILL.md](../../lightning/bolts/SKILL.md)
- [../../lightning/bolt12/SKILL.md](../../lightning/bolt12/SKILL.md)
- [bitcoinjs-lib/SKILL.md](../bitcoinjs-lib/SKILL.md)
