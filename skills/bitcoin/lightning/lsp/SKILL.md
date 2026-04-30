---
name: lightning-lsp
description: |
  LSP (Lightning Service Provider) specifications: BLIPs, JIT channels,
  on-pay channel open, MPP-trampoline, BOLT12 hosted invoice. Major
  LSPs: ACINQ (Phoenix backend), Voltage, Olympus, Megalith, Flashsats.
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

BLIPs (BOLT-Lightning Improvement Proposals) at
`github.com/lightning/blips`. Key for LSPs:

- **BLIP-50**: LSP API: GetInfo, CreateOrder, GetOrder.
- **BLIP-51**: Channel-open via CreateOrder.
- **BLIP-52**: JIT channels (channel opens during payment forward).
- **BLIP-53**: HODL invoices for LSP integration.

LSP API typically over HTTPS with API key:
```
POST /v1/get_info
POST /v1/create_order   { lspBalance, clientBalance, expiry }
POST /v1/get_order
```

## Major LSPs (late 2025)

| LSP | Specialty |
|-----|-----------|
| **ACINQ** | Phoenix's hosted backend, splice-on-demand |
| **Voltage** | Cloud LN nodes + LSP services |
| **Olympus by ZBD** | Zaps + LN payments LSP |
| **Megalith Node** | Public liquidity provider |
| **Flashsats** | LSP service for app integrators |
| **Magma (Amboss)** | LSP marketplace |

Many LSPs operate via custom HTTP APIs in addition to BLIP-50+.

## Mobile wallet / LSP patterns

### Phoenix + ACINQ
- Phoenix mobile is the wallet, ACINQ hosts an Eclair node as the
  customer's "LSP".
- ACINQ auto-splices to maintain liquidity.
- Fees: small per-transaction percentage.

### Mutiny + multiple LSPs
- Mutiny Wallet uses LDK + can rotate between LSPs.
- Customer can choose LSP per channel.

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
