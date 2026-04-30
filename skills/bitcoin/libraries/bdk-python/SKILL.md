---
name: bitcoin-libraries-bdk-python
description: |
  bdkpython: Python bindings to BDK. Same descriptor-first wallet
  API as Rust BDK. UniFFI-generated.
  USE WHEN: building Python wallets with BDK quality, multi-language
  app where Python integrates same logic as Rust/Swift.
allowed-tools: Read, Grep, Glob
---

# bdkpython

Python bindings for BDK. Same API as Rust BDK exposed via UniFFI.

Repo: `github.com/bitcoindevkit/bdk-python`.

## Install

```bash
pip install bdkpython
```

## Quick example

```python
from bdkpython import (Wallet, Network, Descriptor, ChangeSet,
                       BlockchainConfig, EsploraConfig, Blockchain)

descriptor = Descriptor("wpkh(xprv.../84h/0h/0h/0/*)", Network.BITCOIN)
change_descriptor = Descriptor("wpkh(xprv.../84h/0h/0h/1/*)", Network.BITCOIN)

wallet = Wallet(descriptor, change_descriptor, Network.BITCOIN, "/path/to/db")

# Sync
config = BlockchainConfig.ESPLORA(
    EsploraConfig("https://mempool.space/api", None, 5, 100, None))
blockchain = Blockchain(config)
wallet.sync(blockchain, None)

print(wallet.get_balance().total)
addr = wallet.get_address(AddressIndex.NEW())
print(addr.address.as_string())
```

## Compared

| Aspect | bdkpython | python-bitcoinlib | bitcoinlib |
|--------|-----------|-------------------|------------|
| Backed by | Rust (BDK) | Pure Python | Pure Python |
| Performance | Best | OK | OK |
| Audit | BDK audited | Community | Community |
| Descriptor-first | Yes | No | Partial |
| Multi-platform | Yes (FFI) | Pure Python | Pure Python |

## Use cases

- Production Python wallets needing BDK-quality.
- Multi-language apps (same BDK API in Python + Rust + Swift).

## Common pitfalls

- UniFFI bindings sometimes lag Rust BDK by a version.
- Distribution: native `.so` / `.dylib` per platform → packaging
  considerations.

## See also

- [bdk/SKILL.md](../bdk/SKILL.md)
- [bdk-jvm/SKILL.md](../bdk-jvm/SKILL.md)
- [python-bitcoinlib/SKILL.md](../python-bitcoinlib/SKILL.md)
