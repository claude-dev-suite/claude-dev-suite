---
name: bitcoin-l2-liquid
description: |
  Liquid Network: federated sidechain by Blockstream. Confidential
  Transactions, asset issuance (LBTC, USDt-Liquid, others), 2-min
  blocks, n-of-m federation peg-out. Elements codebase.
  USE WHEN: building on Liquid, peg-in/peg-out integrations,
  designing CT-based privacy.
allowed-tools: Read, Grep, Glob
---

# Liquid Network

Liquid is a federated sidechain pegged to Bitcoin, developed by
Blockstream. Funds are locked on Bitcoin via federation multisig and
unlocked on Liquid as L-BTC.

Codebase: **Elements** (`github.com/ElementsProject/elements`), a
Bitcoin Core fork with extensions.

## Architecture

- **Federation**: ~15 functionaries (Blockstream + partners).
- **Block production**: round-robin among functionaries.
- **2-minute target block time**.
- **Peg-in**: send BTC to federation multisig → equivalent L-BTC
  appears on Liquid after 102 confirmations.
- **Peg-out**: send L-BTC to federation → BTC released on Bitcoin
  after withdrawal queue.

## Confidential Transactions

Liquid implements **Confidential Transactions** (CT):
- Output amounts are hidden via Pedersen commitments.
- Range proofs prove amount ≥ 0 and within valid range.
- Asset IDs also blinded (via blinded amounts + blinded asset
  commitments).
- Public key recipients can compute shared blinding factor and see
  the amount.

## Issued Assets (IA)

Beyond L-BTC, Liquid supports:
- **L-USDt** (Tether on Liquid).
- **L-CAD**, **L-EUR**, **L-CNY** (some jurisdiction-specific).
- Custom asset issuance: anyone with funds can issue an asset.

Issuance specifies:
- Total supply (or issuance ongoing via reissuance tokens).
- Asset metadata (description, contract hash).
- Asset ID = hash of issuance tx + entropy.

## Peg-in / Peg-out

### Peg-in (BTC → L-BTC)
1. User sends BTC to federation multisig with claim script.
2. Wait 102 confirmations on Bitcoin.
3. User submits claim on Liquid; L-BTC issued.

### Peg-out (L-BTC → BTC)
1. User submits L-BTC to federation address on Liquid.
2. Federation processes withdrawal queue.
3. BTC released to user's specified address on Bitcoin.

Peg-out is **whitelist-based** (regulated; Liquid-Pro members can
peg out; retail users typically use exchanges for peg-out).

## Implementation

- **elementsd** — full node (similar to bitcoind).
- **liquid-network/elements** — codebase, builds on Bitcoin Core.
- Wallets:
  - **Blockstream Green** — mobile wallet with Liquid support.
  - **Sparrow** — desktop, Liquid support.
  - **Aqua** — multi-asset Liquid wallet.

## Use cases

- **Stablecoin payments** with privacy (L-USDt).
- **Faster settlement** between Liquid-aware exchanges (2 min vs
  60 min).
- **Asset issuance**: STOs, regulated tokens, gift cards.
- **Confidential commercial flows**: amounts hidden from
  competitors.

## Federation governance

- Functionaries hold multisig keys.
- Block-signing rotation among them.
- Transparent membership; replacements are governance events.

## Lightning on Liquid

Liquid has Lightning compatibility:
- **Lightning on Liquid** (LBTC channels).
- Submarine swaps BTC ↔ L-BTC via Boltz, others.

## Compared to other L2s

| Aspect | Liquid | RSK | Stacks |
|--------|--------|-----|--------|
| Trust model | Federation | Merge-mining + federation | PoX (uses BTC) |
| Smart contracts | Limited (Elements opcodes) | EVM-compatible | Clarity |
| Peg | 2-way | 2-way | 1-way (sBTC bidirectional) |
| Privacy | CT default | None | Limited |

## Limitations

- **Federation trust**: 11-of-15 multisig; large compromise = funds
  loss.
- **Peg-out gated** for retail users (typically via exchanges).
- **Smaller ecosystem** than EVM L2s.

## See also

- [rgb/SKILL.md](../rgb/SKILL.md)
- [taproot-assets/SKILL.md](../taproot-assets/SKILL.md)
- [statechains/SKILL.md](../statechains/SKILL.md)
- [../../infrastructure/btcpay/SKILL.md](../../infrastructure/btcpay/SKILL.md)
