---
name: bitcoin-hardware-krux
description: |
  Krux: DIY airgap signer running on Sipeed M5StickV / Maix Amigo.
  Open-source, multi-language, stateless.
  USE WHEN: integrating Krux, evaluating M5StickV-based signers.
allowed-tools: Read, Grep, Glob
---

# Krux

Bitcoin-only airgap signer for **Sipeed M5StickV** and **Maix Amigo**
hardware. Open-source firmware. Stateless: seed enters on use.

## Hardware

- Sipeed M5StickV (~$50).
- Maix Amigo (~$80, larger screen).
- Built-in camera + display.
- USB-C charging only (no data).

## Operation

1. Power on, boot Krux firmware from internal flash.
2. Enter seed via:
   - 24-word manual entry.
   - SeedQR scan.
   - Tinyseed (metal plate decoder).
3. Sign PSBTs via animated QR.

## Features

- Multi-language UI (English, Spanish, French, etc.).
- Multi-output signing (PSBT, message signing).
- BIP39 word entry helper.
- Tiny seed decoder for steel backup plates.

## Compatible wallets

- Sparrow.
- Specter.
- BlueWallet (limited).

## Use cases

- **Cheaper than SeedSigner DIY** if you don't have a Pi.
- **Educational** — explore HW signer internals.
- **Privacy-focused** — no permanent identity.

## Limitations

- **Smaller screen** (M5StickV).
- **Sipeed hardware availability** varies by region.
- **No SE** — same caveat as SeedSigner.

## See also

- [seedsigner/SKILL.md](../seedsigner/SKILL.md)
- [specter-diy/SKILL.md](../specter-diy/SKILL.md)
- [passport/SKILL.md](../passport/SKILL.md)
