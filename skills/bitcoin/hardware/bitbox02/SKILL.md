---
name: bitcoin-hardware-bitbox02
description: |
  BitBox02 (Shift Crypto, Switzerland): Multi Edition (BTC + altcoins),
  Bitcoin-Only Edition. BitBoxApp, side-channel-resistant SE, NFC,
  USB-C.
  USE WHEN: integrating with BitBox02, evaluating European HW options.
allowed-tools: Read, Grep, Glob
---

# BitBox02 (Shift Crypto)

Swiss hardware wallet. Two editions:
- **Multi**: BTC + altcoins.
- **Bitcoin-Only**: BTC, ETH disabled (smaller attack surface).

## Hardware

- USB-C connector.
- Touch sliders for input.
- Display (small but readable).
- Secure Element (Atmel ATECC508A) + microcontroller.
- microSD slot (for backup).

## Backup

- 24-word BIP39 seed.
- Backup also written to microSD (encrypted with device password).
- Restore: insert microSD + enter password.

## App

BitBoxApp — desktop / mobile. Direct wallet interface plus
device-management.

## API

JavaScript: `@bitbox-mobile/api`.
Python: `bitbox-bridge`.

Third-party: Sparrow, Specter, HWI, Electrum.

## Compared

| Aspect | BitBox02 | Trezor | Coldcard |
|--------|----------|--------|----------|
| Origin | Switzerland | Czech | USA (Coinkite) |
| Touch input | Slider | Touchscreen (Model T+) | Buttons / touchscreen (Q) |
| BTC-only option | Yes (Bitcoin-Only Edition) | No | Yes |
| Secure Element | Yes | Optional (Safe series) | Yes |
| Open-source firmware | Yes | Yes | Partial |

## Common issues

- **microSD insertion**: backup-encrypted SD card must be inserted
  for restore; devices ship with one.
- **Slider input** has learning curve vs touchscreen.
- **App vs HWI**: some flows easier in BitBoxApp; HWI works for
  generic integration.

## See also

- [trezor/SKILL.md](../trezor/SKILL.md)
- [coldcard/SKILL.md](../coldcard/SKILL.md)
- [hwi/SKILL.md](../hwi/SKILL.md)
