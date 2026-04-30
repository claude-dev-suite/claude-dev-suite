---
name: bitcoin-hardware-keystone
description: |
  Keystone Pro 3: airgap HW wallet with QR + microSD, color touchscreen,
  multi-currency support, fingerprint auth.
  USE WHEN: integrating Keystone, evaluating mid-priced HW options.
allowed-tools: Read, Grep, Glob
---

# Keystone Pro 3

QR-based airgap hardware wallet by Keystone (formerly Cobo Vault).

## Hardware

- 4-inch color touchscreen.
- Battery-powered.
- Removable secure element module.
- Fingerprint sensor.
- Camera for QR scanning.
- microSD slot.

## Connectivity

- **No USB / Bluetooth** for signing. QR + microSD only.
- USB only for charging + firmware updates.

## Currencies

Multi-coin: Bitcoin, Ethereum, Cosmos, Solana, etc. Bitcoin-focused
features:
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
- BitMask.
- Native Keystone Companion app.

## Compared to other airgap options

| Aspect | Keystone Pro 3 | Coldcard Q | Passport |
|--------|----------------|------------|----------|
| Touchscreen | Yes | Yes | Yes |
| Multi-coin | Yes | BTC only | BTC only |
| Fingerprint | Yes | No | No |
| Price | Mid | High | High |
| Open-source firmware | Partial | Partial | Yes |

## Limitations

- Multi-coin = more attack surface than BTC-only.
- Open-source partial — some components closed.

## See also

- [passport/SKILL.md](../passport/SKILL.md)
- [coldcard/SKILL.md](../coldcard/SKILL.md)
- [jade/SKILL.md](../jade/SKILL.md)
