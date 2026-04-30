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

Alternative: `light-bolt11-decoder`, `@runonflux/bolt11-decoder`.

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
use lightning_invoice::Bolt11Invoice;
let invoice: Bolt11Invoice = "lnbc100u1p...".parse()?;
println!("{:?}", invoice.amount_milli_satoshis());
```

## Go

`lightninglabs/lightning-invoice` or btcsuite's:
```go
import "github.com/lightninglabs/lightning-invoice"
invoice, err := lightning_invoice.Decode("lnbc100u1p...")
```

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
