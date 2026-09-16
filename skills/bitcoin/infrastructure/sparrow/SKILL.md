---
name: bitcoin-infrastructure-sparrow
description: |
  Sparrow Wallet: power-user desktop wallet for Bitcoin. PSBT-first,
  HW wallet support, multisig coordination, Silent Payments, PayJoin,
  BIP47.
  USE WHEN: power-user wallet workflows, evaluating Sparrow vs
  Specter / Electrum.
allowed-tools: Read, Grep, Glob
---

# Sparrow Wallet

Java desktop Bitcoin wallet by Craig Raw. Power-user oriented:
detailed UTXO control, PSBT-first, multisig, HW wallet support.

Repo: `github.com/sparrowwallet/sparrow`. Current release 2.5.4
(27 August 2026).

## Features

- **Single-sig + multi-sig** wallets.
- **HW wallet support**: Trezor, Ledger, Coldcard, BitBox02, Jade,
  Passport, Keystone, SeedSigner, Krux, Specter DIY. USB devices go
  through Lark, Sparrow's own Java library (initially a port of Python
  HWI), which replaced the bundled HWI in 2.1.0 (4 February 2025);
  airgapped devices go over QR/microSD instead. Newer devices added in
  the 2.4/2.5 line: Trezor Safe 7, Ledger Nano Gen5 and Keycard /
  Keycard Shell (2.4.0, February 2026), ERA (2.5.3, July 2026).
- **Airgap** via animated QR (BCUR), microSD.
- **Multiple backends**: Bitcoin Core, Electrum (electrs/Fulcrum/
  ElectrumX), Bitcoin Knots.
- **PSBT** comprehensive editor. Internal representation is PSBTv2
  (BIP370) by default since 2.4.0 (10 February 2026); exports to file,
  QR, clipboard and PayJoin are converted back to PSBTv0 unless the
  transaction carries silent-payment fields, so v0-only signers are
  unaffected outside Silent Payments.
- **PayJoin** (BIP78).
- **BIP47 PayNyms** support (retained).
- **Silent Payments**: sending in 2.3.0 (October 2025), BIP375 PSBT
  fields plus DLEQ proof verification for hardware signers in 2.4.0
  (February 2026), receiving wallets — including airgapped signers —
  in 2.5.0 (May 2026).
- **BIP353 human-readable names** with DNSSEC proofs carried in the
  PSBT (2.3.0, October 2025).
- **No built-in CoinJoin**: the Whirlpool client was removed in 1.9.0
  (25 April 2024) and has not been replaced.
- **Tor** via SOCKS5 proxy (internal Tor upgraded to 0.4.8.21 in
  2.4.0, February 2026).

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
- **Privacy-conscious** workflows (PayJoin, PayNyms, Silent Payments,
  Tor).

## Common issues

- **Java JVM**: running or building from source requires Java 25+ as
  of the 2.4/2.5 line (2.4.0, February 2026, moved to Java 25.0.2;
  release binaries are built with Eclipse Temurin 25.0.2+10). The
  bundled installer remains the recommended route.
- **No CoinJoin — history**: Sparrow shipped a Whirlpool client until
  1.9.0 (25 April 2024) removed it along with the other Soroban
  features and dependencies, following the Samourai shutdown. Nothing
  replaced it; mixing now needs an external coordinator/client.
  In-wallet privacy is PayJoin, PayNyms and Silent Payments.
- **Tor connection**: ensure Sparrow's Tor proxy port matches your
  Tor instance.
- **HWI instructions are stale**: guides that tell you to install or
  upgrade Python HWI for Sparrow predate 2.1.0 (4 February 2025), which
  replaced it with Lark; on macOS and Windows Sparrow now deletes the
  leftover HWI cache directory. Upstream HWI went feature-frozen /
  maintenance-only in August 2026 (bitcoin-core/HWI issue #850, 18
  August 2026, with BHWI named as successor), which no longer affects
  Sparrow.

## See also

- [specter-desktop/SKILL.md](../specter-desktop/SKILL.md)
- [electrum-wallet/SKILL.md](../electrum-wallet/SKILL.md)
- [../hardware/hwi/SKILL.md](../../hardware/hwi/SKILL.md)
- [../privacy/coinjoin/SKILL.md](../../privacy/coinjoin/SKILL.md)
- [../privacy/payjoin/SKILL.md](../../privacy/payjoin/SKILL.md)
