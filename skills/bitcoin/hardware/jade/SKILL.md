---
name: bitcoin-hardware-jade
description: |
  Blockstream Jade: open-source HW wallet. Optional offline mode via
  QR, or SD / USB on Jade Plus. Liquid + Bitcoin support, "Pinserver"
  online mode for blind signing.
  USE WHEN: integrating with Jade, supporting Liquid + Bitcoin signing.
allowed-tools: Read, Grep, Glob
---

# Blockstream Jade

Open-source hardware wallet by Blockstream. Designed for **flexible
operation**: offline (airgapped) or online (with Pinserver).

## Models

Four device generations exist. The firmware repo builds one target per
model (`README.md` on `Blockstream/Jade` master, as of September 2026):

| Model | Build target | MCU | Input | Camera | Battery |
|-------|--------------|-----|-------|--------|---------|
| Jade 1.0 | `jade` | ESP32 | Selection wheel | Yes | No |
| Jade 1.1 | `jade_v1_1` | ESP32 | Rocker / jog-wheel | Yes | No |
| Jade Plus | `jade_v2` | ESP32-S3 | Left/right buttons | Yes | Yes |
| Jade Core | `jade_v2c` | ESP32-S3 | Left/right buttons | No | No |

The README describes `jade_v2c` as "Jade Plus without camera and
battery"; both v2 targets build against the ESP32-S3 toolchain.

As of September 2026 blockstream.com/jade lists only **Jade Plus**
($169.99) and **Jade Core** ($99.00) for sale — the first-generation
Jade is no longer listed there.

### Jade Plus (launched 3 January 2025)

- ESP32-S3; display 66% larger and 25% brighter than the original Jade
  (1.9" IPS LCD, 320x170, per blockstream.com/jade as of Sep 2026).
- Camera GC0308 640x480. Built-in battery. 65x30x12mm, 30g.
- Connectivity: USB-C, Bluetooth, SD card / USB drive.
- **Genuine Check** — device authenticity verification when pairing
  with Blockstream Green.
- **Air-gapped firmware upgrades** (via SD / USB drive, or the optional
  **JadeLink** accessory).
- Secure Boot + Anti-Exfil.
- Launch pricing: $149 (plastic) / $169 (metal, Lunar Silver or
  Genesis Grey); original Jade continued at $79 at that time.

### Jade Core (announced 28 April 2026)

- Jade Plus board without camera and battery; 20g. Connectivity listed
  on blockstream.com/jade (September 2026) is USB-C and Bluetooth only
  — no SD card / USB drive row, unlike Jade Plus.
- Comparison table there (as of September 2026) marks Genuine Device
  Check "Yes" for Jade Core, but both Air-Gapped Transactions and
  Air-Gapped Firmware Upgrades "No" — it has neither a camera nor an
  SD card / USB drive transport to carry them.
- No camera means **no BCUR QR airgap** on this model.

## Hardware (original Jade)

- Color display.
- USB-C.
- Camera (for QR scanning).
- ESP32 microcontroller.
- No SD card slot.

SD / USB storage is gated to ESP32-S3 silicon in firmware, not to a
product name: `CHANGELOG.md` on `Blockstream/Jade` master lists "fw
upgrade and psbt signing using connected usb-storage (eg. sd card
reader) for esp32s3 devices" under 1.0.32 (11 October 2024). The same
split shows in the docs — help.blockstream.com "Jade overview" (updated
12 August 2026) marks the SD card / USB drive air-gap "Jade Plus
*only*" and names three connection types (USB, Bluetooth, QR), and the
store technical specifications give USB Type-C as the original's only
connector (store.blockstream.com, as of September 2026).

## Secure Element

None of the models ship a certified Secure Element. Blockstream markets
the blind-oracle Pinserver scheme as a **"Virtual Secure Element"**
(blockstream.com/jade wording, as of September 2026) — key material
stays encrypted in flash and the remote oracle supplies half of the
unlock secret under rate limiting. See `pinserver-flow` for the
protocol.

## Modes

### Offline (BCUR)
- QR-based airgap via "Animated QR" (BCUR encoding).
- Device camera reads, display shows signed result.
- Compatible with Sparrow, Specter, BlueWallet (offline mode).

### Online (Pinserver)
- Device communicates with **Pinserver** (Blockstream-hosted) for
  PIN protection.
- "Blind oracle" — Pinserver doesn't see seed but provides
  rate-limiting on PIN attempts.

## Coins

- Bitcoin (BTC).
- Liquid (LBTC + Issued Assets).

## Backup

- Standard 24-word BIP39.
- CompactSeedQR — recovery phrase hand-transcribed onto paper or metal
  as a QR code, re-loaded through the camera.
- No SD-card backup on the original Jade (see Hardware above).

CompactSeedQR is firmware, not a Jade Plus feature: `CHANGELOG.md`
0.1.38 (21 September 2022) adds "Support scan and import/recovery of
SeedSigner 'CompactSeedQR' codes" and "screens to facilitate export (ie
manual copy) of CompactSeedQR code", over two years before Jade Plus
shipped. The help-centre walkthrough "Create a SeedQR from your
recovery phrase" (updated 6 August 2026) is framed around Jade Plus.

## API

`jade-py` Python wrapper:
```python
from jadepy.jade import JadeAPI
with JadeAPI.create_serial(device='/dev/ttyUSB0') as jade:
    xpub = jade.get_xpub('mainnet', "m/84h/0h/0h")
```

Third-party: HWI, Sparrow, Specter (with QR airgap), Wasabi.

HWI 3.2.0 (10 February 2026) is the first release with **Jade Plus
support** and **Jade native PSBT signing** — earlier HWI releases do
not enumerate Jade Plus.

## Compared

| Aspect | Jade | Coldcard | Trezor |
|--------|------|----------|--------|
| Open-source | Fully | Partial | Fully |
| Liquid support | Yes (native) | Limited | Yes |
| QR airgap | Yes (not Jade Core) | Q only | Limited |
| Secure Element | No (blind oracle) | Yes | Yes (Safe series) |
| Price | Mid | High | Low-mid |

## Common issues

- **No SE**: in theory more vulnerable to physical attack; rely on
  secure boot + BCUR airgap mode for high-value. Blockstream's
  "Virtual Secure Element" (as of September 2026) is the blind-oracle
  scheme, not certified silicon.
- **Wrong model assumed**: Jade Core has no camera, so any QR/BCUR
  walkthrough fails on it. Confirm the model before scripting an
  airgap flow.
- **BCUR animation speed**: too fast loses frames; use slower
  framerate.
- **Pinserver dependency** in online mode: if Pinserver down, can't
  unlock without offline-only mode.

## See also

- [coldcard/SKILL.md](../coldcard/SKILL.md)
- [seedsigner/SKILL.md](../seedsigner/SKILL.md)
- [psbt-flows/SKILL.md](../psbt-flows/SKILL.md)
- [../l2/liquid/SKILL.md](../../l2/liquid/SKILL.md)
