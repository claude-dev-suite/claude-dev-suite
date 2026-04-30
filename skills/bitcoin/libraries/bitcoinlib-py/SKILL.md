---
name: bitcoin-libraries-bitcoinlib-py
description: |
  bitcoinlib (Python): high-level wallet library by 1200WD. HD wallets,
  multi-currency, address generation, tx construction.
  USE WHEN: building Python wallets, multi-currency BTC + altcoin
  apps.
allowed-tools: Read, Grep, Glob
---

# bitcoinlib (Python)

High-level wallet library by 1200WD. Aims to be a complete
solution for Python Bitcoin (and altcoin) wallets.

Repo: `github.com/1200wd/bitcoinlib`.

## Install

```bash
pip install bitcoinlib
```

## Quick example

```python
from bitcoinlib.wallets import Wallet

wallet = Wallet.create("MyWallet")
addr = wallet.get_key().address
print(addr)

# Sync with chain
wallet.scan()
print(wallet.balance())

# Send
tx = wallet.send_to("bc1q...", 10000)
print(tx.txid)
```

## Features

- Multi-currency: Bitcoin, Litecoin, Dogecoin, Dash, Bitcoin Cash,
  others.
- HD wallet (BIP32/39/44).
- Multiple chain backends: bitcoind, blockcypher, etc.
- Encrypted database for keys.
- Multi-sig.

## Compared

| Aspect | bitcoinlib | python-bitcoinlib | bdk-python |
|--------|------------|-------------------|------------|
| Level | High (wallet) | Low (primitives) | High (wallet) |
| Multi-currency | yes | Bitcoin only | Bitcoin only |
| Audit | Community | Community | Multiple audits |
| Maturity | 7+ years | 10+ years | newer |

## Use cases

- Multi-currency wallets in Python.
- Quick wallet prototypes.
- Educational Python code.

## Common pitfalls

- Default DB is local SQLite; not designed for high-concurrency.
- Multi-currency means bigger surface area; some chains less polished
  than Bitcoin.

## See also

- [python-bitcoinlib/SKILL.md](../python-bitcoinlib/SKILL.md)
- [bdk-python/SKILL.md](../bdk-python/SKILL.md)
- [hdwallet-py/SKILL.md](../hdwallet-py/SKILL.md)
