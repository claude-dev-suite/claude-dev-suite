---
name: bitcoin-hardware-bitbox02
description: |
  BitBox02 and BitBox02 Nova (Shift Crypto, Switzerland): Multi Edition
  (BTC + altcoins), Bitcoin-Only Edition. BitBoxApp, dual-chip secure
  element, USB-C; Nova adds an EAL6+ secure chip and Bluetooth LE for
  iPhone/iPad.
  USE WHEN: integrating with BitBox02, evaluating European HW options.
allowed-tools: Read, Grep, Glob
---

# BitBox02 (Shift Crypto)

Swiss hardware wallet. Two devices as of September 2026 — the original
BitBox02 and the BitBox02 Nova — each in two firmware editions:
- **Multi**: BTC + altcoins.
- **Bitcoin-Only**: BTC, ETH disabled (smaller attack surface).

## Hardware

Original BitBox02, per the bitbox.swiss specifications as of
September 2026:

- USB-C connector. No Bluetooth, no NFC.
- Touch sliders (capacitive touch sensors) for input.
- Display: 128x64 px white OLED.
- Dual chip: ATSAMD51J20A microcontroller (120 MHz Cortex-M4F, TRNG)
  running the open-source firmware, plus an **ATECC608B** secure chip
  over I2C. The firmware stays outside the secure chip so it does not
  have to be trusted blindly.
- microSD slot (for backup).

## BitBox02 Nova

Announced 20 June 2025, shipping since summer 2025. The original
BitBox02 stays in the lineup and keeps receiving firmware updates;
Nova is a second model, not a replacement. Same Multi / Bitcoin-Only
edition split, same microSD backup, passphrase and anti-klepto.

Differences from the original (bitbox.swiss specs, September 2026):

- **Secure chip**: Infineon OPTIGA Trust M V3, **EAL6+** certified and
  NDA-free (documentation readable without signing an NDA). Same
  dual-chip split. It also enforces the 10-failed-password factory
  reset with a hardware counter, where the original enforced that
  limit in firmware only.
- **MCU**: unchanged — both spec pages list ATSAMD51J20A. The
  20 June 2025 announcement cites increased storage capacity on the
  device for future firmware features, without naming the component.
- **Display**: 128x64 px white OLED under a tempered glass top.
- **Connectivity**: USB-C **plus Bluetooth Low Energy**. Still no NFC.
- **iPhone / iPad**: first BitBox usable with the BitBoxApp on
  iOS 16+ / iPadOS 16+; USB-A and Lightning adapters ship in the box.
  Bluetooth exists only because USB is restricted on those platforms.
- **Colors**: Midnight Black, Polar White, Bitcoin Orange.

Firmware source has two secure-chip backends (`ATECC*` and `OPTIGA*`
error spaces in `src/securechip/securechip.h`), so integrations that
parse device errors must handle both.

### Whisper (Nova's Bluetooth architecture)

Bluetooth is treated as untrusted transport:

- Runs on a **separate DA14531 MCU** with its own open-source firmware,
  no access to the main MCU's flash and no wallet secrets.
- That firmware is loaded into the Bluetooth chip's RAM on every boot
  and cryptographically verified by the main MCU — no mutable state.
- BLE **LE Secure Connections** with authenticated pairing (matching
  code shown on device and in the app), and the existing BitBox
  end-to-end encryption still runs on top, so the Bluetooth chip
  cannot read transaction data.
- Random private addresses (RPA) and the lowest viable signal strength
  while advertising — pairing only works in close vicinity.
- **USB first**: once data arrives over USB the Bluetooth chip is shut
  down; if USB is already connected when the app starts, the Bluetooth
  firmware never runs. Bluetooth can also be disabled persistently in
  firmware (re-enabling then requires a USB host).

Full design write-up: [Whisper](https://blog.bitbox.swiss/en/whisper-how-the-secure-bluetooth-integration-of-the-bitbox02-nova-works/)
(Shift Crypto, 3 July 2025).

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

HWI added BitBox02 Nova support in **3.2.0** (10 February 2026); older
HWI releases only enumerate the original BitBox02.

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
