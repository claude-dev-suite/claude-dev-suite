---
name: bitcoin-hardware-trezor
description: |
  Trezor hardware wallets: Model T, Model One, Trezor Safe 3, Safe 5,
  Safe 7.
  Trezor Suite, trezorctl, USB protocol, BIP32 derivation, passphrase
  support, Shamir Backup.
  USE WHEN: integrating with Trezor, supporting Trezor in app,
  troubleshooting Trezor signing.
allowed-tools: Read, Grep, Glob
---

# Trezor Hardware Wallets

Trezor (SatoshiLabs, Czech Republic) was the first hardware wallet
(2014). Open-source firmware + open-source software.

## Models

| Model | Year | Notes |
|-------|------|-------|
| Trezor One | 2014 | Original, no touchscreen, OLED display |
| Trezor Model T | 2018 | Touchscreen, Shamir Backup support |
| Trezor Safe 3 | 2023 | Secure Element, BIP-39 + Shamir |
| Trezor Safe 5 | 2024 | Touch, Secure Element, color display |
| Trezor Safe 7 | 2025 | Dual SE (TROPIC01 + EAL6+), BLE, color touch |

Years are launch years. Safe 3 shipped with firmware 2.6.3 (15 November
2023), Safe 5 with 2.7.2 (14 June 2024), Safe 7 with 2.9.3 (21 October
2025). Current firmware line is 2.12.4 (19 August 2026).

Trezor Safe 7 (launched 21 October 2025) is the first consumer device
to ship Tropic Square's TROPIC01, a transparent and auditable secure
element, alongside an EAL6+ Optiga element and an STM32U5 MCU - three
independent layers from separate vendors. Firmware updates, device
authentication and boot use the post-quantum SLH-DSA-128 signature
scheme.

**TROPIC01 disclosure (3 June 2026)**: Ledger Donjon reported a
successful laser fault-injection attack against TROPIC01 (Tropic Square
was informed in late January 2026); Tropic Square then identified a
follow-on method targeting the chip's PIN protection. Trezor's response
states that PIN, funds and wallet backup on the Safe 7 stay safe because
only one of the three independent layers is affected, and that a
hardware-level fault attack cannot be remediated by a firmware update.

## Connection

- USB (HID protocol).
- Safe 7 adds Bluetooth 5.0+ pairing; USB and BLE both run the
  open-source Trezor Host Protocol (THP) (as of September 2026).
- Trezor Suite (desktop app) / web (Trezor Bridge).
- Third-party: Sparrow, Specter, Wasabi, BlueWallet, Electrum.

## Derivation

Default BIP44/49/84/86 paths. Configurable via Suite or third-party
wallet.

## Passphrase ("25th word")

Trezor supports BIP39 passphrase:
- Optional 1-50 character string.
- Combined with seed via PBKDF2 (BIP39 standard).
- Trezor doesn't store the passphrase; entered each session.
- Hidden wallets: each unique passphrase = different wallet.

## Shamir Backup (Model T, Safe 3, Safe 5, Safe 7)

SLIP-39:
- M-of-N share threshold.
- Each share: 20-33 BIP39-style words from a different wordlist.
- Multiple groups for hierarchical recovery.

## Firmware verification

- Open-source firmware on GitHub.
- Trezor Suite verifies firmware signature on connect.
- DIY users can build + flash custom firmware.

## API

trezorctl (CLI):
```bash
trezorctl get-public-key -n "m/84'/0'/0'"
trezorctl btc sign-tx -c bitcoin "$(cat tx.json)"
```

trezor-connect (web): JavaScript SDK for browser apps.

## PSBT support

Trezor signs PSBT v0 (BIP174). Pass PSBT to device, user confirms,
device returns signed PSBT.

Multi-sig PSBT: Trezor can sign as one party in a multisig.

## Common issues

- **Bridge not running**: web wallets fail to find device. Restart
  Bridge.
- **Wrong derivation path**: tools default to legacy if unspecified;
  force `m/84'/0'/0'` for native segwit.
- **Passphrase mistype**: empty wallet shown. No way to recover —
  must remember exact passphrase.

## See also

- [hwi/SKILL.md](../hwi/SKILL.md)
- [psbt-flows/SKILL.md](../psbt-flows/SKILL.md)
- [../wallets/backup/SKILL.md](../../wallets/backup/SKILL.md)
- [ledger/SKILL.md](../ledger/SKILL.md)
