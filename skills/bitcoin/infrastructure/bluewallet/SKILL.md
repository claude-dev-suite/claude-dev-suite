---
name: bitcoin-infrastructure-bluewallet
description: |
  BlueWallet: mobile Bitcoin + Lightning wallet (iOS/Android). LND
  on-device + LndHub backend variants. Multi-wallet support.
  USE WHEN: mobile wallet integrations, evaluating BlueWallet vs
  Phoenix / Mutiny.
allowed-tools: Read, Grep, Glob
---

# BlueWallet

Mobile Bitcoin + Lightning wallet by BlueWallet team. iOS / Android.

Repo: `github.com/BlueWallet/BlueWallet` (React Native).

## Features

- **Multi-wallet** management.
- **Watch-only** import via xpub.
- **HD wallets**: BIP44/49/84/86.
- **Lightning** via:
  - LndHub backend (custodial-style; can self-host).
  - Embedded LND (fully self-custodial; large download).
- **Multisig** support.
- **PSBT** import / export.
- **PayJoin** support.
- **Watchtower** integration (for LN).

## LndHub model

LndHub = REST API backend that wraps an LND node and serves multiple
"sub-wallets" to mobile clients. Default uses BlueWallet's hosted
LndHub; you can self-host.

Trade-off: convenience vs custody. With BlueWallet's hosted LndHub,
funds are custodial.

For self-custody Lightning on mobile: use Embedded LND mode or
prefer Phoenix / Mutiny / Breez SDK-based wallets.

## Compared

| Aspect | BlueWallet | Phoenix | Mutiny |
|--------|------------|---------|--------|
| LN backend | LndHub or embedded LND | Eclair + ACINQ trampoline | LDK |
| Self-custody | depends | yes | yes |
| Multi-wallet | yes | no | yes |
| HW wallet support | partial | no | partial |
| Lightning UX | average | excellent | excellent |
| Mobile platform | iOS + Android | iOS + Android + Desktop | Web + iOS + Android |

## Use cases

- **Multi-wallet management** on mobile.
- **Watch-only** mobile use case.
- **Casual users** wanting both BTC + LN in one app.

## Common issues

- LndHub default = custodial. Many users don't realize.
- Embedded LND mode requires significant disk + sync time.
- Plugin compat: Lightning over LndHub differs from full LN flow
  (some operations limited).

## See also

- [../lightning/consumer-wallets/SKILL.md](../../lightning/consumer-wallets/SKILL.md)
- [../lightning/lnd/SKILL.md](../../lightning/lnd/SKILL.md)
