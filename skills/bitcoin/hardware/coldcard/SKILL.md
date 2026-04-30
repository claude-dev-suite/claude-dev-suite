---
name: bitcoin-hardware-coldcard
description: |
  Coldcard hardware wallets (Coinkite): Mk4, Q. Bitcoin-only firmware,
  airgap support via SD card / NFC / QR, BIP85, MuSig2 (experimental),
  Trick PINs.
  USE WHEN: integrating with Coldcard, supporting Mk4 / Q, designing
  airgap signing flows.
allowed-tools: Read, Grep, Glob
---

# Coldcard (Coinkite)

Bitcoin-only hardware wallet. Industry favorite for **airgapped**
signing. Models: Mk4, Q.

## Models

| Model | Year | Notes |
|-------|------|-------|
| Mk4 | 2022 | USB-C + microSD + NFC, no battery |
| Q | 2024 | Color touchscreen, USB-C, microSD, NFC, full keyboard, battery |

## Airgap support

Multiple transport options:
- **microSD card**: write PSBT to card, sign on device, write back.
- **NFC**: tap-to-transfer.
- **QR codes** (Q only): scan + display.
- **USB**: direct (less airgap).

## Bitcoin-only firmware

Coldcard intentionally supports ONLY Bitcoin. No altcoins. Smaller
attack surface, simpler mental model.

## Trick PINs

Defense against coercion:
- Set up multiple PINs.
- "Real" PIN unlocks main wallet.
- "Duress" PIN unlocks decoy wallet (real-looking but with different
  seed).
- "Login countdown" — N attempts before wallet wipe.

## BIP85

Native support for deriving sub-seeds via BIP85. UI lets you generate:
- BIP39 mnemonic (any word count).
- HEX bytes.
- WIF private key.
- xprv.

## MuSig2 (experimental)

Mk4 has experimental MuSig2 support for cooperative Taproot signing.
Not yet standard across HW wallets.

## Backup

- Standard 24-word seed.
- "Tarot card" backup grids for resilient recovery.
- BIP85-derived sub-seeds.
- Encrypted backups to microSD with a separate backup password.

## API

`ckcc-protocol` Python:
```python
from ckcc_protocol.client import ColdcardDevice
dev = ColdcardDevice()
pk = dev.get_xpub("m/84'/0'/0'")
dev.sign_psbt(psbt_bytes)
```

## Connection

- USB-C.
- microSD (airgap).
- NFC (Mk4, Q).
- Q only: QR code.

Third-party: HWI, Sparrow, Specter, Electrum.

## Common issues

- microSD format must be FAT32 (max 32 GB).
- USB driver issues on some Linux distros.
- NFC on iPhone limited to read-only — use Android for tap-to-sign.

## See also

- [trezor/SKILL.md](../trezor/SKILL.md)
- [ledger/SKILL.md](../ledger/SKILL.md)
- [psbt-flows/SKILL.md](../psbt-flows/SKILL.md)
- [hwi/SKILL.md](../hwi/SKILL.md)
- [../wallets/entropy/SKILL.md](../../wallets/entropy/SKILL.md)
