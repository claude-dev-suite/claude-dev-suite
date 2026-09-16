---
name: bitcoin-hardware-passport
description: |
  Foundation Passport: Passport Core is the QR-only airgap HW wallet -
  no USB connectivity for signing, camera + microSD only. Passport Prime
  (GA 2026) is the connected KeyOS security platform. Open-source firmware.
  USE WHEN: integrating Passport, designing strict airgap flows.
allowed-tools: Read, Grep, Glob
---

# Foundation Passport

Foundation's line-up has two devices as of September 2026, though only
Prime is sold on foundation.xyz today. **Passport Core** is the
airgapped Bitcoin wallet whose distinguishing feature is **NO USB data
port** for signing - all comms via QR codes + microSD. **Passport
Prime** is a connected security platform and is *not* airgapped.
Everything below describes Passport Core unless it names Prime.

## Product line (as of September 2026)

| Device | Role | Transport |
|--------|------|-----------|
| Passport Core | Airgapped Bitcoin signer | QR + microSD only |
| Passport Prime | Bitcoin + 2FA + FIDO + file vault | USB-C data, NFC, Bluetooth, QR |

Both pair with **Envoy**, the shared mobile companion app.

### Passport Core

"Passport" was renamed **Passport Core** on 2025-03-17 (Foundation's post
"Passport is now Passport Core"). This was a rename of the shipping
airgapped signer so it could live alongside Prime - not a new hardware
revision; the same post added a Stealth colorway next to Classic.

Firmware lives in `Foundation-Devices/passport2`; latest release v2.3.11
(December 2025), with `v2.4.0-beta-1` tagged. Core keeps its own docs
section on docs.foundation.xyz ("Airgapped security, fully open source
and assembled in the USA"). As of September 2026 the foundation.xyz shop
page fronts Passport Prime and does not list Passport Core.

Hardware history: **Founder's Edition** (2021), then **Batch 2** (2022+).

### Passport Prime

Announced December 2024, shipped to pre-order customers in March 2026,
and opened to all buyers on 2026-05-21. Credit-card-sized: 3.5" IPS
touchscreen under Gorilla Glass, Microchip SAMA5D2 security processor
plus secure element, 1100 mAh battery, 50 GB encrypted storage, auto-erase
after 10 PIN attempts, assembled in the USA. Listed at EUR 376.95 on
foundation.xyz as of September 2026.

Runs **KeyOS**, an open-source Rust microkernel OS
(`Foundation-Devices/KeyOS`, binaries in `KeyOS-Releases`); 1.4.0 shipped
2026-09-04 via Envoy (the `KeyOS-Releases` repo still tops out at 1.3.1
and prerelease 1.4.0-beta3 as of September 2026). Board files are open
too (`Foundation-Devices/Passport-Prime-Hardware`).

Beyond Bitcoin signing it stores TOTP 2FA codes, acts as a FIDO security
key, and holds an encrypted file vault; backups use NFC keycards.
**QuantumLink** is its post-quantum-encrypted Bluetooth link to Envoy
(ML-KEM + ChaCha20-Poly1305 over a dedicated BLE chip).

Prime is **not** a QR-only airgap device: USB-C carries data and
Bluetooth/NFC are live. Do not carry Passport Core's threat model over
to it.

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

| Aspect | Passport Core | Coldcard Q | SeedSigner |
|--------|---------------|------------|------------|
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
