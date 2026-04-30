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
