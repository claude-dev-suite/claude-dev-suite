---
name: bitcoin-hardware-hwi
description: |
  HWI (Hardware Wallet Interface): standardized Python API across HW
  vendors (Trezor, Ledger, Coldcard, BitBox02, Jade, etc.). Used by
  Bitcoin Core, Sparrow, Specter for cross-vendor signing.
  USE WHEN: integrating multi-vendor HW signing, building wallets
  that support several HW.
allowed-tools: Read, Grep, Glob
---

# HWI (Hardware Wallet Interface)

Python library + CLI for **vendor-agnostic** HW wallet operations.
Maintained by Bitcoin Core team (`bitcoin-core/HWI`).

## Why HWI

Each HW vendor has its own protocol (Trezor's, Ledger's BOLOS,
Coldcard's CKCC, BitBox02's, Jade's). HWI unifies them under one
API:
- `enumerate` — list connected devices.
- `getmasterxpub` / `getxpub`.
- `displayaddress`.
- `signtx` / `signpsbt`.
- `signmessage`.
- `setupdevice`, `wipe`, etc.

## Supported vendors

- Trezor Model One, Model T, Safe 3, Safe 5.
- Ledger Nano S Plus, Nano X, Stax, Flex.
- Coldcard Mk4, Q.
- BitBox02 (Multi + Bitcoin-Only).
- Blockstream Jade.
- (Some legacy: KeepKey.)

## CLI usage

```bash
# Detect devices
hwi enumerate

# Get xpub
hwi -t trezor getxpub "m/84'/0'/0'"

# Sign a PSBT
hwi -t coldcard signtx <psbt_base64>

# Display an address for verification
hwi -t ledger displayaddress --path "m/84'/0'/0'/0/0"
```

## Python API

```python
import hwilib.commands

devices = hwilib.commands.enumerate()
device = devices[0]   # pick one
xpub = hwilib.commands.getxpub(device, "m/84'/0'/0'")
signed_psbt = hwilib.commands.signtx(device, base64_psbt)
```

## Integration in Bitcoin Core

Bitcoin Core's `external-signer` interface uses HWI:
```bash
bitcoin-cli -rpcwallet=hot \
  -named externalsigner_setup \
  command="hwi --chain main"

# Now wallet RPC funded via external signer
bitcoin-cli -rpcwallet=hot getnewaddress
# Generates address; user verifies on device.

bitcoin-cli -rpcwallet=hot walletprocesspsbt <psbt>
# Calls HWI to sign on device.
```

## Multisig with multiple devices

HWI supports **wallet policies** for multisig:
- Build descriptor with all signers.
- For each device, register the wallet policy (HMAC-bound).
- Submit PSBT to HWI; iterate over devices, each signs partial.

## Common issues

- **Permissions**: USB device permissions on Linux (udev rules
  required for hidraw / libusb).
- **Vendor pin entry**: some devices ask for PIN via screen; HWI
  blocks until user inputs.
- **Wallet policy not registered** for multisig → device rejects.
- **Macros / scripts**: passing PIN via env vars only for some
  vendors; secure handling required.

## See also

- [trezor/SKILL.md](../trezor/SKILL.md)
- [ledger/SKILL.md](../ledger/SKILL.md)
- [coldcard/SKILL.md](../coldcard/SKILL.md)
- [bitbox02/SKILL.md](../bitbox02/SKILL.md)
- [jade/SKILL.md](../jade/SKILL.md)
- [psbt-flows/SKILL.md](../psbt-flows/SKILL.md)
