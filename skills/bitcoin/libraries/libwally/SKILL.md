---
name: bitcoin-libraries-libwally
description: |
  libwally-core: Blockstream's C library for wallet primitives. BIP32/39,
  PSBT, Liquid Confidential Transactions, BIP143, Schnorr. Bindings to
  Python, JS, Java, Swift.
  USE WHEN: building cross-language wallets via libwally bindings,
  integrating Liquid CT.
allowed-tools: Read, Grep, Glob
---

# libwally-core

Blockstream's C library focused on wallet primitives (vs full
node code).

Repo: `github.com/ElementsProject/libwally-core`.

## Features

- BIP32 HD derivation.
- BIP39 mnemonic.
- BIP38 password-encrypted private keys.
- PSBT (BIP174).
- Bitcoin Tx serialization.
- Liquid Confidential Transactions.
- Schnorr (BIP340).
- BIP85.

## Bindings

- **Python**: `wallycore`.
- **JavaScript**: `libwally-core-js` (WebAssembly).
- **Java**: `wally-android`, `wally-jvm`.
- **Swift**: native bindings for iOS.
- **C** (native).

## Quick example (Python)

```python
import wallycore as wally

seed = wally.bip39_mnemonic_to_seed512("abandon abandon ... about", "")
master = wally.bip32_key_from_seed(seed, wally.BIP32_VER_MAIN_PRIVATE)
account = wally.bip32_key_from_parent_path(master,
    [84 + 0x80000000, 0 + 0x80000000, 0 + 0x80000000])
xpub = wally.bip32_key_to_base58(account, wally.BIP32_FLAG_KEY_PUBLIC)
```

## Use cases

- Blockstream Green Wallet (uses libwally extensively).
- Cross-platform wallet libraries (one C core, many bindings).
- Liquid integrations.

## Compared

| Aspect | libwally | rust-bitcoin | bitcoinj |
|--------|----------|--------------|----------|
| Language | C (with bindings) | Rust | Java |
| Liquid CT | Yes | No | No |
| HW wallet | No | No | No |
| Performance | Best (C) | Best | Acceptable |

## Common pitfalls

- C API is stateful; clean up with `wally_*_free` functions.
- Build with `--enable-elements` for Liquid CT support.
- Bindings sometimes lag C library version.

## See also

- [secp256k1-c/SKILL.md](../secp256k1-c/SKILL.md)
- [../../l2/liquid/SKILL.md](../../l2/liquid/SKILL.md)
- [../../infrastructure/specter-desktop/SKILL.md](../../infrastructure/specter-desktop/SKILL.md)
