---
name: bitcoin-libraries-embit
description: |
  embit: Python Bitcoin library designed for embedded / hardware
  wallets (MicroPython compatible). Used by Specter DIY, Krux,
  SeedSigner.
  USE WHEN: building HW signers, MicroPython Bitcoin apps, low-resource
  Python.
allowed-tools: Read, Grep, Glob
---

# embit

Python Bitcoin library by Crypto Advance team. Optimized for embedded
contexts — runs on MicroPython.

Repo: `github.com/diybitcoinhardware/embit`.

## Install

```bash
pip install embit
```

For MicroPython: package as frozen module on firmware.

PyPI lags the repo. The newest release on PyPI is 0.8.0 (uploaded
2024-05-30); tags `v0.8.1` (2026-06-02) and `v0.8.2` (2026-08-08) were
cut on GitHub but never published to PyPI, so as of September 2026
`pip install embit` still gives you the 2024 build. To get the later
fixes, install the tag directly:

```bash
pip install "embit @ git+https://github.com/diybitcoinhardware/embit@v0.8.2"
```

Post-0.8.0 changes, per the repo `CHANGELOG.md`: 0.8.1 adds PSBT
`PSBT_IN_TAP_KEY_SIG` (Taproot key-spend signature) parsing, declares
CPython 3.10+, stops shipping prebuilt `libsecp256k1` in the artifacts
(the ctypes backend is discovered on the system, pure-Python fallback
otherwise) and tightens BIP39 validation; 0.8.2 aligns PSBT version
parsing with BIP 174 / BIP 370.

What the downstream signers pin, as of September 2026:

| Project | embit source |
|---------|--------------|
| SeedSigner | `embit==0.8.0` from PyPI, hash-locked in `requirements.txt` |
| Krux | submodule `vendor/embit` at `fff7ffa4` (2026-06-02) |
| Specter DIY | `f469-disco` submodule `libs/common/embit` at `eb6104fd` (v0.8.2) |

## Quick examples

### Address generation
```python
from embit import bip32, bip39, networks, script

mnemonic = "abandon abandon abandon ... about"
seed = bip39.mnemonic_to_seed(mnemonic)
root = bip32.HDKey.from_seed(seed)
acc = root.derive("m/84h/0h/0h")
xpub = acc.to_public()
addr = script.p2wpkh(acc.derive("0/0").key).address(networks.NETWORKS["main"])
print(addr)
```

### PSBT
```python
from embit import psbt

psbt_obj = psbt.PSBT.from_string(psbt_b64)
# inspect, sign
for inp in psbt_obj.inputs:
    inp.partial_sigs[some_pubkey] = sig_bytes
print(psbt_obj.to_string())
```

## Modules

- `embit.bip32` — HD derivation.
- `embit.bip39` — mnemonic.
- `embit.psbt` — PSBT.
- `embit.script` — Script primitives, p2pkh/p2sh/p2wpkh/p2wsh/p2tr.
- `embit.networks` — main, test, signet, regtest.
- `embit.descriptor` — descriptor parsing.
- `embit.liquid` — Liquid extensions.

## Use cases

- **HW wallet signers**: SeedSigner, Krux, Specter DIY.
- **MicroPython Bitcoin apps**.
- **Lightweight Python wallets**.

## Compared

| Aspect | embit | python-bitcoinlib |
|--------|-------|-------------------|
| Embedded-friendly | yes | no |
| MicroPython | yes | no |
| RPC client | no | yes |
| Maturity | newer | 10+ years |

## Common pitfalls

- API differences from python-bitcoinlib; not a drop-in replacement.
- MicroPython port has subset of features; verify before relying.

## See also

- [python-bitcoinlib/SKILL.md](../python-bitcoinlib/SKILL.md)
- [../../hardware/seedsigner/SKILL.md](../../hardware/seedsigner/SKILL.md)
- [../../hardware/krux/SKILL.md](../../hardware/krux/SKILL.md)
- [../../hardware/specter-diy/SKILL.md](../../hardware/specter-diy/SKILL.md)
