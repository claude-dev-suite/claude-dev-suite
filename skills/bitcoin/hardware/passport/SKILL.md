---
name: bitcoin-hardware-passport
description: |
  Foundation Passport: QR-only airgap HW wallet. No USB connectivity
  for signing. Camera + microSD only. Open-source firmware.
  USE WHEN: integrating Passport, designing strict airgap flows.
allowed-tools: Read, Grep, Glob
---

# Foundation Passport

Airgapped Bitcoin hardware wallet. Distinguishing feature: **NO USB
data port** for signing. All comms via QR codes + microSD.

## Models

- **Passport Founder's Edition** (2021): touchscreen, smaller form.
- **Passport Batch 2** (2022+): updated firmware.
- **Passport Core** (2024+): improved hardware.

## Operation

- Wallet generates PSBT on phone/computer.
- User displays PSBT as **animated QR** on screen.
- Passport reads QR via camera.
- Passport displays signed PSBT as animated QR.
- Wallet reads it back.

For larger PSBTs: SD card transport.

## Backup

- 24-word BIP39 seed.
- Optional 25th-word passphrase.
- microSD encrypted backup.

## Open-source

Fully open: firmware, hardware schematics. Audit-friendly.

## Compatible wallets

Wallets supporting BCUR / animated QR airgap:
- Sparrow (excellent integration).
- Specter Desktop.
- Nunchuk.
- BlueWallet (limited).
- Foundation Envoy (mobile companion app).

## Compared

| Aspect | Passport | Coldcard Q | SeedSigner |
|--------|----------|------------|------------|
| Airgap method | QR + microSD only | QR / microSD / NFC | QR only |
| USB | None | USB-C | None (DIY) |
| Display | Touchscreen | Touchscreen | Small (DIY) |
| Build | Polished commercial | Polished | DIY hardware |
| Price | High | High | Low (DIY parts) |

## Common issues

- **QR scan failures** — large PSBTs slow to transmit; use SD card
  for big multi-input txs.
- **Microsd FAT32 only**.
- **Passphrase**: separate from seed; easy to lose.

## See also

- [coldcard/SKILL.md](../coldcard/SKILL.md)
- [seedsigner/SKILL.md](../seedsigner/SKILL.md)
- [jade/SKILL.md](../jade/SKILL.md)
- [psbt-flows/SKILL.md](../psbt-flows/SKILL.md)
