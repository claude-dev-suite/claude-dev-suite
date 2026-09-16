---
name: lightning-consumer-wallets
description: |
  Consumer Lightning wallet integration patterns: Phoenix, Breez SDK,
  Zeus, BlueWallet (LN), Aqua, Bitkit. Custodial vs non-custodial,
  LSP partnerships, mobile-specific UX (push notifications, background
  sync).
  USE WHEN: integrating with consumer wallets, designing self-custodial
  mobile UX, evaluating wallet SDK options.
allowed-tools: Read, Grep, Glob
---

# Consumer Lightning Wallets

Most users access Lightning via mobile/desktop wallets. This skill
catalogues major options and integration patterns.

## Wallet matrix (as of September 2026)

| Wallet | Architecture | Custody | LSP |
|--------|--------------|---------|-----|
| **Phoenix** | Eclair core, mobile | Self-custodial via ACINQ trampoline | ACINQ exclusive |
| **Breez SDK** | Nodeless: Spark (current), Liquid (legacy) | Self-custodial | n/a (nodeless) |
| **Mutiny** *(defunct, shut down end of 2024)* | LDK web/mobile | Was self-custodial | n/a |
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
- Open-source SDK (MIT). Three variants have shipped; only one is
  current as of September 2026:
  - **Breez SDK - Spark** (`breez/spark-sdk`) — the recommended line.
    Nodeless, keys held only by the user; Lightning + Spark L2 with
    on-chain interop. 0.25.0 released 2026-09-10.
  - **Breez SDK - Nodeless (Liquid)** (`breez/breez-sdk-liquid`) —
    still published (0.12.4, 2026-06-17), nodeless via submarine swaps
    against the Liquid sidechain, but the docs now tell existing
    partners to move to the Spark implementation.
  - **Breez SDK - Greenlight** — deprecated and no longer maintained
    (Breez docs, checked September 2026); the
    `breez/breez-sdk-greenlight` repo no longer resolves.
- This is a Breez product decision, not a Greenlight one: Blockstream's
  Greenlight itself still ships (gl-client v0.6.0 and gl-sdk v0.4.0,
  both 2026-05-21).
- Multi-language bindings (Spark, September 2026): Rust, Swift, Kotlin,
  Kotlin Multiplatform, JS/TS (Wasm), React Native/Expo, Flutter, Go,
  Python, C#.
- Useful for app integrators wanting plug-and-play LN.

### Mutiny Wallet (defunct — historical)
Shut down; do not recommend it. Kept here because the design is still
a useful reference point for browser-based LDK.

- Announced 2024-08-05, wallet service ceased at the end of 2024;
  `MutinyWallet/mutiny-node` and `mutiny-web` are archived on GitHub,
  last commits Aug/Sep 2024 (checked September 2026); the company moved
  on to other products.
- Code remains open source, so self-hosting is the only remaining
  route. There is no hosted service or supported app.
- Design, for reference: web wallet (browser tab) + mobile app; pure
  LDK in WebAssembly for the browser version; multi-LSP (rotate,
  choose, fallback); encrypted state to user-supplied cloud (VSS).
- For a current LDK-in-production reference, lightningdevkit.org
  showcases Lightspark, Alby Hub, Cash App and Lexe (checked
  September 2026).

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
  LSPs offer this); standardised as BLIP-55 / LSPS5 Webhook
  Registration.

### Push notification flow

LSP has a way to reach the user's device. When a channel event needs
a response:
- LSP sends silent push.
- Mobile wakes, opens connection to LSP.
- Handles event.

Requires careful coordination (Apple/Google background limits).

### BLIP-55 / LSPS5: Webhook Registration

The standardised form of the above. bLIP-55 (`Status: Active`,
created 2024-12-02) in `lightning/blips`; the same text is LSPS5
`webhook_registration` version 1, status "For Implementation", in the
`BitcoinAndLightningLayerSpecs/lsp` repo (both checked September
2026). Registration rides the ordinary LSPS0 BOLT 8 transport:

- `lsps5.set_webhook` (`app_name` up to 64 bytes + HTTPS `webhook`
  URL up to 1024 chars, insert-or-replace up to an LSP-imposed
  limit), `lsps5.list_webhooks`, `lsps5.remove_webhook`.
- The LSP never talks to APNS/FCM itself. It `POST`s to the webhook
  of a *notification delivery service* run by the app developer,
  which holds the push credentials and turns the `POST` into a
  mobile-OS push. The client SHOULD bury the LSP node id, an
  authorization proof and a device identifier inside the webhook
  URL, and MAY do so by registering those with the delivery service
  and putting only the returned token in the URL.
- The LSP contacts all registered webhooks only while the client has
  no BOLT 8 tunnel open — i.e. exactly the suspended-app case.
- Notification methods (JSON-RPC 2.0 notification objects):
  `lsps5.webhook_registered` (sent to the one just registered),
  `lsps5.payment_incoming`, `lsps5.expiry_soon` (params `timeout`,
  the block height of the forced close; fired within 24 blocks of
  timeout), `lsps5.liquidity_management_request`,
  `lsps5.onion_message_incoming`. All take empty `params` except
  `expiry_soon`.
- Each notification is timestamped (ISO8601) and signed by the LSP
  node id via the LSPS0 `ln_signature` scheme (zbase32), so the
  delivery service can reject forged or replayed wakeups.
- Reference implementation: LDK's `lightning-liquidity` crate has an
  `lsps5` module (rust-lightning tree, checked September 2026).

See [lsp/SKILL.md](../lsp/SKILL.md) for LSPS0 transport and the rest
of the LSPS series.

## Integration patterns

### Build a custodial backend
- Run LND/CLN backend.
- Create user accounts; track balances.
- Generate invoices on demand.
- Forward HTLC payments via your node.

### Build a self-custodial mobile app
- **Best**: Breez SDK - Spark or LDK Node (hides complexity).
- **More control**: directly use LDK Rust crates.
- Provide LSP integration for inbound liquidity.

### Build a Lightning Address resolver
- HTTP server with `/.well-known/lnurlp/<user>` endpoint.
- Backend talks to your LN node (LND/CLN/phoenixd/LDK).
- See [lightning-address/SKILL.md](../lightning-address/SKILL.md).

## Wallet SDK comparison

| SDK | Backends | Bindings | Self-custody |
|-----|----------|----------|--------------|
| **Breez SDK - Spark** | Spark L2 + Lightning, nodeless | many | yes |
| **Breez SDK - Nodeless (Liquid)** | Liquid swaps + Lightning | many | yes |
| **Breez SDK - Greenlight** | CLN cloud | many | yes, but deprecated/unmaintained |
| **LDK Node** | LDK | Rust + bindings | yes |
| **Lightning Toolkit / Bitkit SDK** | LDK | native | yes |
| **LndHub** | LND | REST | no (custodial) |
| **Greenlight Client** | CLN cloud | many | yes |

For new mobile app integrations as of September 2026, **Breez SDK -
Spark** or **LDK Node** are the top choices. Do not start a new
integration on Breez SDK - Greenlight (deprecated) or, per Breez's own
guidance, on Breez SDK - Nodeless (Liquid).

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
