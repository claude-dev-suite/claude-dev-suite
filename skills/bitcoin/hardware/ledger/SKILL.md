---
name: bitcoin-hardware-ledger
description: |
  Ledger hardware wallets: Nano S Plus, Nano X, Stax, Flex. BOLOS app
  architecture, Ledger Live, secure element, anti-klepto.
  USE WHEN: integrating with Ledger, supporting Ledger in app, debugging
  PSBT signing or HW Recovery service issues.
allowed-tools: Read, Grep, Glob
---

# Ledger Hardware Wallets

Ledger (France) — second-most popular hardware wallet line. Models
based on **Secure Element** (SE) chips.

## Models

| Model | Year | Notes |
|-------|------|-------|
| Nano S | 2016 (deprecated) | First popular Ledger; SE + MCU |
| Nano X | 2019 | Bluetooth, larger screen |
| Nano S Plus | 2022 | Successor to Nano S, more memory |
| Stax | 2023 | Touchscreen, e-ink |
| Flex | 2024 | Color touchscreen |

## BOLOS architecture

Ledger devices run **BOLOS** (Blockchain Open Ledger Operating
System). Each cryptocurrency has a separate **app** loaded onto
the device:
- Bitcoin app (`bitcoin-app-developer`)
- Ethereum app
- Various altcoins.

App switching during use (close old, open new). Apps signed by
Ledger.

## Bitcoin app

Functions:
- Get xpub at any path.
- Generate addresses.
- Sign txs (legacy mode).
- Sign PSBTs (modern mode, since v2.0+).

## Connection

- USB (HID).
- Bluetooth (Nano X / Stax / Flex).
- Ledger Live (desktop / mobile).
- Third-party: HWI, Sparrow, Specter, Electrum, Wasabi.

## Anti-klepto

Defense against compromised firmware leaking the seed via
deterministic-looking signatures (DUSEC attack):
- Host provides random `aux_rand`.
- Device combines with internal randomness.
- Final nonce derivation uses both → tamper-evident if firmware tries
  to leak seed.

## Recovery service (controversial)

In May 2023, Ledger announced "Recover" — optional opt-in service
that splits seed into encrypted shards stored by 3rd parties.
Backlash: critics argued device firmware can extract seed.

Legitimate users can opt-out / never enable.

## API

ledger-bitcoin (Python):
```python
from ledger_bitcoin import Client, ChainID
with Client(transport=connect_hid_or_ble(), chain=ChainID.MAIN) as client:
    pk = client.get_extended_pubkey("m/84'/0'/0'")
    psbt_signed = client.sign_psbt(psbt, wallet_policy, hmac=None)
```

JavaScript: `@ledgerhq/hw-app-btc`.

## PSBT support

Modern Ledger (v2+) supports PSBT directly. Older Ledger requires
legacy "raw tx + path" flow.

Multi-sig: Ledger requires "wallet policies" — registered descriptor
on the device with HMAC for trust binding.

## Common issues

- **Wrong app**: app for different chain open instead of Bitcoin.
- **Path mismatch**: Ledger Live defaults to BIP44 even for segwit;
  third-party tools must override to BIP84/86.
- **Bluetooth Nano X**: occasional connection drops, prefer USB.
- **Wallet policy registration**: required for multisig; first-time
  setup confusing.

## See also

- [trezor/SKILL.md](../trezor/SKILL.md)
- [hwi/SKILL.md](../hwi/SKILL.md)
- [psbt-flows/SKILL.md](../psbt-flows/SKILL.md)
