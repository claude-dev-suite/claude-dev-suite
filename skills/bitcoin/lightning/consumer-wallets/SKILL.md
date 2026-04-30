---
name: lightning-consumer-wallets
description: |
  Consumer Lightning wallet integration patterns: Phoenix, Breez SDK,
  Mutiny, Zeus, BlueWallet (LN), Aqua. Custodial vs non-custodial,
  LSP partnerships, mobile-specific UX (push notifications, background
  sync).
  USE WHEN: integrating with consumer wallets, designing self-custodial
  mobile UX, evaluating wallet SDK options.
allowed-tools: Read, Grep, Glob
---

# Consumer Lightning Wallets

Most users access Lightning via mobile/desktop wallets. This skill
catalogues major options and integration patterns.

## Wallet matrix (late 2025)

| Wallet | Architecture | Custody | LSP |
|--------|--------------|---------|-----|
| **Phoenix** | Eclair core, mobile | Self-custodial via ACINQ trampoline | ACINQ exclusive |
| **Breez SDK** | LDK or Greenlight under hood | Self-custodial | Multi (Breez choice) |
| **Mutiny** | LDK web/mobile | Self-custodial | Multi (user choice) |
| **Zeus** | LND/CLN/Embedded LND | Self-custodial; supports remote nodes | Configurable |
| **BlueWallet (LN)** | LndHub backend | Custodial typically | LndHub provider |
| **Aqua** | LDK + Liquid | Self-custodial multi-asset | Multi |
| **Wallet of Satoshi** | Backend custodial | Custodial | n/a |
| **Cash App** | LDK backend | Custodial | n/a |
| **Strike** | Backend custodial | Custodial | n/a |
| **Bitkit** | LDK | Self-custodial | Synonym (their LSP) |
| **Alby** | Hybrid (NWC + custodial backend) | Custodial default; can connect own | n/a |

## Self-custodial mobile patterns

### Phoenix
- ACINQ runs an Eclair node as the user's "trampoline".
- User wallet talks to ACINQ via custom protocol.
- ACINQ never holds user keys; can refuse to forward but can't steal.
- Channels open dynamically as needed (splice-on-demand).
- Backups: 12-word seed + automatic encrypted state to ACINQ cloud.

### Breez SDK
- Open-source SDK (Apache 2.0).
- Can use Greenlight (CLN) or LDK as backend.
- Multi-language bindings: Swift, Kotlin, Rust, Dart, JS, Python.
- Useful for app integrators wanting plug-and-play LN.

### Mutiny Wallet
- Web wallet (browser tab) + mobile app.
- Pure LDK in WebAssembly for browser version.
- Multi-LSP: rotate, choose, fallback.
- Encrypted state to user-supplied cloud (VSS).

### Zeus
- "Power user" wallet — connects to user's own LND/CLN/Embedded LND
  node.
- For Embedded mode: ships LND-mobile, runs locally.
- For Remote: connect via macaroon + Tor / clearnet.
- Most flexible; not as plug-and-play.

## Mobile UX challenges

### Always-online problem
LN nodes need to be online to:
- Watch for HTLCs.
- Respond to channel updates.
- Detect cheating.

Mobile devices: NOT always online.

Solutions:
- **Watchtowers**: outsource monitoring.
- **Hosted node** (Greenlight, custodial): always-online server with
  signing on device.
- **Trampoline + LSP** (Phoenix model): node-like service with
  user keys.
- **Background sync**: app wakes periodically (iOS/Android limits).
- **Push notifications**: peer notifies on important events (some
  LSPs offer this).

### Push notification flow

LSP has user's mobile push token. When channel event needs response:
- LSP sends silent push.
- Mobile wakes, opens connection to LSP.
- Handles event.

Requires careful coordination (Apple/Google background limits).

## Integration patterns

### Build a custodial backend
- Run LND/CLN backend.
- Create user accounts; track balances.
- Generate invoices on demand.
- Forward HTLC payments via your node.

### Build a self-custodial mobile app
- **Best**: Breez SDK or LDK Node (hides complexity).
- **More control**: directly use LDK Rust crates.
- Provide LSP integration for inbound liquidity.

### Build a Lightning Address resolver
- HTTP server with `/.well-known/lnurlp/<user>` endpoint.
- Backend talks to your LN node (LND/CLN/phoenixd/LDK).
- See [lightning-address/SKILL.md](../lightning-address/SKILL.md).

## Wallet SDK comparison

| SDK | Backends | Bindings | Self-custody |
|-----|----------|----------|--------------|
| **Breez SDK** | LDK + Greenlight | many | yes |
| **LDK Node** | LDK | Rust + bindings | yes |
| **Lightning Toolkit / Bitkit SDK** | LDK | native | yes |
| **LndHub** | LND | REST | no (custodial) |
| **Greenlight Client** | CLN cloud | many | yes |

For new mobile app integrations as of 2025, **Breez SDK** or **LDK
Node** are the top choices.

## Common bugs

- Treating LSP as fully trusted → didn't run watchtower → potentially
  vulnerable.
- Bg-sync misconfigured → channels close due to inactivity.
- iOS background restrictions ignored → app killed before processing
  channel events.
- Custodial backend with no insolvency monitoring → outage = users
  funds locked.

## See also

- [lsp/SKILL.md](../lsp/SKILL.md)
- [ldk/SKILL.md](../ldk/SKILL.md)
- [phoenixd/SKILL.md](../phoenixd/SKILL.md)
- [greenlight/SKILL.md](../greenlight/SKILL.md)
- [watchtowers/SKILL.md](../watchtowers/SKILL.md)
