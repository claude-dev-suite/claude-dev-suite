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

Modular spec evolution:
- **NUT-00 to NUT-04** — baseline mint, melt, swap, mint info.
- **NUT-05** — melting (pay LN with notes).
- **NUT-06** — mint info endpoint.
- **NUT-07** — token state check.
- **NUT-09** — restoring tokens from seed.
- **NUT-10** — spending conditions (P2PK, htlc).
- **NUT-11** — P2PK locked tokens.
- **NUT-12** — DLEQ proofs.
- **NUT-13** — MPP.
- ... (active development).

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
- **cashu-rs** — Rust impl.
- **cashu.me** — web wallet.
- **Minibits** — mobile wallet.
- **eNuts** — mobile wallet (cross-platform).
- **Macadamia** — iOS-focused.

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

## Compared to Fedimint

| Aspect | Cashu | Fedimint |
|--------|-------|----------|
| Trust | Single mint | Federated multisig |
| Setup | Trivial (run one mint) | Multi-guardian setup |
| Privacy within mint | Yes (blind sigs) | Yes |
| Cross-mint atomic swaps | Possible | Possible (by design) |
| Mobile wallets | Many | Fedi (primary) |

## Status

Beta production. Active development; new NUTs added regularly.
Multiple mints in use globally (some open, some private).

## See also

- [fedimint/SKILL.md](../fedimint/SKILL.md)
- [../../lightning/lsp/SKILL.md](../../lightning/lsp/SKILL.md)
- [../../privacy/coinjoin/SKILL.md](../../privacy/coinjoin/SKILL.md)
