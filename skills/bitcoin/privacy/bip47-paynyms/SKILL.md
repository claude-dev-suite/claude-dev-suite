---
name: bitcoin-privacy-bip47
description: |
  BIP47 PayNyms — reusable payment codes via notification tx +
  Diffie-Hellman derivation. See also the wallet-side reference at
  ../../wallets/payment-codes/.
  USE WHEN: integrating PayNyms, evaluating against Silent Payments.
allowed-tools: Read, Grep, Glob
---

# BIP47 PayNyms (privacy view)

Privacy-oriented summary; full details in
[../../wallets/payment-codes/SKILL.md](../../wallets/payment-codes/SKILL.md).

## Privacy properties

- Sender has anonymity-of-1 — server can correlate "X paid Y" via
  notification tx.
- Receiver public address never appears on chain.
- Different sender pairs use different derivation chains → no
  cross-sender correlation.

## Compared to Silent Payments

- BIP47 has **notification tx** that leaks the existence of
  sender ↔ receiver pairs.
- Silent Payments has **no notification tx** — better privacy.
- BIP47 has **lower scan cost** for receiver.

## Status

- Sparrow + Stack Wallet maintain BIP47 support.
- Samourai (formerly the dominant BIP47 wallet) shut down 2024.
- Adoption in decline as Silent Payments matures.

## See also

- [../wallets/payment-codes/SKILL.md](../../wallets/payment-codes/SKILL.md)
- [silent-payments/SKILL.md](../silent-payments/SKILL.md)
- [stealth/SKILL.md](../stealth/SKILL.md)
