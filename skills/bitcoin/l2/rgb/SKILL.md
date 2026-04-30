---
name: bitcoin-l2-rgb
description: |
  RGB protocol: client-side validated smart contracts on Bitcoin +
  Lightning. Schema-driven contracts, AluVM (RGB VM), rgb-lightning-node
  for LN integration. USDT-on-RGB rollout.
  USE WHEN: building RGB contracts, integrating RGB Lightning,
  comparing with TAP.
allowed-tools: Read, Grep, Glob
---

# RGB Protocol

RGB is a system of **client-side validated** smart contracts on
Bitcoin and Lightning. Maintained by **LNP/BP Standards Association**
+ **RGB Consortium**.

Repos:
- `github.com/RGB-WG` — main RGB working group.
- `github.com/RGB-Tools/rgb-lightning-node` — LN integration.

## Concepts

### Client-side validation

RGB contracts don't put state on Bitcoin's chain. Instead:
- Contracts publish **schema** + **state transitions**.
- Owners hold cryptographic proofs of their balances.
- Bitcoin txs commit to RGB state via Taproot tweaks (anchor commits).
- Verification: walk the proof chain back to issuance.

### Schemas

RGB schemas define contract types:
- **Fungible asset** (RGB20).
- **Non-fungible token** (RGB21).
- **Custom** (e.g., medical records, supply chain) via AluVM scripts.

### AluVM

RGB's virtual machine for contract logic:
- Stack-based.
- Register-machine with strict resource limits.
- Smart contract code runs **client-side** during validation.

## RGB Lightning Network (RLN)

`rgb-lightning-node` (RLN node) is an RGB-enabled LN node:
- Lightning channels can carry RGB assets.
- Each commitment tx has an extra output anchoring the RGB state
  transition.
- Asset transfers via standard Lightning HTLCs with RGB-asset
  metadata.

## Recent (2026)

- **March 2026 update**: refactored payment logic, BOLT12 integration,
  resource-oriented architecture.
- **Desktop client** for RGB Assets launched March 2026 (first
  product-ready RGB asset desktop app).

### Bitlight Labs

Major contributor; runs testing infrastructure for RGB Lightning.

### USDT on RGB

Tether announced (August 2025) intent to issue USDT natively on
RGB-compatible Lightning. Rollout in progress.

## Compared to Taproot Assets

| Aspect | RGB | Taproot Assets |
|--------|-----|----------------|
| Backing | LNP/BP Association | Lightning Labs |
| Smart contracts | Yes (AluVM) | Limited |
| LN integration | rgb-lightning-node | tapd + LND |
| Schema | Multiple (RGB20, RGB21, custom) | Single asset model |
| Maturity | Beta production (March 2026) | v0.7 production |
| Wallets | Limited | Wider (LN Terminal, etc.) |

## Use cases

- **Stablecoins** (USDT on RGB).
- **Custom smart contracts** for regulated assets, NFTs, supply
  chain tokens.
- **Programmable money** with privacy by default (validation is
  client-side; on-chain only sees Taproot commitments).

## Architecture

```
[User wallet]
  - Holds RGB state proofs locally.
  - Commits state to Bitcoin via Taproot anchor.
[Counterparty wallet]
  - Receives state transition + proof.
  - Validates client-side back to genesis.
```

Privacy: chain analyst sees only Taproot outputs, not asset amounts
or recipients.

## Implementations

- **rgb-core** — Rust core libraries.
- **rgb-cli** — command-line tooling.
- **rgb-lightning-node** — modified LDK with RGB anchor support.
- **rgb-lightning-sample** — example apps.

## Common bugs

- Lost state proof = lost assets (unrecoverable, no on-chain
  history).
- LN state desync between channel updates → RGB commitment mismatch.
- AluVM contract bugs → logic errors hard to detect post-issuance.
- Wallet incompatibilities (different RGB schema versions).

## Status (late 2025 / 2026)

- Production RGB Lightning beta.
- USDT-on-RGB rollout.
- Wallet ecosystem expanding (RGB Tools, BitMask, others).

## See also

- [taproot-assets/SKILL.md](../taproot-assets/SKILL.md)
- [liquid/SKILL.md](../liquid/SKILL.md)
- [../../lightning/ldk/SKILL.md](../../lightning/ldk/SKILL.md)
- [../../protocol/taproot/SKILL.md](../../protocol/taproot/SKILL.md)
