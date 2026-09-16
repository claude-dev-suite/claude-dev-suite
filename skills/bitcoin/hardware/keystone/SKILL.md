---
name: bitcoin-hardware-keystone
description: |
  Keystone 3 Pro: airgap HW wallet with QR + microSD, color touchscreen,
  multi-currency support, fingerprint auth.
  USE WHEN: integrating Keystone, evaluating mid-priced HW options.
allowed-tools: Read, Grep, Glob
---

# Keystone 3 Pro

QR-based airgap hardware wallet by Keystone (formerly Cobo Vault).
The product name is "Keystone 3 Pro", not "Keystone Pro 3". As of
September 2026 the line is: Keystone 3 Pro (plus co-branded and
NFT-customized variants of the same hardware), the Keystone Tablet /
Tablet Plus steel seed backups, and ForgeBox, a build-it-yourself
developer board.

## Hardware

- 4-inch color touchscreen.
- Battery-powered.
- Three secure element chips; seed phrases and fingerprint data live in
  separate chips.
- PCI-grade anti-tamper: disassembly is detected and wipes the device
  (self-destruct), so the secure elements are not a user-removable
  module.
- Fingerprint sensor.
- Camera for QR scanning.
- microSD slot.

## Connectivity

- **No USB / Bluetooth** for signing. QR + microSD only.
- USB only for charging + firmware updates.

## Firmware editions

Same hardware, three firmware builds, cross-upgradable at or above the
installed version. Versions as of September 2026:

| Edition | Latest | Scope |
|---------|--------|-------|
| Multi-coin | 3.0.8 (Sep 2026) | BTC + 5,500+ assets |
| Bitcoin-only | 3.0.4-BTC (Aug 2026) | Bitcoin only |
| Cypherpunk | 3.0.4-CYPHERPUNK (Aug 2026) | BTC, ZEC, XMR |

Devices ship on multi-coin; flash Bitcoin-only to drop the altcoin
parsers.

## Currencies

Multi-coin firmware: Bitcoin, Ethereum, Cosmos, Solana, etc.
Bitcoin-focused features:
- BIP39 seed.
- BIP44/49/84/86.
- Multisig support.
- PSBT signing.

## Backup

- 24-word seed.
- Encrypted microSD backup.
- Optional Shamir Backup (SLIP-39).

## Compatible wallets

- Sparrow.
- BlueWallet.
- Nunchuk.
- BitMask.
- Keystone Nexus, the vendor companion app (the "Companion app"
  branding was retired; `keyst.one/companion-app` now redirects to the
  home page, as of September 2026).

## Compared to other airgap options

| Aspect | Keystone 3 Pro | Coldcard Q | Passport |
|--------|----------------|------------|----------|
| Touchscreen | Yes | Yes | Yes |
| Multi-coin | Yes (BTC-only build exists) | BTC only | BTC only |
| Fingerprint | Yes | No | No |
| Price | Mid | High | High |
| Open-source firmware | Partial | Partial | Yes |

## Limitations

- Multi-coin = more attack surface than BTC-only; mitigated by
  flashing the Bitcoin-only firmware edition.
- Open-source partial — some components closed.

## See also

- [passport/SKILL.md](../passport/SKILL.md)
- [coldcard/SKILL.md](../coldcard/SKILL.md)
- [jade/SKILL.md](../jade/SKILL.md)
