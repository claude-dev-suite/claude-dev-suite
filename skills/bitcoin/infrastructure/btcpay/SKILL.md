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

REST API under `/api/v1/`:
```
POST /api/v1/stores/{storeId}/invoices
GET  /api/v1/stores/{storeId}/invoices/{invoiceId}
POST /api/v1/stores/{storeId}/payment-methods/onchain
```

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
