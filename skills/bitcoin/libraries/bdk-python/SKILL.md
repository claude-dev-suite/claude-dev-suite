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

Current release: bdkpython 3.1.0 (PyPI, 2026-09-09), built on bdk-ffi
3.1.0 (tagged 2026-09-11) wrapping `bdk_wallet` 3.1.0. Requires
Python >= 3.10.

## Quick example

Targets bdkpython 3.x; checked against 3.1.0 (September 2026).

```python
from bdkpython import (Wallet, Network, NetworkKind, KeychainKind,
                       Descriptor, Persister, EsploraClient)

descriptor = Descriptor("wpkh(tprv.../84h/1h/0h/0/*)", NetworkKind.TEST)
change_descriptor = Descriptor("wpkh(tprv.../84h/1h/0h/1/*)", NetworkKind.TEST)

persister = Persister.new_sqlite("./wallet.sqlite")
wallet = Wallet(descriptor, change_descriptor, Network.TESTNET, persister)

# Sync: the wallet builds a request, the client executes it, the
# wallet applies the resulting Update.
client = EsploraClient("https://mempool.space/testnet/api")
request = wallet.start_full_scan().build()
update = client.full_scan(request, stop_gap=20, parallel_requests=4)
wallet.apply_update(update)
wallet.persist(persister)

print(wallet.balance().total.to_sat())
addr = wallet.reveal_next_address(KeychainKind.EXTERNAL)
print(str(addr.address))
```

## Migrating from the pre-1.0 (0.x) API

The 0.x surface (`Blockchain`, `BlockchainConfig`, `DatabaseConfig`,
`AddressIndex`) was removed in the 1.0 redesign and is absent from the
1.x, 2.x and 3.x wheels. Last 0.x release: bdkpython 0.32.1
(February 2025).

| 0.x (removed) | 3.x |
|---------------|-----|
| `DatabaseConfig.SQLITE` / `.MEMORY` / `SLED` | `Persister.new_sqlite(path)` / `Persister.new_in_memory()` |
| `BlockchainConfig.ESPLORA(EsploraConfig(...))` + `Blockchain(cfg)` | `EsploraClient(url)` |
| `wallet.sync(blockchain, progress)` | `wallet.start_sync_with_revealed_spks().build()` → `client.sync(...)` → `wallet.apply_update(update)` |
| `wallet.get_balance()` | `wallet.balance()` |
| `wallet.get_address(AddressIndex.NEW())` | `wallet.reveal_next_address(KeychainKind.EXTERNAL)` |
| `builder.finish(wallet).psbt` | `builder.finish(wallet)` returns the `Psbt` |
| `address.as_string()` | `str(address)` |

`Descriptor` and `DescriptorSecretKey` constructors take a
`NetworkKind`, not a `Network`, since bdk-ffi 3.0.0 (June 2026).

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

- Each bdk-ffi release pins one `bdk_wallet` version (3.1.0 for
  bdk-ffi 3.1.0, September 2026); check the bdk-ffi release notes for
  the pinned version before assuming a Rust feature is exposed.
- Distribution: one native UniFFI cdylib per platform, loaded through
  `ctypes` — `libbdkffi.so` (Linux), `libbdkffi.dylib` (macOS),
  `bdkffi.dll` (Windows) in the 3.1.0 wheels → packaging
  considerations.

## See also

- [bdk/SKILL.md](../bdk/SKILL.md)
- [bdk-jvm/SKILL.md](../bdk-jvm/SKILL.md)
- [python-bitcoinlib/SKILL.md](../python-bitcoinlib/SKILL.md)
