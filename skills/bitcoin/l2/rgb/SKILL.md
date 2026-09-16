---
name: bitcoin-l2-rgb
description: |
  RGB protocol: client-side validated smart contracts on Bitcoin +
  Lightning. v0.12 consensus (zk-AluVM, issuers), the diverging
  v0.11.1 line, rgb-lightning-node for LN integration.
  USDT-on-RGB rollout.
  USE WHEN: building RGB contracts, integrating RGB Lightning,
  comparing with TAP.
allowed-tools: Read, Grep, Glob
---

# RGB Protocol

RGB is a system of **client-side validated** smart contracts on
Bitcoin and Lightning. Maintained by **LNP/BP Standards Association**
+ **RGB Consortium**.

Repos:
- `github.com/RGB-WG` — main RGB working group (v0.12 line).
- `github.com/rgb-protocol` — diverging v0.11.1 line (see below).
- `github.com/RGB-Tools/rgb-lightning-node` — LN integration.

## Two diverging lines (as of September 2026)

Read this before anything else — the ecosystem forked in mid-2025 and
"RGB" now names two incompatible protocols.

| Aspect | RGB-WG v0.12 | v0.11.1 line |
|--------|--------------|--------------|
| Org | `RGB-WG` (LNP/BP) | `rgb-protocol` |
| Site | rgb.tech | rgb.info |
| Newest | rgb-core `v0.12.0`, 10 Jul 2025 | `0.11.1-rc.11`, 15 Jul 2026 |
| VM | zk-AluVM (40 instructions) | classic AluVM (`rgb-aluvm`) |
| Contract defs | issuers + contract API | schemata (`rgb-schemas`) |
| Fungible state | finite-field elements | revealed `u64` amounts |
| Used by | rgb CLI, rgb-std | `rgb-lib`, `rgb-lightning-node` |

- RGB-WG shipped the **final v0.12 consensus layer** on 10 July 2025
  (`rgb-core` 0.12.0). Consensus is frozen; contracts issued against it
  are forward-compatible. The standard library and CLI above it are
  still at `v0.12.0-rc.3` (15 July 2025) — no final tag as of
  September 2026.
- RGB-WG published a security notice on 18 July 2025 stating that
  v0.11.1 is a fork of unreleased v0.11 code with "nearly absent" unit
  test coverage and removed smart-contracting capability, and that "the
  only version recommended by us for the production is v0.12".
- The v0.11.1 line is nevertheless the one **actually shipping in
  Lightning**: `rgb-lib` 0.3.0-beta.7 (17 July 2026) pins
  `rgb-ops`, `rgb-invoicing` and `rgb-schemas` at `=0.11.1-rc.11`, and
  `rgb-lightning-node` builds on that `rgb-lib`. Its repos
  (`rgb-consensus`, `rgb-aluvm`, `rgb-tests`) were still being pushed
  in September 2026.
- Contracts issued with pre-v0.12 RGB-WG releases are **not**
  compatible with v0.12; RGB-WG recommends re-issuing them.

## Concepts

### Client-side validation

RGB contracts don't put state on Bitcoin's chain. Instead:
- Contracts publish a contract definition + **state transitions**
  (a schema on the v0.11.1 line; an issuer in v0.12).
- Owners hold cryptographic proofs of their balances.
- Bitcoin txs commit to RGB state via single-use seals. v0.12 unified
  the previously separate *tapret* (Taproot-tweak) and *opret*
  (`OP_RETURN`) seal types into one, keeping an `OP_RETURN` fallback
  for wallets that cannot use Taproot.
- Verification: walk the proof chain back to issuance. In v0.12
  consignments are streamed and validated on the go instead of being
  loaded into memory.

### Contract definitions: schemata (v0.11.1) vs issuers (v0.12)

The v0.11.1 line keeps the classic **schema** model. `rgb-schemas`
ships, as of `0.11.1-rc.11` (July 2026):
- **NIA** — non-inflatable fungible asset.
- **UDA** — unique digital asset (single-token NFT with attachment).
- **CFA** — collectible fungible asset.
- **PFA** / **IFA** — permissioned and inflatable fungible assets,
  both marked *not production-ready* in the repo.
- **Custom** schemas (e.g. medical records, supply chain) written
  against AluVM by the issuer.

RGB v0.12 **removed schemata from the wallet-facing model**. Per the
10 July 2025 release post, instead of importing schemata, interfaces
and other components, wallets consume *issuers* published by contract
developers plus a contract *API* — "a simple non-generic object
explaining to a wallet how to operate with a contract". Interfaces
survive only inside the **Contractum** language, whose compiler emits
those contract APIs.

### AluVM / zk-AluVM

v0.11.1 line — classic **AluVM** (`rgb-protocol/rgb-aluvm`):
- Register-machine with strict resource limits.
- Smart contract code runs **client-side** during validation.

v0.12 — **zk-AluVM**, introduced in the 10 July 2025 consensus release:
- Turing-complete zk-VM built for client-side validation.
- Non-von-Neumann architecture, **40 instructions**.
- **Read-once memory**, matching single-use seal semantics.
- Contract state unified into **finite-field elements**; the three
  state variants of RGB-WG's pre-v0.12 design (fungible via Pedersen
  commitments + Bulletproofs, structured non-fungible, binary
  attachments) are gone. The v0.11.1 fork's shipping code never had
  them: its `FungibleState` is a revealed `u64` (`Bits64`).
- Pedersen commitments and Bulletproofs removed — zk-STARKs replace
  them (Bulletproofs were never implemented for secp256k1).
- Consensus validation reduced to a few hundred lines expressible as
  an arithmetic circuit, which is what enables **recursive history
  compression** by a zk prover.

## RGB Lightning Network (RLN)

`rgb-lightning-node` (RLN node) is an RGB-enabled LN node:
- Lightning channels can carry RGB assets.
- Each commitment tx has an extra output anchoring the RGB state
  transition.
- Asset transfers via standard Lightning HTLCs with RGB-asset
  metadata.

## Recent (2025–2026)

- **RGB v0.12 consensus release**, 10 July 2025 — see above. No newer
  RGB-WG consensus release as of September 2026.
- **Fork security notice**, 18 July 2025 — RGB-WG disavows v0.11.1.
- `rgb-lightning-node` has **no tagged releases**; development happens
  on `master` (head commit 26 August 2026). It vendors rust-lightning
  0.2.x and declares `rgb-lib` `=0.3.0-beta.7`, but a
  `[patch.crates-io]` entry redirects it to `rgb-lib` git `master`, so
  the build is not actually pinned to that version.
- RLN work that landed in 2026: zero-amount RGB payments, payment
  preimages exposed in the payment APIs, `push_asset_amount` on
  channel open, and IFA support (all March 2026); BOLT11
  `description` / `description_hash` on the invoice APIs and an
  optional-`bitcoind` chain backend via `lightning-transaction-sync`
  (August 2026). No BOLT12 / offers support has landed.
- **Desktop wallet**: `RGB-Tools/iris-wallet-desktop`, newest tagged
  release `0.2.0` (17 April 2025); repo last pushed 3 March 2026.

### Bitlight Labs

Major contributor; runs testing infrastructure for RGB Lightning.

### USDT on RGB

Tether announced on 28 August 2025 its intent to launch USDT on RGB,
citing the v0.11.1 mainnet release. **UTEXO** leads the commercial
rollout, on that same v0.11.1 line. Public milestones since:
- UTEXO shipped an on-chain RGB module for Tether's Wallet Development
  Kit (February 2026) and an RGB **Lightning** module for the same WDK
  (28 August 2026); the Lightning module is still beta.
- UniSat named as the next USDT-on-Bitcoin wallet partner
  (4 September 2026) — send / receive / swap described as "coming",
  no release date.

No public mainnet USDT-on-RGB launch announcement had appeared as of
mid-September 2026.

## Compared to Taproot Assets

| Aspect | RGB | Taproot Assets |
|--------|-----|----------------|
| Backing | LNP/BP Association | Lightning Labs |
| Smart contracts | Yes (zk-AluVM in v0.12) | Limited |
| LN integration | rgb-lightning-node | tapd + LND |
| Contract types | Schemata (NIA/UDA/CFA) or v0.12 issuers | Single asset model |
| Maturity | v0.12 consensus frozen Jul 2025, std lib still rc | v0.8.3 production (Sept 2026) |
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

- **rgb-core** — RGB-WG consensus layer (`v0.12.0`, 10 Jul 2025).
- **rgb-std** / **rgb** — RGB-WG standard library and CLI
  (`v0.12.0-rc.3`, 15 Jul 2025).
- **rgb-consensus** / **rgb-ops** / **rgb-schemas** — the
  `rgb-protocol` v0.11.1 line (`0.11.1-rc.11`, 15 Jul 2026).
- **rgb-lib** — RGB-Tools wallet library on the v0.11.1 line
  (`0.3.0-beta.7`, 17 Jul 2026).
- **rgb-lightning-node** — modified LDK with RGB anchor support.
- **rgb-lightning-sample** — example apps.

## Common bugs

- Lost state proof = lost assets (unrecoverable, no on-chain
  history).
- LN state desync between channel updates → RGB commitment mismatch.
- AluVM / zk-AluVM contract bugs → logic errors hard to detect
  post-issuance.
- Wallet incompatibilities: a v0.12 wallet cannot read contracts
  issued on the v0.11.1 line, or with pre-v0.12 RGB-WG releases.

## Status (September 2026)

- Two incompatible lines in parallel: RGB-WG v0.12 (consensus final
  since 10 July 2025, std lib and CLI still at rc.3) and the
  `rgb-protocol` v0.11.1 line (`0.11.1-rc.11`, July 2026).
- RGB Lightning (`rgb-lightning-node`) ships on the v0.11.1 line and
  has no tagged release; master's head commit is 26 August 2026.
- USDT-on-RGB (announced August 2025, UTEXO-led): still pre-launch —
  no mainnet launch announcement as of September 2026.
- Wallet ecosystem expanding (RGB Tools, BitMask, others).

## See also

- [taproot-assets/SKILL.md](../taproot-assets/SKILL.md)
- [liquid/SKILL.md](../liquid/SKILL.md)
- [../../lightning/ldk/SKILL.md](../../lightning/ldk/SKILL.md)
- [../../protocol/taproot/SKILL.md](../../protocol/taproot/SKILL.md)
