---
name: lightning-lsp
description: |
  LSP (Lightning Service Provider) specifications: BLIPs, JIT channels,
  on-pay channel open, MPP-trampoline, BOLT12 hosted invoice. Major
  LSPs: ACINQ (Phoenix backend), Olympus by ZEUS, Megalith, Flashsats,
  Magma.
  USE WHEN: integrating with an LSP, designing LSP services,
  evaluating LSP options for a wallet.
allowed-tools: Read, Grep, Glob
---

# LSPs (Lightning Service Providers)

LSPs solve the **inbound liquidity problem**: a new Lightning user
has no inbound capacity — they can't receive without first opening a
channel. LSPs offer hosted, JIT, or "channel-on-pay" services.

## Service types

### Static channel-open (paid)
- Customer pays LSP a fee (sats) for a fixed inbound capacity.
- Typically dual-funded or zero-conf.

### JIT (Just-in-Time) channels
- Customer requests an invoice.
- LSP intercepts the payment and **opens a channel during the
  payment flow**, paying out via the new channel.
- Customer needs no pre-existing channel.

Typical fee: 1-2% of channel amount, deducted from payment.

### Liquidity ads (BOLT 9 features)
- LSP advertises liquidity for sale on Lightning gossip.
- Customers buy via dual-funded channel open.

### MPP-trampoline routing
- LSP runs trampoline node.
- Mobile clients route through LSP without full graph knowledge.

## BLIP-50+ specifications

BLIPs (Bitcoin Lightning Improvement Proposals) at
`github.com/lightning/blips`. As of September 2026 the blips master
tree carries exactly four LSPS specs, all `Status: Active`:

- **BLIP-50 / LSPS0**: LSP Spec Transport Layer. Not an API — the
  transport. JSON-RPC 2.0 objects carried in BOLT 8 custom peer
  messages with message ID **37913**. Defines one method,
  `lsps0.list_protocols` (params `{}`), whose spec example result is
  `{"protocols":[1,3]}` — illustrative only, as there is no LSPS3
  (see below). LSPs may advertise with feature bit 729
  (`option_supports_lsps`).
- **BLIP-51 / LSPS1**: Channel Requests — buy a channel outright.
  `lsps1.get_info`, `lsps1.create_order`, `lsps1.get_order`.
- **BLIP-52 / LSPS2**: JIT Channel Negotiation.
  `lsps2.get_info`, `lsps2.buy`.
- **BLIP-55 / LSPS5**: Webhook Registration (merged July 2025).
  `lsps5.set_webhook`, `lsps5.list_webhooks`, `lsps5.remove_webhook`.
  Lets a suspended mobile wallet be woken by push when the LSP has
  something for it (`lsps5.payment_incoming`, `lsps5.expiry_soon`,
  `lsps5.onion_message_incoming`, ...).

There is no BLIP-53 or BLIP-54.

The LSPS API is **not** HTTPS and has no API key: it rides the
client's existing BOLT 8 connection to the LSP, and the client is
authenticated by the node id of that tunnel. A request looks like:

```json
{ "jsonrpc": "2.0",
  "id": "example#3cad6a54d302edba4c9ade2f7ffac098",
  "method": "lsps0.list_protocols",
  "params": {} }
```

`_sat`/`_msat` fields are JSON **strings** of decimal integers
(LSPS0 amount encoding), not JSON numbers.

## Major LSPs (status checked September 2026)

| LSP | Specialty | Sept 2026 status |
|-----|-----------|------------------|
| **ACINQ** | Phoenix's hosted backend, splice-on-demand | Active |
| **Olympus by ZEUS** | ZEUS wallet backend, JIT + LSPS1 sales | Active |
| **Megalith Node** | Public liquidity provider, LSPS1 + LSPS2 | Active |
| **Flashsats** | LSPS1 channel sales, 1M sat minimum | Active |
| **Magma (Amboss)** | Channel-lease marketplace ("Magma V2") | Active |
| **Voltage** | Cloud LN nodes; its Flow 2.0 LSP is retired | Not an LSP |

"Active" means the provider's public LSPS1 `get_info` answered in
September 2026 — Olympus `lsps1.lnolymp.us/api/v1/`, Megalith
`megalithic.me/api/lsps1/v1/`, Flashsats `lsp.flashsats.xyz/api/v1/`
— or, for ACINQ, that the product still ships: Phoenix 2.8.2
(8 September 2026), Eclair v0.14.3 (14 September 2026).

Two corrections to older versions of this list:

- Olympus is run by the **ZEUS** wallet team, not ZBD. Its JIT
  endpoint `0conf.lnolymp.us` now redirects to `flow.zeuslsp.com`.
  ZEUS infrastructure was breached on 5 August 2026; Olympus was back
  online 8 August and LSP channel services were restored 10 August
  2026, with no customer funds lost per ZEUS.
- Voltage no longer sells liquidity. Flow 2.0 is gone from
  voltage.cloud and from docs.voltage.cloud, which as of September
  2026 document managed LND hosting and developer APIs only, plus a
  notice that as of September 2026 still reads "On August 31, 2026, we
  will begin sunsetting Voltage's self-serve infrastructure product".

Many LSPs operate via custom HTTP APIs in addition to BLIP-50+:
Megalith's own docs note its LSPS1 currently runs over HTTP rather
than BOLT 8. Megalith's LSPS2 (JIT) service is on mainnet but its
docs still call it not yet production-ready (September 2026).

## Mobile wallet / LSP patterns

### Phoenix + ACINQ
- Phoenix mobile is the wallet, ACINQ hosts an Eclair node as the
  customer's "LSP".
- ACINQ auto-splices to maintain liquidity.
- Fees: small per-transaction percentage.

### Mutiny + multiple LSPs (historical)
- Mutiny Wallet used LDK and could rotate between LSPs, letting the
  customer choose an LSP per channel.
- Defunct: the wallet shut down at the end of 2024 and
  `MutinyWallet/mutiny-web` is archived on GitHub (last commit
  September 2024). Only self-hosting the open-source code remains.

### Breez SDK
- Spec-driven LSP integration via BLIPs.
- Self-custodial; LSP provides liquidity only.

## Channel-open during payment (JIT) flow

```
1. Customer opens app, requests invoice for 50,000 sats.
2. App talks to LSP: "I need an invoice; here's my static node info."
3. LSP returns:
   - BOLT11 invoice with route_hint pointing through LSP.
   - Promise to open channel on first payment.
4. Customer shares invoice with payer.
5. Payer pays. LSP receives the payment. LSP opens a channel to
   customer with `value = payment - fee`. Forwards remainder via
   the new channel as final HTLC. Channel funded with the inbound
   payment.
```

Risk: between LSP receiving payment and channel funding tx confirming
(zero-conf), customer trusts LSP not to keep funds.

## Self-custodial verification

When using an LSP, customer should:
- Verify channel open tx confirms (or has min_depth).
- Monitor channel state (no surprises in commitment).
- Have a watchtower in case LSP cheats.

## Common bugs

- LSP fee not communicated to user → user surprised by reduced
  amount received.
- Race: invoice expiry too short for LSP's channel-open path.
- LSP rejects payment → customer's payer is confused (sees error
  "incorrect_or_unknown_payment_details" but the invoice was valid).
- Channel close due to LSP cycling: customer needs new channel
  on next payment, more fees.

## See also

- [bolts/SKILL.md](../bolts/SKILL.md)
- [channels/SKILL.md](../channels/SKILL.md)
- [consumer-wallets/SKILL.md](../consumer-wallets/SKILL.md)
