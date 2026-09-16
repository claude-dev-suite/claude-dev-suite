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

## Project status — winding down (as of September 2026)

In issue [#850 "Future of this repo"](https://github.com/bitcoin-core/HWI/issues/850)
(opened 18 August 2026; covered by Optech on 28 August 2026) Ava Chow
(`achow101`) set out the end-of-life plan: finish MuSig2, cut what will
likely be the **final release**, then hold in minimal maintenance mode
until a drop-in replacement is ready, at which point the repo is
**archived**.

Stated reasons: HWI has been essentially a solo project for years, and
Python's limitations prevent deterministic builds, so it can never ship
inside Bitcoin Core — the goal it was originally written for.

Effective immediately from that announcement:
- **No new features or feature requests**, except those needed for MuSig2.
- **No PRs for new devices.** The supported-device list below is frozen.
- Latest release is still **3.2.0 (10 February 2026)**; MuSig2 work is
  in flight (PR #794, open as of September 2026).

The announcement names [BHWI](https://github.com/wizardsardine/bhwi) —
Wizardsardine's Rust reimplementation, still self-described as WIP as of
September 2026 — as the promising successor. Treat BHWI as the
forward-looking integration target; HWI remains the right choice for
anything shipping today.

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

As of HWI 3.2.0 (February 2026). Frozen — no new devices are being
accepted (see Project status).

- Trezor Model One, Model T, Safe 3, Safe 5 (Safe 5 added in 3.1.0,
  September 2024).
- Ledger Nano S Plus, Nano X, Stax, Flex.
- Coldcard Mk4, Mk5, Q.
- BitBox02 (Multi + Bitcoin-Only), BitBox02 Nova (added in 3.2.0).
- Blockstream Jade, Jade Plus (added in 3.2.0).
- (Some legacy: KeepKey.)

HWI does not model-discriminate Coldcards. Its own support matrix
(`docs/devices/index.rst`) has a single **Coldcard** column, and the
CKCC driver enumerates on one Coinkite HID VID/PID (`0xd13e:0xcc10`),
always reporting `"model": "coldcard"` (only `_simulator` / `_edge`
suffixes are appended). So the Coldcard Mk5 — announced 10 March 2026,
a month after 3.2.0 shipped — works on released HWI with no code
change and no PR that ever names it: it runs the same Mk4 firmware
builds over the same protocol and the same VID/PID.

3.2.0 also added Testnet4 support, native Jade PSBT signing and PSBT
MuSig2 fields.

## CLI usage

```bash
# Detect devices
hwi enumerate

# Since 3.0.0 (April 2024) emulators/simulators are ignored by default;
# opt back in with --emulators
hwi --emulators enumerate

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

HWI handles **wallet policies** for multisig, but *where* the
registration happens differs by release:

**Released HWI (through 3.2.0, February 2026)** — there is no
registration subcommand. The workflow is:
- Build the descriptor with all signers.
- Submit the PSBT to `hwi signtx`; iterate over devices, each signs
  partial.
- For Ledger, the driver reconstructs the wallet policy from the PSBT's
  `bip32_derivation` fields and calls `register_wallet` inline on every
  `signtx` / `displayaddress`. The user re-confirms the policy on the
  device each run; the returned HMAC is not persisted between calls.

**On master, unreleased as of September 2026** — PRs
[#841](https://github.com/bitcoin-core/HWI/pull/841) and
[#792](https://github.com/bitcoin-core/HWI/pull/792) (merged August 2026)
add explicit BIP-388 policy plumbing:
- `hwi registerdescriptor <name> <descriptor>` returns
  `{"registration": "..."}`.
- `hwi displayaddress --registration <reg> --index N [--change]`.
- `hwi signtx --registration <reg>` (repeatable for multiple policies).

Whether this ships depends on the final MuSig2 release (see Project
status).

## Common issues

- **Permissions**: USB device permissions on Linux (udev rules
  required for hidraw / libusb).
- **Vendor pin entry**: some devices ask for PIN via screen; HWI
  blocks until user inputs.
- **Wallet policy rejected** for multisig: on released HWI the Ledger
  policy prompt appears on every signing run and a declined (or timed
  out) confirmation surfaces as a device error, not a policy error.
- **Macros / scripts**: passing PIN via env vars only for some
  vendors; secure handling required.

## See also

- [trezor/SKILL.md](../trezor/SKILL.md)
- [ledger/SKILL.md](../ledger/SKILL.md)
- [coldcard/SKILL.md](../coldcard/SKILL.md)
- [bitbox02/SKILL.md](../bitbox02/SKILL.md)
- [jade/SKILL.md](../jade/SKILL.md)
- [psbt-flows/SKILL.md](../psbt-flows/SKILL.md)
