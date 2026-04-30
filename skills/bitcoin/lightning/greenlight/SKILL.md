---
name: lightning-greenlight
description: |
  Greenlight by Blockstream: hosted CLN with self-custodial signing.
  Server runs the full CLN node; user retains private keys via
  signer protocol. Mobile-friendly without running a full LN node.
  USE WHEN: building mobile/web LN apps with self-custody but no
  on-device daemon, integrating with Blockstream's hosted infra.
allowed-tools: Read, Grep, Glob
---

# Greenlight (Blockstream)

Greenlight is a "hosted self-custodial Lightning" service. Blockstream
runs CLN nodes on its infrastructure. Users hold private keys on
their device and sign via the **signer protocol**.

Service: <https://blockstream.com/lightning/greenlight/>

## Architecture

```
[User device]                [Blockstream cloud]
  signer protocol  ──────►   CLN node
                  ◄──────    chain access, peer connections
```

- User device: holds master seed, runs `gl-client` library.
- Cloud: runs CLN with no key access; pings device for sigs.
- Network: TLS-mutual-auth between device and cloud.

When CLN needs to sign anything (commitment, HTLC), it sends a signing
request via the signer protocol. The device-side signer validates
the request, signs, and returns the signature.

## Why hosted

Mobile users can't run a 24/7 LN node — channels drop, force-closes
happen. Greenlight runs the node 24/7 while keys stay on device.

Compare:
- **Self-custodial mobile (LDK Node, Phoenix)**: keys + node on device,
  but channels drop when offline.
- **Custodial (Wallet of Satoshi)**: keys held by service; tradeoff
  is custody risk.
- **Greenlight**: keys on device, node hosted; node available 24/7.

## Signer protocol

Subset of CLN's hardware-signer protocol. Operations:
- Sign commitment tx.
- Sign HTLC tx.
- Provide ECDH for onion / gossip.
- Sign mutual close / cooperative close.

Each request includes:
- Channel state context.
- Counterparty pubkey.
- Operation type.

Device verifies state hasn't been "rolled back" (replay attacks) and
that the operation aligns with channel policy.

## gl-client library

Available in:
- **Rust** — primary `gl-client` crate.
- **Python** — `pygreenlight`.
- **Swift / Kotlin** — for mobile apps.
- **JS / WASM** — for browser apps.

```rust
let scheduler = Scheduler::new(node_id, network).await?;
let signer = Signer::new(seed, network, tls)?;
let node = scheduler.schedule(signer.tls()).await?;

// Use node like CLN
node.list_funds().await?;
node.create_invoice("desc", amount_msat).await?;
```

## Trust model

Greenlight trusts:
- **The hosted node** to be online (availability).
- **The hosted node** to relay your messages honestly.
- The hosted node CANNOT steal funds (it doesn't have keys).
- The hosted node CAN refuse to forward (DoS), trigger force-close, etc.

Mitigations:
- Force-close from device side anytime.
- Multi-sig or future variants where multiple cloud nodes vote.

## Comparison with other models

| Aspect | LDK Node (mobile) | Greenlight | Custodial |
|--------|-------------------|------------|-----------|
| Keys | device | device | service |
| Node uptime | mobile-bound | 24/7 cloud | 24/7 cloud |
| Channel security | device must be online | always online | service can rugpull |
| Privacy | local | service sees all traffic | service sees all |

## Setup

Mobile/desktop integration via Blockstream's onboarding:
1. Install gl-client SDK.
2. Generate seed locally.
3. Register node with Greenlight cloud.
4. Pin TLS certificate.
5. Run signer in background; node accessible via cloud.

Pricing: per-channel small fee (typically ~few sats per channel
operation); subject to Blockstream's evolving terms.

## See also

- [cln/SKILL.md](../cln/SKILL.md)
- [ldk/SKILL.md](../ldk/SKILL.md)
- [consumer-wallets/SKILL.md](../consumer-wallets/SKILL.md)
