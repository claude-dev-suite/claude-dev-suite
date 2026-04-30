---
name: bitcoin-infrastructure-sparrow
description: |
  Sparrow Wallet: power-user desktop wallet for Bitcoin. PSBT-first,
  HW wallet support, multisig coordination, CoinJoin (Whirlpool fork),
  PayJoin, BIP47.
  USE WHEN: power-user wallet workflows, evaluating Sparrow vs
  Specter / Electrum.
allowed-tools: Read, Grep, Glob
---

# Sparrow Wallet

Java desktop Bitcoin wallet by Craig Raw. Power-user oriented:
detailed UTXO control, PSBT-first, multisig, HW wallet support.

Repo: `github.com/sparrowwallet/sparrow`.

## Features

- **Single-sig + multi-sig** wallets.
- **HW wallet support** via HWI: Trezor, Ledger, Coldcard, BitBox02,
  Jade, Passport, Keystone, SeedSigner, Krux, Specter DIY.
- **Airgap** via animated QR (BCUR), microSD.
- **Multiple backends**: Bitcoin Core, Electrum (electrs/Fulcrum/
  ElectrumX), Bitcoin Knots.
- **PSBT** comprehensive editor.
- **PayJoin** (BIP78).
- **BIP47 PayNyms** support.
- **CoinJoin** (Whirlpool fork — limited since Samourai shutdown).
- **Tor** via SOCKS5 proxy.

## Detailed UI

- **Coin control**: explicit input selection per tx.
- **Transaction inspector**: full PSBT, scripts, witness.
- **Address verification**: per-device confirmation flow.
- **Wallet backups**: encrypted .mnemonic / descriptor exports.

## Multisig

Supports cross-vendor multisig with descriptor-based config.
Excellent UX for HW wallet signing rounds.

## Setup

Download installer for Mac/Windows/Linux. Configure Bitcoin Core
or Electrum server in settings. Optionally enable Tor.

## Compared

| Aspect | Sparrow | Specter Desktop | Electrum |
|--------|---------|------------------|----------|
| Language | Java | Python + Vue | Python |
| HW wallet support | best | rich | partial |
| PSBT detail | richest | rich | basic |
| Multi-sig UX | top | top | OK |
| Mobile | no | no | yes (legacy) |
| Privacy features | strong | strong | basic |

## Use cases

- **Power users** with mixed HW wallet setups.
- **Multi-sig custody**.
- **Privacy-conscious** workflows (PayJoin, PayNyms, Tor).

## Common issues

- **Java JVM**: requires Java 17+; bundled installer recommended.
- **CoinJoin since Samourai shutdown**: Whirlpool fork has limited
  liquidity; some users moved to Wasabi.
- **Tor connection**: ensure Sparrow's Tor proxy port matches your
  Tor instance.

## See also

- [specter-desktop/SKILL.md](../specter-desktop/SKILL.md)
- [electrum-wallet/SKILL.md](../electrum-wallet/SKILL.md)
- [../hardware/hwi/SKILL.md](../../hardware/hwi/SKILL.md)
- [../privacy/coinjoin/SKILL.md](../../privacy/coinjoin/SKILL.md)
- [../privacy/payjoin/SKILL.md](../../privacy/payjoin/SKILL.md)
