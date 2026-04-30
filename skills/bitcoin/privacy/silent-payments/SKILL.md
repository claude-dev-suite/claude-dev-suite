---
name: bitcoin-privacy-silent-payments
description: |
  Silent Payments (BIP352): single static address from which sender
  derives unique output per payment. Schnorr-based blinding; no
  notification tx needed.
  USE WHEN: implementing BIP352 client/wallet, evaluating vs BIP47,
  understanding scan cost trade-offs.
allowed-tools: Read, Grep, Glob
---

# Silent Payments (BIP352)

A receiver publishes **one static address** (silent payment address).
Senders compute a **unique fresh output** for each payment from the
address + their own keys via Schnorr-based ECDH-like derivation.

No notification tx. No address rotation. Strong privacy by default.

## Mechanism

### Receiver

Has scan key `b_scan` and spend key `b_spend`. Publishes:
```
silent_address = encode(B_scan, B_spend)   bech32m
                  = scan pubkey + spend pubkey
```

### Sender

For each payment:
1. Generates ephemeral private `a` (or uses an input's privkey if
   available + safe).
2. Computes shared secret with receiver:
   `S = ecdh(a, B_scan) = a * B_scan = b_scan * (a*G)`
3. Tweaks receiver's spend key:
   `P = B_spend + Hash(S || k) * G`  for `k = 0, 1, 2, ...`
4. Sends to P2TR(P).

Receiver finds outputs via:
1. For each tx in chain, compute `S = b_scan * input_pubkey`.
2. Check if any output matches `B_spend + Hash(S || 0) * G`.
3. If yes, derive private key for the output.

## Privacy properties

- **No public address per payment** — analyst sees random P2TR
  outputs, not a static address.
- **No notification tx** (vs BIP47).
- **No correlation** between different senders to same recipient.
- **Forward security** — past outputs untraceable from future
  payments.

## Scan cost

The trade-off: receiver must scan **every Taproot output** of every
tx for matches.

- For a node already running: marginal cost.
- For a light client: requires special scan-friendly index (BIP157/
  158 filters extended).

Lightning-Labs proposes "Silent Payments-friendly" filters as future
indexer work.

## Implementations

- **BDK** — silent-payments crate.
- **electrum-silent-payments** — Electrum extension.
- **silentpay-py** — Python.
- Bitcoin Core: support for **scan and send** without explicit silent
  payment integration is in progress.

Hardware wallets: limited (need wallet to compute scan tweaks; some
HW have scan-key offload challenges).

## Compared to BIP47

| Aspect | BIP47 | Silent Payments |
|--------|-------|-----------------|
| Notification tx | Yes (one per pair) | No |
| Per-tx scan cost | Low (only your derivation) | High (every output) |
| Static address | Per-pair | Universal |
| Privacy | Good | Better |
| Standard | BIP47 (2014) | BIP352 (2024) |
| Wallet adoption | Sparrow, Stack | BDK, Electrum, growing |

## Use cases

- **Charity / donation addresses** publicly posted.
- **Newsletter sponsorship** receivers.
- **Recurring deposits** from many parties.

## Limitations

- **Scan cost** — not trivially Lightning-light-client friendly.
- **No HW wallet support** widely yet.
- **New** — ecosystem still maturing.

## See also

- [bip47-paynyms/SKILL.md](../bip47-paynyms/SKILL.md)
- [stealth/SKILL.md](../stealth/SKILL.md)
- [../wallets/payment-codes/SKILL.md](../../wallets/payment-codes/SKILL.md)
- [../../cryptography/schnorr/SKILL.md](../../cryptography/schnorr/SKILL.md)
