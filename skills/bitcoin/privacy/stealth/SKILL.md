---
name: bitcoin-privacy-stealth
description: |
  Stealth addresses: ECDH-based derivation generating a unique output
  per payment. Pre-BIP47 / BIP352, conceptually similar.
  USE WHEN: understanding the family of stealth-address schemes,
  comparing with BIP47 / Silent Payments.
allowed-tools: Read, Grep, Glob
---

# Stealth Addresses

Generic concept of generating a unique receiving address per payment
via Diffie-Hellman key agreement between sender and receiver. Provides
on-chain unlinkability for payments to the same recipient.

## History

- 2014: original stealth-address proposals (Peter Todd, BIP63 draft).
- BIP63 was withdrawn; never widely adopted.
- BIP47 (2014) — concrete reusable payment codes (PayNyms).
- BIP352 (2024) — Silent Payments, the modern Schnorr-based variant.

## Concept

```
Receiver: scan key (s), spend key (b)
        public form (S, B)

Sender: per-payment random e
        compute: P = B + H(e * S) * G
        send to: address(P)

Receiver scans all txs for outputs matching: P = B + H(s * eG) * G
        (where eG is the sender's ephemeral pubkey)
        knowing s, derive scalar t = H(s * eG)
        spend key for output: b + t  (mod n)
```

## Compared modern variants

- **BIP47**: uses notification tx + simpler derivation.
- **BIP352 Silent Payments**: stealth address concept refined for
  Schnorr, no notification tx.
- **Monero stealth addresses**: same concept native to Monero
  (cross-chain inspiration).

## Status

- Generic "stealth address" no longer common term in Bitcoin context.
- Modern Bitcoin equivalents = BIP47 (older) and BIP352 (newer).

## See also

- [bip47-paynyms/SKILL.md](../bip47-paynyms/SKILL.md)
- [silent-payments/SKILL.md](../silent-payments/SKILL.md)
