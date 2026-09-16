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
- For a light client: needs a server to source the per-tx tweak data;
  BIP158 filters alone do not help, because the candidate output keys
  are not known until the tweak is in hand. BIP352 Appendix A ("Light
  Client Support") leaves this explicitly as open research.

Two lines of work as of September 2026. The **BIP0352 Index Server
Specification** (`silent-payments/BIP0352-index-server-specification`,
still WIP, last pushed May 2026) standardises three server stacks —
Remote Scanner (ephemeral), Tweak Server (anonymous), My Scanner
(personalised) — over the already-deployed blindbit-oracle,
cake-esplora and Frigate indexers. Separately, **BlindBit Oracle v2**
drops filters entirely and streams per-output data; Rob Segers'
benchmark against taproot-only filters is in Optech #422
(2026-09-11).

## Implementations

Status as of September 2026.

- **Sparrow** — send to `sp1` addresses since 2.3.0 (October 2025);
  BIP375 PSBT fields plus DLEQ proof verification for hardware-wallet
  sends in 2.4.0 (February 2026); full **receiving** wallets, incl.
  airgapped signers, in 2.5.0 (May 2026).
- **Frigate** — Sparrow's Silent Payments Electrum server. Scans
  server-side with ephemeral in-RAM client keys, per the "Remote
  Scanner" model of the BIP352 Index Server Specification; optional
  GPU backends. Sparrow 2.5.0 ships `frigate.2140.dev` as a public
  SP-capable server.
- **Cake Wallet** — on-device receiving and scanning, with
  scan-from-height / scan-from-date controls and an automatic switch
  to an SP-capable node while scanning.
- **Wasabi** — send only; SP addresses resolve in the send path,
  no scanning.
- **Nunchuk** — sending, via `silentpayment.hpp` in `libnunchuk`.
- **Electrum** — no upstream support; SP arrives via third-party
  plugins (e.g. `electrum-silent-payments-sender`), not a core
  feature.
- **libsecp256k1** — `silentpayments` module, added upstream in
  v0.8.0 (August 2026). Sending and receiving; requires full
  transaction data (no light-client scanning).
- **bdk_sp** — experimental BIP352 crate (0.2.0, July 2026). The
  `silent-payments-*` crate family (core / send / receive / scan /
  psbt / descriptor) is a separate, also pre-1.0, Rust stack.

**Bitcoin Core has not shipped wallet-level silent payments.** The
original PRs (#28122 "Implement BIP352", #28201 "sending") were closed
unmerged on 2026-05-12 and superseded by #35301 "Implement bip352
(take 2)" and #35302 "Sending (take 2)", both opened 2026-05-16;
#35302 and the older #32966 "Receiving" (opened 2025-07-14) are still
drafts. Core `master` carries the libsecp256k1 `silentpayments`
module via the 2026-07-23 subtree update, but no release up to and
including v31.1 (July 2026) contains it.

Two supporting BIPs are still **Draft** as of September 2026: BIP375
(sending silent payments with PSBTs) and BIP392 (`sp()` output script
descriptors). BIP352 itself is status **Complete**.

Hardware wallets: no longer a blocker for **sending** — BIP375 carries
the SP data in the PSBT and the signer proves its ECDH share with a
DLEQ proof (shipped in Sparrow 2.4.0). Receiving still needs `b_scan`
on a host that can scan; an airgapped signer holds only `b_spend`.

## Compared to BIP47

| Aspect | BIP47 | Silent Payments |
|--------|-------|-----------------|
| Notification tx | Yes (one per pair) | No |
| Per-tx scan cost | Low (only your derivation) | High (every output) |
| Static address | Per-pair | Universal |
| Privacy | Good | Better |
| Standard | BIP47 (assigned 2015), Deployed | BIP352 (assigned 2023), Complete |
| Wallet adoption | Sparrow, Stack | Sparrow, Cake; Wasabi/Nunchuk send |

Adoption row as of September 2026.

## Use cases

- **Charity / donation addresses** publicly posted.
- **Newsletter sponsorship** receivers.
- **Recurring deposits** from many parties.

## Limitations

- **Scan cost** — not trivially Lightning-light-client friendly. In
  practice wallets either lean on a scan/index server (Frigate) or
  accept long on-device scans (Cake Wallet).
- **Hardware wallets** — sending is solved (BIP375 PSBT fields + DLEQ
  proofs, Sparrow 2.4.0); receiving still needs the scan key online.
- **No Bitcoin Core wallet support** — as of September 2026 the BIP352
  wallet PRs are still unmerged; see Implementations.
- **New** — ecosystem still maturing.

## See also

- [bip47-paynyms/SKILL.md](../bip47-paynyms/SKILL.md)
- [stealth/SKILL.md](../stealth/SKILL.md)
- [../wallets/payment-codes/SKILL.md](../../wallets/payment-codes/SKILL.md)
- [../../cryptography/schnorr/SKILL.md](../../cryptography/schnorr/SKILL.md)
