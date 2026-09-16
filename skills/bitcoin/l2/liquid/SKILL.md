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
- Submarine swaps BTC ↔ L-BTC. **Boltz**, long the main public
  provider, is **offline since 2026-08-03**: all mainchain,
  Lightning and Liquid swaps disabled "until further notice", no
  relaunch date announced as of 15 September 2026.
- **Blockstream Swaps** — in-house replacement covering the same
  BTC ↔ L-BTC ↔ Lightning routes (submarine, reverse submarine and
  chain swaps). Limited beta since 10 Aug 2026, "in beta testing
  with select participants"; access by request.

## Compared to other L2s

| Aspect | Liquid | RSK | Stacks |
|--------|--------|-----|--------|
| Trust model | Federation | Merge-mining + federation | PoX (uses BTC) |
| Smart contracts | Limited (Elements opcodes) | EVM-compatible | Clarity |
| Peg | 2-way | 2-way | 1-way (sBTC bidirectional) |
| Privacy | CT default | None | Limited |

## Security: the September 2026 cache-collision exploit

On 6 September 2026 (Liquid block 4,050,336) an attacker
exploited a **cache-key collision in Elements' range-proof
verification cache**. Elements memoises positive range-proof
verifications; a cache hit *is* a positive result, so a key
collision bypasses verification entirely.

Two defects are visible in the Elements history:
- Releases up to and including elements-23.3.3 (13 Apr 2026)
  keyed on `salted_hash(proof || commitment)` only, omitting
  the asset generator and the scriptPubKey.
- The commit binding those in (`212c43f475`, on the
  `elements-23.3.x` branch 3 Sept 2026) concatenated the
  fields without length prefixes, so bytes shift across the
  boundary between the two variable-length fields and distinct
  tuples collide.

Outcome, as of 15 September 2026:
- ~3,998.5 unbacked L-BTC minted and pegged out for ~4,000 BTC
  (~$320M); the federation reserve fell from ~4,200 BTC to
  ~197 BTC (~95% drained).
- **No key compromise.** Per Blockstream's status page the
  funds moved via the SideSwap peg-out authorisation key, "but
  that key was not compromised, nor were any others". The HSMs
  signed because the peg-out was valid under the consensus
  rules they ran — an HSM policy is only as sound as the
  consensus code behind it.
- Bridge nodes disabled 7 Sept 2026; block production resumed
  transaction-free 10 Sept 2026; peg operations (including
  PAK-authorised peg-outs) stayed suspended past that.
- Attackers returned ~3,400 BTC, kept 598.5 BTC (~$47M) as a
  self-declared bounty; Blockstream refused to pay it.

**Minimum safe version: elements-23.3.4** (9 Sept 2026). PR
#1600 "sigcache: harden range proof cache keys and add
-norangeproofcache option" moves both proof caches from raw
`CSHA256` concatenation to `CHashWriter` (length-prefixed
serialisation), adds the missing `vTags` to the
surjection-proof key, and adds `-norangeproofcache` to disable
the range-proof cache without recompiling.

## Limitations

- **Federation trust**: 11-of-15 multisig; large compromise = funds
  loss. Consensus-code bugs are the other systemic risk, and the
  one that actually fired in September 2026 (above).
- **Peg-out gated** for retail users (typically via exchanges).
- **Smaller ecosystem** than EVM L2s.

## See also

- [rgb/SKILL.md](../rgb/SKILL.md)
- [taproot-assets/SKILL.md](../taproot-assets/SKILL.md)
- [statechains/SKILL.md](../statechains/SKILL.md)
- [../../infrastructure/btcpay/SKILL.md](../../infrastructure/btcpay/SKILL.md)
