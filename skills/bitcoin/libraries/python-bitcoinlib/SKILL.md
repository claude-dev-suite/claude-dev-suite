---
name: bitcoin-libraries-python-bitcoinlib
description: |
  python-bitcoinlib by Peter Todd: low-level Bitcoin primitives in
  Python. Tx, Script, Address, key types, RPC client.
  USE WHEN: scripting Bitcoin operations in Python, low-level
  manipulation, Bitcoin Core RPC integration.
allowed-tools: Read, Grep, Glob
---

# python-bitcoinlib

Long-standing low-level Python Bitcoin library by Peter Todd.

Repo: `github.com/petertodd/python-bitcoinlib`.

## Install

```bash
pip install python-bitcoinlib
```

## Quick examples

```python
from bitcoin.core import CTransaction, COIN, lx, b2lx
from bitcoin.core.script import CScript, OP_CHECKSIG
from bitcoin.wallet import CBitcoinAddress, CBitcoinSecret
from bitcoin import SelectParams

SelectParams("mainnet")

# Address from secret
sk = CBitcoinSecret.from_secret_bytes(b"\x01" * 32)
print(sk.pub.to_addr())

# Decode tx
import bitcoin
tx = CTransaction.deserialize(bytes.fromhex("0100..."))
print(b2lx(tx.GetTxid()))   # txid

# RPC client
from bitcoin.rpc import Proxy
rpc = Proxy()
print(rpc.getblockchaininfo())
```

## Submodules

- `bitcoin.core` — Tx, Block, Script.
- `bitcoin.wallet` — Address, key encoding.
- `bitcoin.rpc` — JSON-RPC client.
- `bitcoin.signmessage` — BIP137 message signing.

## Compared

| Aspect | python-bitcoinlib | bitcoinlib | embit |
|--------|-------------------|------------|-------|
| Style | Functional / OO | OO | Embedded-friendly |
| Maturity | 10+ years | 7+ | newer |
| Coverage | Low-level | High-level wallet | Embedded HW signing |

## Use cases

- Scripts manipulating raw txs.
- Custom signing flows.
- Integrating with bitcoind RPC from Python.

## Common pitfalls

- Network selection global; test isolation requires `SelectParams`.
- Hex byte-order: most APIs use internal byte order; `lx` / `b2lx`
  convert to/from RPC display order.

## See also

- [embit/SKILL.md](../embit/SKILL.md)
- [bitcoinlib-py/SKILL.md](../bitcoinlib-py/SKILL.md)
- [bdk-python/SKILL.md](../bdk-python/SKILL.md)
