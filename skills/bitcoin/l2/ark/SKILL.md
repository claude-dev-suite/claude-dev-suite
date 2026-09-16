---
name: bitcoin-l2-ark
description: |
  Ark protocol: VTXOs (Virtual Transaction Outputs) batched off-chain
  with periodic on-chain settlement. ARKADE (Ark Labs) is the first
  mainnet implementation. ASP (Ark Service Provider) coordinates
  rounds; users keep unilateral exit.
  USE WHEN: building Ark integrations, evaluating Ark vs Lightning,
  designing batched payment flows.
allowed-tools: Read, Grep, Glob
---

# Ark Protocol

Original concept: Burak (2023, posted to bitcoin-dev as `TBDXXX`).
First implementation on mainnet: **ARKADE** (Ark Labs) — first mainnet
payments August 2025, public mainnet beta since October 2025. The
reference impl `bark` (Second) reached mainnet on 9 June 2026.

Ark virtualizes Bitcoin's UTXO layer into VTXOs (Virtual Transaction
Outputs) that are batched and settled periodically on chain.

## Mechanism

### Round-based architecture

- An **ASP** (Ark Service Provider) runs periodic rounds (e.g., every
  few minutes / hours).
- In the original round-based design, users send and receive funds via
  VTXOs during each round. Deployments have since moved payments out
  of the round — `bark` sends arkoor (out-of-round) transactions,
  ARKADE preconfirms VTXOs — so as of September 2026 rounds and
  batches carry refreshes and on-chain settlement, not payments
  (Second docs: "Early Ark protocol proposals included payments within
  rounds, but this is no longer the case").
- At round end, ASP commits the round state on chain via a single
  pool tx.
- Each user's VTXO is included in the pool tx as part of a Merkle/
  binary tree structure.

### VTXOs

A VTXO is a "virtual" output:
- Represented as a leaf in the round's tree.
- Spendable off-chain by sending it to another VTXO via ASP-mediated
  protocol.
- Has a CSV expiry: after the expiry, owner can unilaterally claim
  on chain via the round's commitment tx.

### Unilateral exit

Even if ASP disappears:
- User can broadcast a chain of pre-signed txs to extract their
  VTXO from the round tree.
- Cost: linear in tree depth (typically log N).
- Time: limited by CSV expiry (typically days to weeks).

## Covenant-less Ark (clArk) and the CTV dependency

Every Ark deployment running on Bitcoin today is **covenant-less Ark
(clArk)**. Bitcoin has no covenant opcode, so a pool-tx output cannot
commit to the VTXO tree beneath it. Instead the tree is assembled from
**pre-signed transactions** — what the Ark docs call a
"pseudo-covenant" — which every affected participant must cosign while
the round is open.

That substitution, not implementation immaturity, is the root cause of
Ark's interactivity:

- All cosigners must be **online during the round**; a dropout stalls
  or restarts the cosigning ceremony.
- The tree shape is fixed before signing starts, so intents cannot
  join after the nonce ceremony has begun.
- Holders must **refresh** VTXOs before expiry, so even an idle
  balance costs recurring interactivity.

An introspection primitive — `OP_CHECKTEMPLATEVERIFY` (BIP 119),
`TXHASH`, or the taproot-native `OP_TEMPLATEHASH` variant — would let
a single output commit to the pre-agreed tree directly, removing the
round-time n-of-n pre-signing ceremony (VTXO expiry and refresh would
remain). Bitcoin Optech frames the gain as supporting significantly
more users and achieving greater fee efficiency.

The introspection opcode is what removes the round-time ceremony. CSFS
addresses a different half of the problem: Roose and De Smedt's
"Evolving the Ark protocol using CTV and CSFS" (Delving Bitcoin,
15 April 2025) combines the two into "rebindable signatures", letting
a user pre-sign future refreshes so the server can refresh a VTXO
perpetually without the user ever coming online. Ark is one of the
headline applications argued over in the activation debate (Bitcoin
Optech, 2025-04-04, "Benefit of CTV to Ark users").

As of September 2026 none of these opcodes is active on Bitcoin
mainnet. Steven Roose demonstrated `bark` running against
`OP_TEMPLATEHASH` on signet in August 2026 (Bitcoin Optech,
2026-08-21).

See [../../protocol/proposals/SKILL.md](../../protocol/proposals/SKILL.md)
for the activation state of CTV and CSFS.

## ARKADE features

Ark Labs' mainnet implementation:
- VTXO batches via taproot trees.
- Round time: ~5 seconds.
- ASP-coordinated cosigning protocol.
- Native BTC support; **Arkade Assets** for tokenized assets.
- V-PACK: stateless VTXO verification standard.

## Bark (Second's impl)

Open source (MIT), Rust. **On Bitcoin mainnet since 9 June 2026**;
before that it ran on signet/testnet only.

- Wallet client for Ark, plus an ASP server reference.
- Public Ark server operated by Second, with mainnet and signet
  endpoints.
- Bark SDK with bindings for Kotlin, Swift, React Native, Flutter, Go,
  Python and web (WebAssembly).
- `barkd`: standalone wallet daemon exposing a REST interface with an
  OpenAPI spec.
- Packaged as an Umbrel app (June 2026) and a Start9 service (July
  2026); BTCPay Server plugin for self-custodial Lightning receive
  without opening channels.
- **Not interoperable with ARKADE.** Since v0.3.0 (26 June 2026)
  `bark` parses an Arkade address only to reject it with "Ark address
  is for different server"; the two implementations have diverged
  (Second moved payments out of rounds entirely). Earlier docs here
  claimed ARKADE protocol compatibility; that is no longer true.
- Release line as of September 2026: **v0.7.1 (11 September 2026)**.
  v0.5.0 (4 August 2026) added restoring a wallet's full off-chain
  VTXO balance from its mnemonic, and Lightning receives claimable to
  another wallet's Ark address (enabling non-custodial
  Lightning-address servers).
- Repo: https://gitlab.com/ark-bitcoin/bark (upstream — the README
  points issues and tags there), mirrored at
  https://codeberg.org/ark-bitcoin/bark and
  https://github.com/ark-bitcoin/bark. The old
  `codeberg.org/ark-network/bark` URL is dead.

## Compared to Lightning

| Aspect | Lightning | Ark |
|--------|-----------|-----|
| Liquidity setup | Channel funding | None per user |
| Receiver inbound | Need pre-existing channel | None needed |
| Aggregator | n/a (peer-to-peer) | ASP (1 per round) |
| Settlement | Off-chain instant | Off-chain instant (arkoor / preconfirmed VTXO) |
| On-chain batching | Channel open/close | Per round; interval is server policy (Second: hourly, September 2026) |
| Exit cost | Channel close (~1 tx + per-HTLC) | Tree extraction (~log N txs) |
| Protocol type | Per-channel | Batched |
| Asset support | Optional (TAP, RGB layered) | Native (Arkade Assets) |

## Use cases

- **Receive without channel** — user gets their first sats without
  pre-funded inbound.
- **High-frequency micro-payments** — payments settle off-chain with
  no on-chain cost each; any Ark payment fee is server policy, not
  fixed by the protocol (Second docs, September 2026).
- **Mobile-first** — out-of-round payments give offline receive, so no
  always-online wallet is needed (Second docs, September 2026).
- **Asset issuance** via Arkade Assets.

## Status (September 2026)

- **ARKADE**: mainnet public beta. First mainnet payments August 2025
  (Baltic Honeybadger); opened publicly October 2025. Ark Labs raised
  $5.2M in March 2026, backed by Tether with Ego Death Capital, Epoch VC
  and Anchorage Digital.
- **bark** (Second): on Bitcoin mainnet since 9 June 2026; release line
  v0.7.x as of September 2026.
- ARKADE integrations: Lendaswap by Lendasat/Satora (November 2025),
  Hodl Hodl escrow (May 2026), Bitrefill gift cards (June 2026).
- Bark integrations: Noah and Arké wallets plus Satsigner (June 2026),
  Alby Hub (June 2026), Umbrel and Start9 packages.
- Neither CTV nor CSFS is active on mainnet, so both deployments are
  covenant-less Ark (see above).
- Active competing model with Spark, Lightning.

## Limitations / trade-offs

- **Round delay**: as of September 2026 neither deployment makes the
  payer wait for a round — `bark` sends arkoor (out-of-round)
  transactions and ARKADE preconfirms in its Virtual Mempool — so the
  delay lands on refreshes and on reaching Bitcoin finality, not on
  the payment.
- **Preconfirmation trust**: an instant payment is only operator-
  cosigned. Until the receiver refreshes (`bark`) or settles into a
  batch (ARKADE), they trust that sender and server do not collude to
  double-spend; only the on-chain round/batch restores the full
  unilateral-exit guarantee.
- **ASP availability**: ASP outage = unilateral-exit window.
- **Tree depth scaling**: log N exit cost; balanced trees keep
  this acceptable.
- **Privacy**: ASP sees all VTXO transfers in plaintext (compared
  to LN's onion routing).

## See also

- [spark/SKILL.md](../spark/SKILL.md)
- [statechains/SKILL.md](../statechains/SKILL.md)
- [taproot-assets/SKILL.md](../taproot-assets/SKILL.md)
- [../../protocol/proposals/SKILL.md](../../protocol/proposals/SKILL.md)
