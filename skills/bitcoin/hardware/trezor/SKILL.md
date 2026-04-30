---
name: bitcoin-hardware-trezor
description: |
  Trezor hardware wallets: Model T, Model One, Trezor Safe 3, Safe 5.
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
| Trezor Safe 3 | 2024 | Secure Element, BIP-39 + Shamir |
| Trezor Safe 5 | 2024 | Touch, Secure Element, color display |

## Connection

- USB (HID protocol).
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

## Shamir Backup (Model T, Safe 3, Safe 5)

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
