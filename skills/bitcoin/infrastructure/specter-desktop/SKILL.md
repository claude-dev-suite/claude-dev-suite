---
name: bitcoin-infrastructure-specter-desktop
description: |
  Specter Desktop: open-source GUI for Bitcoin Core + multisig
  coordination + HW wallet. Designed for self-custody power users.
  USE WHEN: setting up multisig with Specter, evaluating coordinator
  options.
allowed-tools: Read, Grep, Glob
---

# Specter Desktop

GUI on top of Bitcoin Core, focused on multisig + HW wallet
coordination.

Repo: `github.com/cryptoadvance/specter-desktop` (Python).

## Features

- **Multi-wallet** management (single-sig + multi-sig).
- **HW wallet integration** via HWI: Trezor, Ledger, Coldcard,
  BitBox02, Jade.
- **Multisig coordinator**: n-of-m setup with descriptors.
- **PSBT signing flow** with multiple devices.
- **Watch-only wallets** via xpub.
- **CoinJoin coordinator** integration (JoinMarket, Wabisabi).
- **Lightning** via LND / CLN.
- **Tor support**.

## Setup

```bash
pip install specter-desktop
specter
```

Or use installer for Mac/Windows/Linux. Connects to local
bitcoind via cookie auth or `~/.specter/config.json`.

## Multisig flow

1. Create wallet → "Multi-sig".
2. Add devices: each connected via USB or imported xpub.
3. Pick threshold (e.g., 2-of-3).
4. Verify each device shows the same multisig address.
5. Receive funds.
6. To spend: build PSBT in Specter; send to each device for partial
   sig; combine + finalize + broadcast.

## Compared

| Aspect | Specter Desktop | Sparrow | Caravan |
|--------|------------------|---------|---------|
| Stack | Python + Vue | Java | Web |
| Bitcoin Core required | yes (or alt) | yes (or alt) | no (direct API) |
| HW wallet support | rich | best | basic |
| Lightning | yes | partial | no |
| CoinJoin | yes | yes | no |
| Mobile | no | no | no |

## Use cases

- **Power users** managing multiple wallets / multisig setups.
- **Cross-vendor multisig** coordination.
- **Custody-aware businesses**.

## Common issues

- **Bitcoin Core connection**: cookie file path or RPC credentials
  must be correct.
- **HWI permissions on Linux**: udev rules.
- **PSBT version mismatches** in some flows.

## See also

- [sparrow/SKILL.md](../sparrow/SKILL.md)
- [caravan/SKILL.md](../caravan/SKILL.md)
- [../hardware/hwi/SKILL.md](../../hardware/hwi/SKILL.md)
- [../hardware/multi-vendor-multisig/SKILL.md](../../hardware/multi-vendor-multisig/SKILL.md)
