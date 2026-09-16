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

## Bisq 1

- Java desktop app.
- Operates entirely over **Tor**.
- Decentralized order book via P2P network.
- Multisig escrow (2-of-2 with arbitrator).
- Fiat methods: SEPA, Zelle, Revolut, cash by mail, etc.
- Hard network cap of **0.250 BTC** per trade
  (`TradeLimits.MAX_TRADE_AMOUNT`, introduced in v1.10.0 and unchanged
  through v1.10.7, 25 August 2026); default local limit 0.1 BTC.
- BSQ token for fee/governance; still the home of BSQ markets and the
  DAO.

Maturity: very mature (2014+).

### 1 May 2026 exploit

The taker supplies the trade's miner-fee value to the maker, and it was
not validated against negative numbers — an attacker used this to make
the maker compute an incorrect multisig output value. **11.59104 BTC
lost across 10 users**, altcoin trades only; fiat trades were shielded
by account-age witness signing. Refund Angels advanced 10.98538295 BTC
to reimburse victims; repayment out of BTC trade fees is *proposed*, not
ratified — phased in over DAO cycles at 25% / 50% / 75% of the Burning
Men share, with a 12-18 month settlement horizon called realistic
(Bisq blog, 16 June 2026).

Hardening shipped in **v1.10.0**: validation added across deposit,
payout, delayed-payout and mediated-payout transactions, trade amounts
and prices, fees, multisig keys and raw inputs; price deviation capped
at 25%; a hard network cap on trade amount introduced at 0.125 BTC
(before v1.10.0 the ceiling came from the DAO `MAX_TRADE_LIMIT`
parameter alone, default 2 BTC); XMR auto-confirmation disabled by
network filter pending an audit. The cap was raised to 0.250 BTC in
**v1.10.1**. Bisq 2 was not affected.

## Bisq 2 / Bisq Easy

- Separate codebase (`bisq-network/bisq2`), latest v2.1.12
  (22 August 2026). Bisq 1 is not deprecated.
- **Bisq Easy** (first Bisq 2 trade protocol, launched March 2024) has
  **no multisig escrow** — security is proportional to *seller
  reputation*. The buyer pays fiat first, so only sellers need a score.
- Trade range **6-600 USD** equivalent; reputation buys headroom at
  200 score per USD, and 1200 is the minimum score to post a sell offer
  (`BisqEasyTradeAmountLimits`, v2.1.12).
- Sellers settle **on-chain or over Lightning** — seller pays the mining
  fee or the LN routing fee, buyer pays neither (Bisq Easy wiki, Mining
  fees).
- Disputes go to a mediator, not an arbitrator — there is no escrow to
  split.
- Mobile: `bisq-network/bisq-mobile` ships **Bisq Easy Node** on Google
  Play (`anode_0.13.0`, 5 September 2026) and **Bisq Connect**, a thin
  client for a Bisq 2 node you trust, on Google Play and iOS TestFlight
  (`connect_0.9.0`, 11 September 2026).
- Unaffected by the Bisq 1 May 2026 exploit (different codebase).
- **Bisq MuSig** is the planned escrowed successor protocol and the
  project's stated highest strategic priority for 2026 (Bisq blog,
  June 2026); not shipped as of v2.1.12.

Maturity: Bisq Easy in production since 2024; MuSig in development.

## RoboSats

- Tor-only (also accessible via clearnet).
- **Federated — there is no single coordinator.** Since v0.6.0-alpha
  "The Federation Layer" (17 March 2024) anyone can run a coordinator;
  the client app joins every registered coordinator's order book and
  shows per-coordinator reputation, fees and policies.
- The client rate-limits young coordinators: 250,000 sats max order,
  +30% every 2016 blocks, "mature" (any order size) after roughly
  12,288 blocks (~6 months). Pre-v0.6.0 "Founder" coordinators are
  mature by default.
- Book ordering is a lottery weighted by DevFund donation value; since
  v0.8.7-alpha (9 September 2026) the weight is the coordinator's live
  `devfund% x fee rate`, falling back to static `federation.json`.
- Lightning HODL-invoice escrow; optional on-chain payout ("swap").
- "Robot identity" — stateless, no account, just a per-trade key.
- Multi-language (12+).
- Fiat methods: SEPA, Wise, Revolut, cash, gift cards, others.
- Trades typically smaller (50-5000 EUR equivalent).
- Frontend simple HTML; sat-denominated.

Maturity: 2022+, growing; still alpha-tagged (v0.8.7-alpha,
9 September 2026).

## Hodl Hodl

- Web-based.
- 2-of-3 multisig escrow.
- KYC-optional (most trades are KYC-free).
- Diverse fiat methods.
- Loans (HodlOptions) plugin.
- Trades range $50 to many thousands.

Maturity: 2017+, mature.

## Compared

| Aspect | Bisq 1 | Bisq Easy | RoboSats | Hodl Hodl |
|--------|--------|-----------|----------|-----------|
| Network | Tor only | Tor only | Tor (default) | Web (HTTPS) |
| Custody | Multisig | None (reputation) | LN HTLC | Multisig |
| KYC | None | None | None | None (optional KYC) |
| Settlement | On-chain | On-chain or LN | Lightning (on-chain opt.) | On-chain |
| Trade size | <= 0.25 BTC | 6-600 USD | Small-medium | Small-large |
| Mobile-friendly | No | Yes (Android) | Yes | Yes |

## Use cases

- **First sats acquisition** without exchange registration.
- **Privacy-preserving** off-ramp / on-ramp.
- **Trades in censored jurisdictions**.
- **Avoiding KYC attestation chains** in cluster-analysis.

## Trade execution

Generic flow:
1. Buyer sends fiat to seller off-chain (bank, cash, gift card).
2. Seller releases BTC from multisig (or LN HTLC) once fiat received.
3. Disputes: arbitrator (Bisq 1), mediator (Bisq Easy) or the hosting
   coordinator (RoboSats).

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
