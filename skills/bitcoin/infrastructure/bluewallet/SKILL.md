---
name: bitcoin-infrastructure-bluewallet
description: |
  BlueWallet: mobile Bitcoin + Lightning wallet (iOS/Android).
  Lightning via self-hosted LndHub, plus a gated Ark/Arkade wallet.
  Multi-wallet support.
  USE WHEN: mobile wallet integrations, evaluating BlueWallet vs
  Phoenix / Breez.
allowed-tools: Read, Grep, Glob
---

# BlueWallet

Mobile Bitcoin + Lightning wallet by BlueWallet team. iOS / Android.

Repo: `github.com/BlueWallet/BlueWallet` (React Native).
Current release: 8.0.1 (21 July 2026).

## Features

- **Multi-wallet** management.
- **Watch-only** import via xpub.
- **HD wallets**: BIP44/49/84/86.
- **Lightning** via:
  - LndHub backend - self-hosted only, since BlueWallet shut down its
    own hosted node on 30 April 2023.
  - Ark / Arkade (`@arkade-os/sdk`), self-custodial, added in v7.2.2
    (November 2025); still tap-gated in v8.0.1 (July 2026).
- **Multisig** support.
- **PSBT** import / export.
- **PayJoin** support.
- **Air-gap QR**: BBQR with Coldcard (v7.2.6, February 2026); BC-UR v2
  scanning for OneKey / Keystone (v8.0.1, July 2026).

## LndHub model

LndHub = REST API backend that wraps an LND node and serves multiple
"sub-wallets" to mobile clients. Self-hosted only.

History: BlueWallet used to run a hosted LndHub at `lndhub.io` that the
app defaulted to, which made the default Lightning wallet custodial.
BlueWallet announced the sunset on 23 February 2023, stopped new wallets
and refills, and shut the node down on 30 April 2023, telling users to
withdraw. LndHub survives only as self-hostable software. As of v8.0.1
(July 2026) no default hub URI ships in the app: `lndhub.io` appears
nowhere in the tree, and the Lightning (LNDhub) wallet type is rendered
in "Add wallet" only when a hub URI of your own is already stored or the
Lightning type is already selected - the guard in
`screen/wallets/Add.tsx` is
`selectedWalletType === ButtonSelected.OFFCHAIN || hasStoredLndHub`.
bluewallet.io/lightning now states plainly that Lightning in BlueWallet
connects to a node you run, through LNDhub.

Trade-off is now operator risk rather than vendor custody: whoever runs
the hub holds the funds, and the sub-account credential
(`lndhub://login:password@host`) is a bearer secret.

For self-custody Lightning on mobile: prefer Phoenix or Breez
SDK-based wallets (both still actively released as of September 2026),
or run the hub yourself. Not Mutiny - it shut down at the end of 2024.

## Ark / Arkade Lightning

Since v7.2.2 (24 November 2025, PR #8142, "lightning wallet powered by
ark") the repo carries `class/wallets/lightning-ark-wallet.ts`, a
self-custodial single-key Ark wallet on `@arkade-os/sdk`, using
`@arkade-os/boltz-swap` for Lightning send/receive. v8.0.0 (June 2026)
upgraded the Arkade SDKs and hardened the Ark wallet integration
(PR #8585); v8.0.1 (July 2026) added Arkade Lightning push notifications
(PR #8634) and fixed Arkade LNURL payment-result persistence (PR #8635).
At 8.0.1 the pinned deps are `@arkade-os/sdk` 0.4.43 and
`@arkade-os/boltz-swap` 0.3.48.

Not yet a normal user path: in v8.0.1 the "LightningArk" button in the
Add-wallet screen renders only after `backdoorPressed >= 20`, i.e. 20
taps on a hidden target. Treat it as shipped-but-gated, not as the
recommended Lightning mode.

## Compared (as of September 2026)

| Aspect | BlueWallet | Phoenix | Mutiny *(defunct)* |
|--------|------------|---------|--------------------|
| LN backend | self-hosted LndHub (Ark gated) | lightning-kmp + ACINQ trampoline | LDK |
| Self-custody | yes, if you run the hub | yes | yes |
| Multi-wallet | yes | no | yes |
| HW wallet support | partial | no | partial |
| Lightning UX | average | excellent | excellent |
| Mobile platform | iOS + Android | iOS + Android | Web + iOS + Android |

Phoenix is mobile-only: the ACINQ README (checked September 2026) says
"Phoenix is available for Android and iOS", and the repo publishes only
`android-v*` release tags (latest `android-v2.8.2`, 8 September 2026).
`phoenixd` is a separate headless server daemon for Linux / macOS /
Windows-WSL, not a desktop build of the wallet. On-device Lightning is
`lightning-kmp`, not Eclair - Eclair is ACINQ's routing-node
implementation, which is what the trampoline peer runs.

The Mutiny column is history, not a shipping option: the shutdown was
announced 5 August 2024 and the wallet was removed from app stores and
the web by 31 December 2024. `MutinyWallet/mutiny-web` and
`mutiny-node` are archived on GitHub, last pushes September and August
2024 (checked September 2026). The code is still open, so self-hosting
is the only remaining route. Kept here because the LDK-in-the-browser
design is still a useful reference point.

## Use cases

- **Multi-wallet management** on mobile.
- **Watch-only** mobile use case.
- **Casual users** wanting both BTC + LN in one app.

## Common issues

- No hosted hub since 30 April 2023, so a Lightning wallet needs a hub
  URI you supply. There is no zero-setup Lightning path in the app.
- There is no on-device / embedded LND mode. The v8.0.1 tree has no
  Neutrino or lnd-mobile module and no embedded-node wallet type
  (checked September 2026); older guides describing one are wrong.
- No watchtower integration either: `watchtower` appears nowhere in the
  v8.0.1 tree (checked September 2026).
- Plugin compat: Lightning over LndHub differs from full LN flow
  (some operations limited).

## See also

- [../lightning/consumer-wallets/SKILL.md](../../lightning/consumer-wallets/SKILL.md)
- [../lightning/lnd/SKILL.md](../../lightning/lnd/SKILL.md)
