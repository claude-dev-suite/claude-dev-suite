---
name: bitcoin-privacy-payjoin
description: |
  PayJoin (BIP78 + v2): receiver-augmented payment that breaks
  common-input-ownership heuristic. v2 adds async relay support.
  USE WHEN: implementing PayJoin sender/receiver, designing privacy-
  preserving payment flows, integrating with payjoin servers.
allowed-tools: Read, Grep, Glob
---

# PayJoin (BIP78 + v2)

PayJoin = "P2EP" (pay-to-endpoint). The receiver adds **their own
input** to the sender's tx, defeating the common-input-ownership
heuristic.

Spec: BIP78 (sync) + PayJoin v2 (async via relay).

## Mechanism

### BIP78 sync flow

1. Receiver gives sender a URL with `?pj=https://...` (PayJoin
   endpoint).
2. Sender constructs an unsigned tx paying receiver.
3. Sender POSTs the unsigned tx (or its PSBT) to PayJoin endpoint.
4. Receiver:
   - Adds one of their UTXOs to inputs.
   - Increases the output to themselves by that UTXO's value.
   - Returns modified PSBT.
5. Sender signs and broadcasts.

Result: tx with **inputs from BOTH** sender and receiver. Heuristic
analyst now can't tell which inputs belong to whom.

## v2 (async)

BIP78 v1 requires the receiver to be online during the payment.
v2 introduces a **relay** so receiver can be offline:
- Sender posts to relay.
- Relay holds the proposal.
- Receiver polls relay periodically; processes when online.
- Returns response via relay.

Sender can then sign + broadcast. End-to-end encrypted (sender +
receiver have known pubkeys for the channel).

## URI format

```
bitcoin:bc1q...?amount=0.001&pj=https://example.com/pj/endpoint&pjos=0
```

`pj=` for v1.
`pjos=0` and `pjes=` parameters for v2.

## Privacy properties

- **Common-input heuristic broken** — analyst can no longer assume
  all inputs belong to same wallet.
- **Tx looks normal** — no special opcodes, just multiple inputs.
- **Amount is partially hidden** — receiver's added input means
  the output value isn't necessarily the "payment amount" anymore.

## Compared to CoinJoin

| Aspect | CoinJoin | PayJoin |
|--------|----------|---------|
| Multi-party | many participants | sender + receiver |
| Per-payment | dedicated round | seamless within payment |
| Fee | extra coordinator + on-chain | small overhead |
| Anonymity set | size of round | 2 |
| Frequency | periodic mixing | every payment can be PayJoin |

PayJoin is **simpler** to integrate (every payment can be a PayJoin)
but provides smaller anonymity set per-payment. Combined effect with
many users = chain-wide doubt.

## Implementations

### v1
- **BTCPay Server** — PayJoin receiver out of the box.
- **Sparrow Wallet** — sender + receiver.
- **Wasabi Wallet** — partial.

### v2
- Spec finalizing 2025-2026.
- Adoption growing.

## Use cases

- **Merchant payments** with privacy by default.
- **Donation pages** that combine multiple donors via PayJoin.
- **General payment hygiene** — make tx look like CoinJoin without
  dedicated rounds.

## Common bugs

- Sender refuses to PayJoin (most wallets default to non-PayJoin
  for simplicity).
- Receiver doesn't add input → tx is just a normal payment, no
  privacy gain.
- Receiver double-spending: their input is used in PayJoin AND
  another tx → either tx fails.
- Fee miscalculation: sender's tx had fee buffer for one input,
  PayJoin adds another → fees split unevenly.

## See also

- [coinjoin/SKILL.md](../coinjoin/SKILL.md)
- [silent-payments/SKILL.md](../silent-payments/SKILL.md)
- [../wallets/uri-schemes/SKILL.md](../../wallets/uri-schemes/SKILL.md)
- [../../infrastructure/btcpay/SKILL.md](../../infrastructure/btcpay/SKILL.md)
