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
npm install bitcoinjs-lib ecpair tiny-secp256k1
```

As of 15 September 2026 the npm `latest` tag is **7.0.2** (published
2026-09-07); the newest git tag and CHANGELOG entry is **7.0.1** (January
2026), so 7.0.2 is an npm-only patch with no release notes. The v6 line is
still published under the `maintenance-v6` dist-tag (**6.1.8**, 2026-09-07)
and v5 under `maintenance-v5` (**5.2.1**). Examples below target 7.x, which
requires Node >= 18.

## Quick examples

### Address generation
```ts
import * as bitcoin from "bitcoinjs-lib";
import ECPairFactory from "ecpair";
import * as ecc from "tiny-secp256k1";

const ECPair = ECPairFactory(ecc);
const network = bitcoin.networks.bitcoin;
const keyPair = ECPair.makeRandom({ network });
const { address } = bitcoin.payments.p2wpkh({
    pubkey: keyPair.publicKey, network   // Uint8Array in 7.x
});
```

### Tx construction (modern: psbt)
```ts
const psbt = new bitcoin.Psbt({ network });
psbt.addInput({
    hash: "txid...",
    index: 0,
    witnessUtxo: { script: spk, value: 100000n }   // bigint in 7.x
});
psbt.addOutput({ address: dest, value: 99000n });
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

## v6 -> v7 breaking changes

From the 7.0.0 CHANGELOG entry (7.0.0 published to npm 2025-10-02):

- **Buffer -> Uint8Array.** Every public API *returns* `Uint8Array`
  (payments, `Transaction`, `Psbt`, `Block`, `script`). `Buffer` is still
  accepted as input, because it subclasses `Uint8Array`.
- **Satoshi values are `bigint`.** `Transaction.Output.value`, PSBT output
  values, `witnessUtxo.value` and `Psbt.getFee()`. Migration per the
  changelog: `value: 10000` becomes `BigInt(10000)` or `10000n`.
- **typeforce -> valibot.** All typeforce re-exports were removed
  (`Satoshi`, `BufferN`, `UInt32`, `Hex`, ...); valibot `*Schema` exports
  replace them.
- **Dual CJS/ESM.** `"type": "module"`, an `exports` map, `.cjs` files for
  the CJS build, and `.js` extensions required on internal import paths.
- **Node >= 18** (was 8).
- Dependency majors: `bip174` 2.x -> 3.x, `bs58check` 3.x -> 4.x,
  `varuint-bitcoin` 1.x -> 2.x; `valibot` and `uint8array-tools` added.

Staying on v6 is still viable via the `maintenance-v6` dist-tag, but new
code should target 7.x.

## Companion packages

- `bip32` — HD derivation.
- `ecpair` — ECPair signer; split out of the main package in v6.
- `bip39` — mnemonic.
- `bip174` — PSBT wire codec. Still an external runtime dependency of
  7.x (`^3.0.0`, latest 3.0.1 September 2026); only the user-facing
  `Psbt` class lives in bitcoinjs-lib, and it wraps a `PsbtBase`
  instance from this package, exposed as `psbt.data`.
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
| Maturity | Old, well-tested | Newer (npm since Sept 2022; `@scure` scope March 2023) |
| Style | OO + functional | Pure functional |
| Audit | Community-reviewed | Audited (cure53, Feb 2023); self-audited Apr 2026 |
| Bundle size | Larger | Smaller |
| Dependencies | Many | Minimal |
| Browser-friendly | Some legacy quirks | Excellent |

@scure/btc-signer audit history as of September 2026: cure53 audited
v0.3.0 in February 2023, when the package was still named
`micro-btc-signer` (report:
`https://cure53.de/audit-report_micro-btc-signer.pdf`); v2.2.0 was
self-audited by the maintainer in April 2026. MuSig2 and UTXO selection
are documented as not yet audited.

## Use cases

- Web wallets, browser extensions.
- Node.js Bitcoin services.
- React Native apps (with polyfills).

## Common pitfalls

- `bitcoin.ECPair` was **removed** in 6.0.0, not merely deprecated. Install
  the separate `ecpair` package and build it with `ECPairFactory(ecc)`, or
  use `bip32`. `tiny-secp256k1` is the ECC backend you pass into those
  factories, not a drop-in replacement for the keypair type.
- Mixing `number` and `bigint` amounts under 7.x: adding an output with a
  `number` `value` throws `Error adding output.`. Every satoshi amount
  must be a bigint.
- Browser bundlers (Webpack 5+, Vite): 7.x imports no `crypto` or `buffer`
  node builtin and returns `Uint8Array` from every public API, so a
  `Buffer` polyfill is only needed for your own code that still hands
  `Buffer`s in. v6 commonly needed both shims.
- Network mismatch errors when switching mainnet/testnet.

## See also

- [scure-btc-signer/SKILL.md](../scure-btc-signer/SKILL.md)
- [bcoin-js/SKILL.md](../bcoin-js/SKILL.md)
- [bolt11-decoder/SKILL.md](../bolt11-decoder/SKILL.md)
