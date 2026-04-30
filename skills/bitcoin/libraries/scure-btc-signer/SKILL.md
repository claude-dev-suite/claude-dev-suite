---
name: bitcoin-libraries-scure-btc-signer
description: |
  @scure/btc-signer: modern audited Bitcoin signer in TypeScript.
  Pure functional, minimal dependencies, browser-friendly.
  USE WHEN: building modern web/mobile Bitcoin apps, evaluating
  bitcoinjs-lib alternative.
allowed-tools: Read, Grep, Glob
---

# @scure/btc-signer

Modern Bitcoin library by Paul Miller (paulmillr.com). Audited by
Trail of Bits. Smaller, cleaner API than bitcoinjs-lib.

Repo: `github.com/paulmillr/scure-btc-signer`.

## Install

```bash
npm install @scure/btc-signer
```

## Quick examples

### Address generation
```ts
import * as btc from "@scure/btc-signer";
import { hex } from "@scure/base";

const sk = hex.decode("000...01");
const pk = btc.utils.privateAdd(sk, sk);   // example
const addr = btc.WIF().encode(sk);   // WIF
const p2wpkh = btc.p2wpkh(secp.getPublicKey(sk));
console.log(p2wpkh.address);   // bc1q...
```

### PSBT
```ts
const tx = new btc.Transaction();
tx.addInput({
    txid: "...",
    index: 0,
    witnessUtxo: { script: spk, amount: 100000n },
});
tx.addOutputAddress(destAddr, 99000n, btc.NETWORK);
tx.sign(sk);
tx.finalize();
const rawTx = tx.extract();
```

### Taproot
```ts
const tr = btc.p2tr(internalPubkey);
console.log(tr.address);   // bc1p...
```

## Companion

- `@scure/bip32` — HD derivation.
- `@scure/bip39` — mnemonic.
- `@noble/curves` — secp256k1 (used internally).

## Compared

See [bitcoinjs-lib/SKILL.md](../bitcoinjs-lib/SKILL.md) for comparison.

## Use cases

- Modern browser wallets (smaller bundle).
- React Native (better browser-compat than bitcoinjs-lib).
- Server apps wanting audited library.

## Common pitfalls

- Newer ecosystem; some integrations not yet ported.
- BigInt used throughout; older browsers need polyfill.

## See also

- [bitcoinjs-lib/SKILL.md](../bitcoinjs-lib/SKILL.md)
- [mempool-js/SKILL.md](../mempool-js/SKILL.md)
