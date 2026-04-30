---
name: bitcoin-libraries-bitcoinjs-lib
description: |
  bitcoinjs-lib: TypeScript/JavaScript Bitcoin library. Tx, Script,
  Address, key types, PSBT, BIP32. Browser + Node.
  USE WHEN: building Bitcoin apps in JS/TS, server or browser.
allowed-tools: Read, Grep, Glob
---

# bitcoinjs-lib

The classic JS/TS library for Bitcoin. Browser + Node compatible.

Repo: `github.com/bitcoinjs/bitcoinjs-lib`.

## Install

```bash
npm install bitcoinjs-lib
```

## Quick examples

### Address generation
```ts
import * as bitcoin from "bitcoinjs-lib";

const network = bitcoin.networks.bitcoin;
const keyPair = bitcoin.ECPair.makeRandom({ network });
const { address } = bitcoin.payments.p2wpkh({
    pubkey: keyPair.publicKey, network
});
```

### Tx construction (modern: psbt)
```ts
const psbt = new bitcoin.Psbt({ network });
psbt.addInput({
    hash: "txid...",
    index: 0,
    witnessUtxo: { script: spk, value: 100000 }
});
psbt.addOutput({ address: dest, value: 99000 });
psbt.signInput(0, keyPair);
psbt.finalizeAllInputs();
const tx = psbt.extractTransaction();
console.log(tx.toHex());
```

### BIP32
```ts
import { BIP32Factory } from "bip32";
import * as ecc from "tiny-secp256k1";

const bip32 = BIP32Factory(ecc);
const root = bip32.fromSeed(seedBytes);
const child = root.derivePath("m/84'/0'/0'/0/0");
```

## Companion packages

- `bip32` — HD derivation.
- `bip39` — mnemonic.
- `bip174` (older) — PSBT (now in bitcoinjs-lib).
- `tiny-secp256k1` — secp256k1 ops.
- `bolt11` — BOLT11 invoice decode.

## Network constants

`bitcoinjs.networks`:
- `bitcoin` (mainnet).
- `testnet`.
- `regtest`.

## Compared

| Aspect | bitcoinjs-lib | @scure/btc-signer |
|--------|---------------|-------------------|
| Maturity | Old, well-tested | Newer (2023+) |
| Style | OO + functional | Pure functional |
| Audit | Community-reviewed | Audited (Trail of Bits) |
| Bundle size | Larger | Smaller |
| Dependencies | Many | Minimal |
| Browser-friendly | Some legacy quirks | Excellent |

## Use cases

- Web wallets, browser extensions.
- Node.js Bitcoin services.
- React Native apps (with polyfills).

## Common pitfalls

- `bitcoinjs.ECPair` deprecated in v6+; use `tiny-secp256k1` directly.
- Browser bundlers: may need shims for `crypto`, `buffer`.
- Network mismatch errors when switching mainnet/testnet.

## See also

- [scure-btc-signer/SKILL.md](../scure-btc-signer/SKILL.md)
- [bcoin-js/SKILL.md](../bcoin-js/SKILL.md)
- [bolt11-decoder/SKILL.md](../bolt11-decoder/SKILL.md)
