---
name: bitcoin-payment-codes
description: |
  BIP47 reusable payment codes (PayNyms): notification transactions,
  derived per-counterparty addresses, Diffie-Hellman shared-secret
  derivation. Privacy-preserving alternative to address rotation.
  USE WHEN: implementing PayNyms / Sparrow / Samourai-compatible
  payment codes, evaluating BIP47 vs Silent Payments.
allowed-tools: Read, Grep, Glob
---

# BIP47 Reusable Payment Codes (PayNyms)

A **payment code** is a single shareable string per identity. Senders
derive **fresh, unlinkable** addresses for each payment from the
payment code + their own keys via Diffie-Hellman. The recipient never
sees a static address publicly.

## Code format

```
P-Code = base58check(version || chain_code || pubkey || features || padding)
```

Total ~80 bytes encoded. Currently version 1.

## Notification transaction

First time Sender pays Receiver, Sender broadcasts a **notification
tx** to alert Receiver:
```
Sender:
  outputs:
    - tiny payment to a deterministic Notification Address derived
      from Receiver's pubkey
    - OP_RETURN with blinded payment-code revealing Sender's identity
      (encrypted to Receiver)
```

Notification address = HASH160(P_R) → Base58 P2PKH.

Receiver scans for incoming UTXOs at their notification address. When
one is seen, decrypts OP_RETURN to learn Sender's payment code, then
derives shared addresses.

## Per-payment address derivation

After notification:
```
shared_secret = SHA256(ECDH(s_S, P_R))   (or symmetric for receiver)
address_n = derive(P_R, "0/n" with shared_secret tweak)
```

n = 0, 1, 2, ... for sequential payments. Both Sender and Receiver
can derive the same `address_n` independently.

Receiver scans these addresses (just like an HD wallet's external
chain).

## Privacy properties

- **Sender → Receiver public address** never appears on chain after
  notification.
- **Different senders → same Receiver** use different derivation
  paths → addresses are unlinkable.
- **Notification tx leaks** that sender knows receiver's payment code
  (from the OP_RETURN). Some implementations use **stealth-style**
  notifications instead.

## Compared to Silent Payments (BIP352)

| Aspect | BIP47 | Silent Payments |
|--------|-------|-----------------|
| Notification | yes (one tx per pair) | none |
| Per-tx scan cost | low (only your derivation chain) | high (every output of every tx) |
| Public-key reveal | Sender's pubkey to Receiver via ECDH | none — Schnorr-based blinding |
| Standard | BIP47 (since 2014) | BIP352 (newer, 2024) |

Silent Payments has stronger privacy but heavier scan cost.

## Implementations

- **Samourai Wallet** — original BIP47 reference (Samourai shut down
  in 2024).
- **Sparrow Wallet** — `wallet → payment codes` tab.
- **Stack Wallet** — supports BIP47.
- **Whirlpool**, **Wabisabi** — sometimes integrate as input
  obfuscation step.

## Common pitfalls

- **Notification tx privacy leak**: anyone can correlate "tx pays
  notification address X" with the receiver's known payment code.
  Mitigation: use multiple receivers / Tor relay.
- **Reusing a P-code across services** → service operators can
  cluster.
- **Reorgs** that orphan the notification tx → derived addresses
  may still be valid, but receiver must rescan if reorg deep enough.
- **Multi-account collisions**: P-code derivation index reused across
  senders → address collision possible (rare).

## Status (2024-2026)

- BIP47 has lower adoption than originally hoped due to:
  - Samourai's shutdown removed the dominant wallet.
  - Silent Payments arrived with stronger privacy.
  - Most wallets prefer simpler "fresh address per request".
- Sparrow and Stack maintain BIP47 support for compatibility.

## See also

- [../../privacy/silent-payments/SKILL.md](../../privacy/silent-payments/SKILL.md)
- [../../privacy/stealth/SKILL.md](../../privacy/stealth/SKILL.md)
- [../../privacy/bip47-paynyms/SKILL.md](../../privacy/bip47-paynyms/SKILL.md)
