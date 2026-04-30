---
name: bitcoin-hardware-jade
description: |
  Blockstream Jade: open-source HW wallet. Optional offline mode via
  QR / SD / USB, Liquid + Bitcoin support, "Pinserver" online mode
  for blind signing.
  USE WHEN: integrating with Jade, supporting Liquid + Bitcoin signing.
allowed-tools: Read, Grep, Glob
---

# Blockstream Jade

Open-source hardware wallet by Blockstream. Designed for **flexible
operation**: offline (airgapped) or online (with Pinserver).

## Hardware

- Color display.
- Two buttons.
- USB-C.
- Camera (for QR scanning).
- microSD slot.
- ESP32 microcontroller (no Secure Element).

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
- microSD encrypted backup.

## API

`jade-py` Python wrapper:
```python
from jadepy.jade import JadeAPI
with JadeAPI.create_serial(device='/dev/ttyUSB0') as jade:
    xpub = jade.get_xpub('mainnet', "m/84h/0h/0h")
```

Third-party: HWI, Sparrow, Specter (with QR airgap), Wasabi.

## Compared

| Aspect | Jade | Coldcard | Trezor |
|--------|------|----------|--------|
| Open-source | Fully | Partial | Fully |
| Liquid support | Yes (native) | Limited | Yes |
| QR airgap | Yes | Q only | Limited |
| Secure Element | No | Yes | Yes (Safe series) |
| Price | Mid | High | Low-mid |

## Common issues

- **No SE**: in theory more vulnerable to physical attack; rely on
  secure boot + BCUR airgap mode for high-value.
- **BCUR animation speed**: too fast loses frames; use slower
  framerate.
- **Pinserver dependency** in online mode: if Pinserver down, can't
  unlock without offline-only mode.

## See also

- [coldcard/SKILL.md](../coldcard/SKILL.md)
- [seedsigner/SKILL.md](../seedsigner/SKILL.md)
- [psbt-flows/SKILL.md](../psbt-flows/SKILL.md)
- [../l2/liquid/SKILL.md](../../l2/liquid/SKILL.md)
