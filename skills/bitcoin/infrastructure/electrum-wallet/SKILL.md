---
name: bitcoin-infrastructure-electrum-wallet
description: |
  Electrum Wallet: classic Python desktop wallet. Lightweight, runs
  on most platforms, plugin ecosystem, hardware wallet support.
  USE WHEN: evaluating mature Bitcoin wallet, integrating Electrum
  protocol clients.
allowed-tools: Read, Grep, Glob
---

# Electrum Wallet

The classic Bitcoin desktop wallet (since 2011). Python, lightweight,
mature.

Repo: `github.com/spesmilo/electrum`.

## Features

- **Multi-platform**: Linux, macOS, Windows, Android.
- **Light-client by default** (Electrum protocol → ElectrumX, electrs,
  or Fulcrum servers).
- **Hardware wallet support**: Trezor, Ledger, Coldcard, KeepKey,
  BitBox.
- **Multisig** support.
- **Lightning** (in newer versions, optional).
- **Plugin system**.
- **2FA** via TrustedCoin (custodial 2-of-3 multisig service).

## Server choice

By default connects to public ElectrumX servers. For privacy:
- Run your own electrs / Fulcrum.
- Configure Electrum to connect: `Tools → Network → Server`.

## Compared

| Aspect | Electrum | Sparrow | Specter |
|--------|----------|---------|---------|
| Maturity | Oldest (2011+) | Newer (2020+) | 2018+ |
| Lightning | optional | partial | yes |
| Detailed PSBT | basic | best | rich |
| Multi-sig | yes | yes | yes |
| HW support | partial | best | rich |
| Mobile | yes (Android) | no | no |

## Use cases

- **Long-time users** familiar with Electrum.
- **Mobile** (Android) — one of few options.
- **Mature stable** wallet for daily use.

## Common issues

- Default public Electrum servers reveal your address history → use
  Tor or self-hosted server.
- Plugin compatibility: some plugins outdated.
- Lightning is experimental in Electrum compared to LND/CLN.

## See also

- [sparrow/SKILL.md](../sparrow/SKILL.md)
- [electrs/SKILL.md](../electrs/SKILL.md)
- [bluewallet/SKILL.md](../bluewallet/SKILL.md)
