---
name: bitcoin-libraries-hdwallet-py
description: |
  hdwallet (Python): HD wallet generator + key derivation. Multi-coin,
  BIP32/39/44/49/84/86/85.
  USE WHEN: deriving keys for many cryptocurrencies, scripting key
  generation in Python.
allowed-tools: Read, Grep, Glob
---

# hdwallet (Python)

Pure Python HD wallet library supporting many BIP standards across
many cryptocurrencies.

Repo: `github.com/meherett/python-hdwallet`.

## Install

```bash
pip install hdwallet
```

## Quick example

```python
from hdwallet import HDWallet
from hdwallet.symbols import BTC

hdwallet = HDWallet(symbol=BTC)
hdwallet.from_mnemonic(mnemonic="abandon abandon ... about")
hdwallet.from_path("m/84'/0'/0'/0/0")

print(hdwallet.address())   # bc1q...
print(hdwallet.private_key())
print(hdwallet.public_key())
```

## Features

- BIP32 derivation (any path).
- BIP39 mnemonic.
- BIP44/49/84/86 standard accounts.
- BIP85 sub-seed derivation.
- Multi-currency: 100+ chains.
- Address types: legacy, P2SH, P2WPKH, P2WSH, P2TR.

## Use cases

- Tooling for key derivation across multiple chains.
- Educational / quick prototypes.
- Server-side bulk key generation (NOT recommended for production
  signing; use HW or HSM).

## Common pitfalls

- Server-side key generation has obvious risks (random source,
  memory leakage, etc.).
- Multi-currency = different default paths per chain; verify yours.

## See also

- [python-bitcoinlib/SKILL.md](../python-bitcoinlib/SKILL.md)
- [bdk-python/SKILL.md](../bdk-python/SKILL.md)
- [../../wallets/hd/SKILL.md](../../wallets/hd/SKILL.md)
- [../../cryptography/bip32/SKILL.md](../../cryptography/bip32/SKILL.md)
