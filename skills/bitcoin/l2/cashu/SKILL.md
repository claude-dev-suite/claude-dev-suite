---
name: bitcoin-l2-cashu
description: |
  Cashu: single-mint Chaumian e-cash for Bitcoin Lightning. NUTs
  (Notation, Usage, and Terminology specs) define mint protocol,
  payment flow, blind signatures.
  USE WHEN: integrating Cashu mints/wallets, building NUT-compliant
  apps, comparing with Fedimint.
allowed-tools: Read, Grep, Glob
---

# Cashu

Open-source Chaumian e-cash protocol for Bitcoin Lightning. Single
mint operator (vs Fedimint's federated). Specs evolve via **NUTs**
(github.com/cashubtc/nuts).

Mint reference: `cashubtc/nutshell` (Python).

## Architecture

- **Mint**: one entity issuing Cashu notes.
- **Wallet**: holds notes, transacts.
- **Lightning bridge**: mint accepts/sends LN payments.

## Lifecycle

### Mint (deposit BTC → notes)
1. Wallet asks mint for an LN invoice (specifying amount).
2. Wallet pays invoice via LN.
3. Mint signs blinded note(s) for the wallet (blind signing).
4. Wallet now holds notes, has anonymity within mint.

### Spend (intra-mint payment)
1. Wallet A sends notes to Wallet B (any transport: NFC, QR, Nostr,
   email).
2. Wallet B presents notes to mint, receives fresh notes (swap).
3. Note serial numbers added to spent set; can't be spent again.

### Melt (notes → LN)
1. Wallet asks mint to pay an LN invoice using its notes.
2. Mint pays invoice; consumes notes.

## NUTs (specs)

Modular spec evolution. As of September 2026 the spec repo defines
NUT-00 through NUT-30, split into a mandatory core and optional
extensions each mint advertises under its number in the NUT-06 `nuts`
capability map.

Mandatory — wallets and mints MUST implement all of NUT-00 to NUT-06:
- **NUT-00** — cryptography and models (BDHKE, proofs, token encoding).
- **NUT-01** — mint public keys.
- **NUT-02** — keysets and fees.
- **NUT-03** — swap (split/combine notes).
- **NUT-04** — mint tokens (generic quote flow, method-agnostic).
- **NUT-05** — melt tokens (generic quote flow, method-agnostic).
- **NUT-06** — mint info endpoint.

Optional (NUT-07 to NUT-30), selected:
- **NUT-07** — token state check.
- **NUT-08** — overpaid Lightning fee return.
- **NUT-09** — signature restore (recover proofs from seed).
- **NUT-10** — spending conditions (well-known `secret` format).
- **NUT-11** — P2PK locked tokens.
- **NUT-12** — DLEQ proofs.
- **NUT-13** — deterministic secrets (BIP32-style derivation).
- **NUT-14** — HTLC notes.
- **NUT-15** — partial multi-path payments (MPP).
- **NUT-17** — WebSocket subscriptions.
- **NUT-18** — payment requests (`creqA`).
- **NUT-19** — cached responses (safe request replay).
- **NUT-20** — signature on mint quote.
- **NUT-21** / **NUT-22** — clear and blind mint authentication.
- **NUT-23** / **NUT-25** / **NUT-30** — payment methods: BOLT11,
  BOLT12, on-chain.
- **NUT-26** — payment request Bech32m encoding (`creqb1...`).
- **NUT-28** — pay-to-blinded-key (P2BK).
- **NUT-29** — batched minting.

Full index plus the per-wallet/per-mint support matrix lives in the
cashubtc/nuts README.

## Privacy

- Within-mint: blind signatures hide deposit-to-withdrawal mapping.
- Across mints: no privacy gain (each mint sees its own ledger).
- LN gateway sees source/destination of LN payments.

## Trust model

**Single-mint trust**:
- Mint operator can refuse to redeem (rugpull).
- Mint operator can refuse to honor melts.
- Users mitigate by keeping balances small / transient.

Compare to Fedimint's threshold trust — Cashu is simpler but more
custodial-feeling.

## Implementations

- **nutshell** (Python) — reference mint.
- **cashu-ts** — TypeScript wallet/mint.
- **cdk** — Cashu Development Kit (Rust); ships `cdk-mintd` as its
  mint binary. (`cashubtc/cashu-rs` no longer exists as of September
  2026.)
- **nutmix** (Go) — `lescuer97/nutmix`, mint; v0.7.0 (August 2026).
- **cashu.me** — web wallet.
- **Minibits** — mobile wallet.
- **eNuts** — mobile wallet (cross-platform).
- **Macadamia** — iOS-focused.
- **Sovran** — mobile wallet (Expo/React Native), Cashu + Nostr.

nutmix and Sovran are both listed in the cashubtc/nuts README support
matrix as of September 2026.

## Use cases

- **Spam-resistance** for Nostr (zaps via Cashu).
- **Micro-payments** with no LN-channel overhead.
- **Privacy-mode** for service users.
- **Streaming sats** for content.

## Lightning Address integration

Cashu mints often expose Lightning Addresses:
```
user@minturl.com → LNURL-pay → mint generates note for user
```

## Payment requests

NUT-18 encodes a payment request as `"creq" + "A" +
base64_urlsafe(CBOR(req))`. NUT-26 adds a smaller TLV + Bech32m form
with HRP `creqb` and version separator `1`; wallets decode both.

A NUT-26 request can be carried inside a BIP-321 Bitcoin URI as a `creq`
query parameter, so a single QR code can offer Lightning and Cashu side
by side and the payer's wallet picks the rail it supports:
```
bitcoin:?lightning=lnbc...&creq=CREQB1...
```

NUT-24 reuses the same two encodings in an `X-Cashu` header on an HTTP
402 Payment Required response.

## Compared to Fedimint

| Aspect | Cashu | Fedimint |
|--------|-------|----------|
| Trust | Single mint | Federated multisig |
| Setup | Trivial (run one mint) | Multi-guardian setup |
| Privacy within mint | Yes (blind sigs) | Yes |
| Cross-mint atomic swaps | Possible | Possible (by design) |
| Mobile wallets | Many | Fedi (primary) |

## Status

Beta production. Active development; new NUTs added regularly — the
spec repo had reached NUT-30 (payment method: on-chain) by September
2026. Multiple mints in use globally (some open, some private).

## See also

- [fedimint/SKILL.md](../fedimint/SKILL.md)
- [../../lightning/lsp/SKILL.md](../../lightning/lsp/SKILL.md)
- [../../privacy/coinjoin/SKILL.md](../../privacy/coinjoin/SKILL.md)
