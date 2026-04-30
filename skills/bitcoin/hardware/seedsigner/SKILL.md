---
name: bitcoin-hardware-seedsigner
description: |
  SeedSigner: DIY Bitcoin signing device. Raspberry Pi Zero + camera
  + screen. Boots from microSD, no permanent state. Stateless airgap
  signing.
  USE WHEN: building / supporting SeedSigner, designing stateless
  signing flows.
allowed-tools: Read, Grep, Glob
---

# SeedSigner

DIY Bitcoin hardware wallet:
- Raspberry Pi Zero (or compatible) + camera + small screen.
- Boots from microSD running SeedSigner image.
- **Stateless**: no seed stored on device. User enters seed each
  session via dice / QR / hand-typed words.

## Hardware (DIY)

- Raspberry Pi Zero W (~$10).
- Camera Module 1.3 / 2.1 (~$25).
- Waveshare 1.3" screen (~$20).
- 4 GPIO buttons.
- microSD with SeedSigner image.

Total: ~$60 in parts, plus 3D-printed case.

## Operation

1. Boot SeedSigner from microSD.
2. Enter seed via:
   - Dice rolls (entropy → seed).
   - Manual word entry.
   - SeedQR scan (encoded BIP39 mnemonic).
3. Use as airgap signer for PSBT (QR transport).
4. Power off → seed wiped from RAM.

No persistent storage of seed = no risk of physical seizure
revealing keys.

## Compatible wallets

- Sparrow Desktop.
- Specter Desktop.
- Nunchuk.

QR transport: animated QR for PSBT in/out.

## Use cases

- **DIY enthusiasts** wanting open hardware.
- **High-security applications**: no firmware backdoors possible
  (you build it).
- **Educational**: understand how HW wallets work.

## Compared to commercial

| Aspect | SeedSigner | Commercial HW |
|--------|------------|---------------|
| Cost | $60 DIY | $50-500 |
| Auditability | Full (you built it) | Trust manufacturer |
| Convenience | Lower (boot every session) | Higher |
| Permanent storage | None (stateless) | Encrypted internally |
| Maintenance | DIY | Vendor support |

## Limitations

- **Slower** signing (boot time + manual seed entry).
- **No tamper-evident hardware** — Raspberry Pi has no SE.
- **Camera quality** affects QR scan reliability.

## See also

- [krux/SKILL.md](../krux/SKILL.md)
- [specter-diy/SKILL.md](../specter-diy/SKILL.md)
- [passport/SKILL.md](../passport/SKILL.md)
- [coldcard/SKILL.md](../coldcard/SKILL.md)
- [../wallets/backup/SKILL.md](../../wallets/backup/SKILL.md)
