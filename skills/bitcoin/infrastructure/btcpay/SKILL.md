---
name: bitcoin-infrastructure-btcpay
description: |
  BTCPay Server: open-source merchant payment processor. Self-hosted,
  supports BTC + Lightning + altcoins, plugin ecosystem, Lightning
  Address resolver, point-of-sale.
  USE WHEN: deploying merchant payments, integrating with BTCPay,
  building plugins.
allowed-tools: Read, Grep, Glob
---

# BTCPay Server

Open-source, self-hosted Bitcoin payment processor. The dominant
non-custodial alternative to Stripe/PayPal for BTC.

Repo: `github.com/btcpayserver/btcpayserver` (.NET / C#).

## Architecture

- **BTCPay Server** (.NET app) — main server.
- **NBXplorer** — wallet management, indexes via Bitcoin Core.
- **Bitcoin Core** + optional **Electrs** / **Esplora**.
- **LND** / **CLN** / **Eclair** — Lightning node.
- **Postgres** for state.

## Features

- **Stores** (separate merchant accounts).
- **Invoices** with checkout UI.
- **PoS** (Point of Sale) terminal.
- **Apps**: crowdfund, paywall, gift cards.
- **Plugins**: Litecoin, Liquid, Monero, etc.
- **Webhooks**: notify your app on payment status.
- **API** (REST + Lightning RPC).
- **Lightning Address** resolver out of the box.

## Setup

Easy install: `BTCPay Docker Deployment` script:
```bash
. ./btcpay-setup.sh -i
```

Configures Docker + bitcoind + LND + BTCPay in one go. Production-ready
by default.

## Security

- **Minimum version 2.4.2** (7 August 2026). Every earlier release —
  including the 2.4.2 release candidates — let an unauthenticated remote
  attacker fetch LND `.macaroon` files and take over the node. BTCPay
  confirmed in-the-wild exploitation and stolen funds. BTCPay's own
  on-chain wallets (hot wallets included) and CLN/Eclair backends are not
  exposed, but funds held in LND's internal on-chain wallet are part of
  the affected node and may still be at risk.
  [Advisory](https://blog.btcpayserver.org/security-advisory-btcpay-server-2-4-2/)
- Pair with **NBXplorer >= 2.6.10**. The update also moves LND to 0.21.1
  and regenerates its macaroons; rotate manually if you expose LND through
  your own reverse proxy, Tor service or forwarded port.
- Current release **2.4.4** (7 September 2026); 2.4.3 (24 August 2026) is
  a further security release for servers shared by many users.
- 2.4.2 disables Greenfield **Basic authentication** five minutes after
  account creation (opt-in via account settings), and **temporarily**
  removes public LND API access on Docker deploys — external wallets such
  as Zeus can no longer connect through the BTCPay domain or onion
  address. BTCPay plans to restore the option when it is safe to do so;
  still removed as of September 2026.
- 2.4.4 hardening defaults: NFC checkout off, zero-amount invoices
  blocked, store users must accept an invitation, legacy BitPay Basic-auth
  API keys removed.

## Use cases

- **Merchants** accepting BTC + LN.
- **Shopify / WooCommerce / Magento** plugin integrations.
- **Crowdfunding** platforms.
- **PoS** for physical stores.
- **Donation pages**.

## Lightning support

- **LND**, **CLN**, or **Eclair** as LN backend.
- **Lightning invoices** auto-generated per BTCPay invoice.
- **LNURL** support (LNURL-pay, withdraw).
- **Lightning Address**: `customer@yourdomain.com` resolves via BTCPay.

## API

Greenfield REST API under `/api/v1/`:
```
POST /api/v1/stores/{storeId}/invoices
GET  /api/v1/stores/{storeId}/invoices/{invoiceId}
GET  /api/v1/invoices/{invoiceId}/payment-methods
PUT  /api/v1/stores/{storeId}/payment-methods/{paymentMethodId}
```

BTCPay 2.0 (30 October 2024) removed every payment-method-type-specific
route — `/payment-methods/onchain/{cryptoCode}`,
`/payment-methods/LightningNetwork/{cryptoCode}`,
`/payment-methods/LNURLPay/{cryptoCode}` (GET/PUT/DELETE) — in favour of
the generic `{paymentMethodId}` form, and renamed the ids:

| Pre-2.0 id | 2.x id |
|------------|--------|
| `BTC-OnChain`, `BTC-BitcoinLike`, `BTC-BTCLike` | `BTC-CHAIN` |
| `BTC-LightningNetwork`, `BTC_OffChain` | `BTC-LN` |
| `BTC-LNURLPAY` | `BTC-LNURL` |

Old id strings are still accepted as **input** (BTCPay normalises them);
responses always return the new names. The on-chain wallet subtree moved
to `/payment-methods/{paymentMethodId}/wallet/*` — `preview`, `generate`,
`address`, `transactions`, `utxos`, `feerate`. Invoice payment-method
data is a JSON **array**, with `paymentMethodId` (was `paymentMethod`),
`currency` (was `cryptoCode`) and `paymentMethodFee` (was `networkFee`).
Checked against the live Greenfield swagger, September 2026.

## Common issues

- **Memory**: ~4 GB RAM minimum (more for Bitcoin Core + LN).
- **Synchronization**: bitcoind IBD blocks BTCPay startup.
- **HTTPS**: default deploys with Let's Encrypt; needs DNS.
- **Plugin compatibility**: plugins lag behind BTCPay version.

## See also

- [esplora/SKILL.md](../esplora/SKILL.md)
- [../lightning/lnd/SKILL.md](../../lightning/lnd/SKILL.md)
- [../lightning/lnurl/SKILL.md](../../lightning/lnurl/SKILL.md)
- [../lightning/lightning-address/SKILL.md](../../lightning/lightning-address/SKILL.md)
