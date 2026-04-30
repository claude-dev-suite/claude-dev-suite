---
name: bitcoin-privacy-p2p-exchanges
description: |
  P2P KYC-free Bitcoin exchanges: Bisq (desktop, Tor), RoboSats
  (Tor / browser, Lightning), Hodl Hodl (web, multisig escrow).
  USE WHEN: evaluating KYC-free buy/sell options, integrating P2P
  trading.
allowed-tools: Read, Grep, Glob
---

# P2P Bitcoin Exchanges (KYC-free)

Direct peer-to-peer Bitcoin trading without a centralized order book
or KYC custody.

## Bisq

- Java desktop app.
- Operates entirely over **Tor**.
- Decentralized order book via P2P network.
- Multisig escrow (2-of-2 with arbitrator).
- Fiat methods: SEPA, Zelle, Revolut, cash by mail, etc.
- Trades typically 0.01-1 BTC.
- BSQ token for fee/governance.

Maturity: very mature (2014+).

## RoboSats

- Tor-only (also accessible via clearnet).
- Lightning-only (no on-chain).
- "Robot identity" — stateless, no account, just a per-trade key.
- Multi-language (12+).
- Fiat methods: SEPA, Wise, Revolut, cash, gift cards, others.
- Trades typically smaller (50-5000 EUR equivalent).
- Frontend simple HTML; sat-denominated.

Maturity: 2022+, growing.

## Hodl Hodl

- Web-based.
- 2-of-3 multisig escrow.
- KYC-optional (most trades are KYC-free).
- Diverse fiat methods.
- Loans (HodlOptions) plugin.
- Trades range $50 to many thousands.

Maturity: 2017+, mature.

## Compared

| Aspect | Bisq | RoboSats | Hodl Hodl |
|--------|------|----------|-----------|
| Network | Tor only | Tor (default) | Web (HTTPS) |
| Custody | Multisig | LN HTLC | Multisig |
| KYC | None | None | None (optional KYC) |
| Settlement | On-chain | Lightning | On-chain |
| Trade size | Medium-large | Small-medium | Small-large |
| Mobile-friendly | No | Yes | Yes |

## Use cases

- **First sats acquisition** without exchange registration.
- **Privacy-preserving** off-ramp / on-ramp.
- **Trades in censored jurisdictions**.
- **Avoiding KYC attestation chains** in cluster-analysis.

## Trade execution

Generic flow:
1. Buyer sends fiat to seller off-chain (bank, cash, gift card).
2. Seller releases BTC from multisig (or LN HTLC) once fiat received.
3. Disputes: arbitrator (Bisq) or community (RoboSats).

## Limitations

- **Slower** than exchange-based trading (per-trade time hours, not
  seconds).
- **Lower volume** — large trades hard to fill.
- **Counterparty risk** — KYC-free means no recourse if counterparty
  vanishes after fiat sent.

## See also

- [coinjoin/SKILL.md](../coinjoin/SKILL.md)
- [../../lightning/submarine-swaps/SKILL.md](../../lightning/submarine-swaps/SKILL.md)
- [tor/SKILL.md](../tor/SKILL.md)
