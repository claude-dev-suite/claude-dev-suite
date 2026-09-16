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

## Status (as of September 2026)

Effectively dormant. Check this before picking it for new work.

- Latest release: **0.12.2, 3 June 2023** (PyPI). `master` still declares
  `__version__ = '0.12.2'`, so the unreleased tip is not ahead by a version.
- Last commit on `master`: **14 March 2025**. The repo is not archived
  (38 open issues and 23 open pull requests as of September 2026) but has
  had no upstream activity for eighteen months.
- **No Taproot.** `bitcoin/wallet.py` has no P2TR address class,
  `bitcoin/bech32.py` carries no bech32m constant, and
  `bitcoin/core/script.py` defines only `SIGVERSION_BASE` and
  `SIGVERSION_WITNESS_V0` — no taproot sighash, no `OP_CHECKSIGADD`.
- **No PSBT.** There is no BIP174 module in the package; PSBTv2 (BIP370)
  is likewise absent.
- The README pins `bitcoin.rpc` support at "Bitcoin Core v24.0 or later"
  and has not revised that baseline since, so RPC shape changes in Core
  majors after v24 are untested upstream.

Still sound for legacy and segwit-v0 byte-level work and as a thin
`bitcoind` JSON-RPC client. For Taproot, PSBT or descriptor wallets reach
for `bdkpython` (3.1.0, 9 September 2026) instead. `python-bitcointx`
(Simplexum) is the low-level fork that went further on taproot script
handling, but it is dormant too — last release 1.1.5, 22 January 2024.

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
| First PyPI release | 0.1.1, May 2014 | 0.3.33a0, Feb 2018 | 0.1.0, Oct 2020 |
| Latest release (Sept 2026) | 0.12.2, Jun 2023 | 0.7.9, Jun 2026 | 0.8.0, May 2024 |
| Coverage | Low-level | High-level wallet | Embedded HW signing |

Of the three, only `bitcoinlib` is still shipping releases as of September
2026 (0.7.9, 5 June 2026). `embit` carries git tags `v0.8.1` and `v0.8.2`
that were never published, so `pip install embit` resolves to 0.8.0.

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
