---
name: bitcoin-proposals
description: |
  Soft-fork proposals NOT activated on mainnet: consensus cleanup
  (BIP54), CTV (BIP119), the BIP448 rebindable-transaction bundle
  (BIP446/348/349), APO/APOAS (BIP118), OP_CHECKCONTRACTVERIFY
  (BIP443), OP_CAT (BIP347), the 2026 script/covenant BIP cluster
  (BIP440-443, 446, 448, 449), post-quantum proposals (BIP360/361),
  drivechains (BIP300/301), spacechains, CISA. Status, mechanics,
  controversy per proposal.
  USE WHEN: discussing covenants, evaluating L2 design that depends on
  unactivated opcodes, understanding the soft-fork pipeline.
allowed-tools: Read, Grep, Glob
---

# Bitcoin Soft-Fork Proposals

These are **not consensus-active on mainnet**. Some are deployed on
signet (custom signets) or testnet for experimentation. Be explicit
when reasoning: never present these as "Bitcoin" features without
naming the proposal status.

Statuses below are as of **September 2026** and cite the BIPs repo
index, which moved to BIP-3 status semantics (Draft / Complete /
Deployed / Closed). "Complete" means the authors finished the spec
and recommend adoption; it does **not** mean activated.

## BIP54 - Consensus Cleanup

The most advanced soft-fork proposal in the pipeline, and the only
non-covenant one here. Authors Antoine Poinsot and Matt Corallo;
assigned 2025-04-11; **Status: Complete** since version 1.0.0
(2026-05-22). Four narrow restrictions on 2009-era defects:

| Defect | New rule |
|--------|----------|
| Timewarp (off-by-one at retarget) | Timestamp floors at period edges |
| Worst-case block validation time | Legacy sigop cap of **2500** per tx |
| Merkle-tree ambiguity | **64-byte** transactions invalid |
| Duplicate txids / BIP30 | Coinbase `nLockTime` commits to height |

- **Timewarp**: for `N % 2016 == 0`, T_N >= T_{N-1} - 7200; for
  `N % 2016 == 2015`, T_N >= T_{N-2015} (the Murch-Zawy clause).
- **Sigops**: legacy `CHECKSIG`/`CHECKMULTISIG` counted over scriptSig
  + prevout scriptPubKey + P2SH redeemScript with BIP16 accounting;
  coinbase exempt.
- **64 bytes**: the *witness-stripped* serialized size, exactly 64.
  Split out as its own spec, BIP53 (Draft).
- **Coinbase**: `nLockTime` must equal block height minus 1 and
  `nSequence` must not be 0xffffffff.

All four tighten rules only, so the soft fork is backward-compatible
with non-upgraded nodes.

**Already shipped as policy, not consensus:**
- Bitcoin Core 30.0: "the maximum number of potentially executed
  legacy signature operations in a single standard transaction is now
  limited to 2500" (PR #32521), explicitly "to prepare for a possible
  BIP54 deployment".
- Bitcoin Core 0.16.1 and later already refuse to relay or template
  64-byte witness-stripped transactions.
- Bitcoin Core 29.0 and later will not template a block violating the
  new timestamp rules; PR #35949 (merged 2026-09-07) extended
  `getblocktemplate` to adjust both `mintime` and `curtime` for the
  Murch-Zawy end-of-period rule, on **all** networks. Consensus
  validation is unchanged.

**Status (September 2026)**: spec Complete, no activation parameters
chosen. Core PR #35793 "Implement BIP 54 (Consensus Cleanup) without
mainnet activation" is open and unmerged. Bitcoin Inquisition carries
an implementation for signet (Optech, 2026-02-13); a slow-block
demonstration ran on signet (Optech, 2026-05-01); a draft BIP would
activate BIP54 from block 1 on testnet5 (Optech, 2026-06-12).

**Pool readiness**: pools have been emitting forward-compatible
coinbase transactions (`nLockTime = height - 1`) since February 2026.
mainnet-observer's per-pool table (fetched 2026-09-15) records
WhitePool first at block 937,404 (2026-02-19), then MARA Pool at
940,548 (2026-03-13), ViaBTC at 949,094 (2026-05-12) and Foundry USA
at 952,880 (2026-06-08), plus Solo CK and CKPool. Between 33% and 49%
of coinbase transactions per day carried a BIP54 locktime over
2026-09-01..15. This is readiness, *not* BIP9 signaling, and cannot
lock in a soft fork. F2Pool still uses coinbase `nLockTime` for job
metadata; Poinsot reported (BNOC, 2026-02-23) that it does not intend
to change until BIP54 is further along toward activation.

## Covenants in general

A covenant restricts how an output may be re-spent (where the funds
go, in what shape, with what conditions). Existing scripts can
restrict **who** spends; covenants restrict **how**.

Use cases:
- **Vaults** — cooldown period before final spend; recoverable from
  cold key.
- **Congestion control** — pre-commit to a tree of payments.
- **L2 protocols** — Ark, Spacechains, CoinPool depend on covenants.

## CTV — `OP_CHECKTEMPLATEVERIFY` (BIP119)

```
<TemplateHash> OP_CTV
```

Forces the tx to match a pre-committed template:
- Output set, amount, scriptPubKeys.
- Number of inputs (but NOT specific prevouts).
- Locktime, sequence values.

Template-hash is committed on-chain → spending tx must produce the
exact set of outputs.

**Status (September 2026)**: BIP119 assigned 2020-01-06, still
**Draft** in the BIPs repo. Active on **signet** for testing
(specifically the "CTV signet"), and on the default signet via
Bitcoin Inquisition.

There is now a concrete - but entirely third-party - activation path,
so "no activation path" is no longer accurate:

- A June 2025 open letter (ctv-csfs.com) signed by dozens of
  application and protocol developers asked Core contributors to
  prioritise CTV (PR #31989) and CSFS (PR #32247) within six months.
  Both PRs are still **open and unmerged** as of September 2026, and
  both are titled "(regtest only)".
- A separate activation client (github.com/ctv-activation/
  activation-client, announced on Delving Bitcoin 2026-02-09) deploys
  BIP119 via **BIP9 on bit 5**: `nStartTime` 2026-03-30, `nTimeout`
  2027-03-30, `threshold` 1815/2016 (90%), `min_activation_height`
  1001952 (~May 2027). This is not Bitcoin Core.
- Miner signaling has been **flat at 0.00%**: bip119monitor.com shows
  every completed difficulty period from 466 through 478 at 0 of 2016
  blocks, and period 479 at 0.00% as of 2026-09-15.

Competing designs: BIP446 `OP_TEMPLATEHASH` (Draft) covers the same
"commit to the spending transaction" ground inside the BIP448 bundle
below, and BIP443 `OP_CHECKCONTRACTVERIFY` is a more general
deferred-check covenant.

**Use cases**: vaults, payment pools, congestion control, simple Ark
variants.

## SIGHASH_ANYPREVOUT — APO / APOAS (BIP118)

New SIGHASH flag. Sig commits to script + value but **not** to
specific prevout txid:vout.

```
APO     sighash         (commits to scriptPubKey, not txid)
APOAS   sighash variant (also doesn't commit to script — even more permissive)
```

Original use case: **Eltoo** — Lightning channel update protocol that
replaces commitment-tx penalty with simple state replacement.

**Status (September 2026)**: BIP118 assigned 2017-02-28, still
**Draft**; no mainnet activation, signet only via Bitcoin Inquisition
(binana `[2016, 118, 0]`, deployment `ANYPREVOUT`). Treat it as the
*historical* route to eltoo: the mainstream route is now BIP448's
Taproot-native rebindable signatures (below), which reach the same
LN-Symmetry semantics without a new sighash flag or key version.
BIP118 has not been withdrawn or formally replaced, so do not call it
dead - but do not present it as the live eltoo path either.

## BIP448 - Taproot-native (Re)bindable Transactions

Authors Gregory Sanders, Antoine Poinsot and Steven Roose; assigned
2026-03-11; **Status: Draft**. A deployment bundle of three tapscript
operations, each spec'd in its own BIP:

| BIP | Opcode | Redefines | Status |
|-----|--------|-----------|--------|
| 446 | `OP_TEMPLATEHASH` | `OP_SUCCESS206` (0xce) | Draft (assigned 2026-02-06) |
| 348 | `OP_CHECKSIGFROMSTACK` | `OP_SUCCESS204` (0xcc) | Draft (assigned 2024-11-26) |
| 349 | `OP_INTERNALKEY` | `OP_SUCCESS203` (0xcb) | Draft (assigned 2024-11-14) |

`OP_TEMPLATEHASH` pushes a hash of the spending transaction onto the
stack rather than taking a commitment as an argument, so it composes
with other opcodes where CTV does not. `OP_CHECKSIGFROMSTACK` gives
BIP340 verification over arbitrary messages (delegation, oracle
attestations). `OP_INTERNALKEY` pushes the Taproot internal key, an
8-vbyte optimisation for rebindable signatures.

BIP448's stated motivation: together these "enable rebindable
transaction signatures, making possible a new type of payment
channel: LN-Symmetry ('Eltoo')", make multiparty channels practical,
enable the Daric 2-party channel simplification, "substantially
improve statechains", and reduce interactivity in the Ark variant
"Erk" and in PTLC upgrades. Deployment: "the specific activation is
left to be determined at a later date." A CTV+CSFS-flavoured variant
of this opcode set was previously proposed for activation as
"LNHANCE".

**Ecosystem as of September 2026** (Optech, 2026-09-04): a BIP448
GitHub organization aggregates implementations (Bitcoin Inquisition,
a Core patch without activation, miniscript and PSBT integration,
draft LN-Symmetry BOLTs plus a Core Lightning implementation, an Ark
`OP_TEMPLATEHASH` signet demo); covenants.diy is a browser tapscript
editor with selectable opcode sets; and a Covenants Use-Case Atlas
collects more than two dozen constructions. The full bundle is
expected on the default signet with the next Bitcoin Inquisition
release.

## OP_VAULT (BIP345)

Two-stage vault primitive:
- `OP_VAULT` output: spend to a "trigger" path (begins cooldown) or
  recover path (immediate, to cold key).
- After cooldown, spend the trigger to actual destination.

Provides **first-class vault** semantics without complex script
gymnastics. Works in P2TR script-path.

**Status (September 2026)**: BIP345 is **Closed** with
`Proposed-Replacement: 443`. Under BIP-3, Closed means "of historical
interest only, and is not being actively worked on, promoted or in
active use". Read the OP_VAULT mechanics above as design history.

### Successor - `OP_CHECKCONTRACTVERIFY` (BIP443)

Salvatore Ingala; assigned 2025-05-08; **Status: Draft**. A single
general deferred-check opcode (`OP_CCV`) instead of a vault-specific
pair: a UTXO carries a dynamic commitment to a piece of data, the
script can introspect that data, and it can constrain the internal
public key, taptree and committed data of one or more outputs.
Combined with a vector-commitment opcode this composes into arbitrary
UTXO state machines, of which a vault is one instance. Also cited as
a way to make CTV-based receive addresses safer (Optech,
2026-01-02).

## OP_CAT reactivation

Re-enable string concatenation in Tapscript. Disabled since 2010
genesis era (pulled due to DoS concerns, since obsoleted by stack-item
size limits).

Why people want it:
- **Verifiable computation** — constructs proofs/scripts via concatenation.
- **Quantum-resistant signature** schemes (Lamport / Winternitz one-time).
- **BitVM2** — simplified bridge construction.
- **Recursive covenants** with limited branching.

**Status (September 2026)**: this is **BIP347, "OP_CAT in
Tapscript"** (Ethan Heilman, Armin Sabouri), assigned 2023-12-11,
version 1.0.0, **Status: Complete** - spec finished and recommended
for adoption, with no mainnet activation; it is available on the
default signet via Bitcoin Inquisition. It redefines
`OP_SUCCESS126` (0x7e, the original OP_CAT opcode value) in tapscript
only, and fails if the concatenated result would exceed the 520-byte
element limit.

## Drivechains — BIP300 / BIP301

Sidechains pegged with miner-validated locks:
- BIP300 — hashrate escrow with deposit/withdraw tx types.
- BIP301 — blind merge mining.

Allows trustless-of-miner-majority sidechains. Critique: trusts miners
implicitly with all sidechain funds.

**Status (September 2026)**: BIP300 and BIP301 are both still
**Draft**, with no Bitcoin mainnet soft-fork activation and no
activation parameters. **LayerTwo Labs** runs testnet drivechains and
maintains `bip300301_enforcer`, "CUSF software enforcing BIP300 and
BIP301 rules" - a client-side user soft fork enforcement path that
does not require a Bitcoin-wide deployment - plus
`cusf-enforcer-mempool`, which patches `getblocktemplate` to mine
CUSF-compliant blocks.

Beyond Bitcoin, LayerTwo Labs stopped waiting for a soft fork: Paul
Sztorc announced an **"eCash" hard fork** of Bitcoin targeting block
964,000 (August 2026), with a one-time minimum-difficulty reset, a
1:1 airdrop to BTC holders and BIP300/301 drivechains enabled from
day one. It is heavily contested because the plan also describes a
partial reassignment of coins for development or community incentives
(Bitcoin.com News, 2026-06-22). That chain is **not Bitcoin**: a
drivechain running there says nothing about BIP300/301's status on
Bitcoin mainnet.

## Spacechains (Ruben Somsen)

Sidechain idea using `OP_CAT` (BIP347) + `OP_CHECKSIGFROMSTACK`
(BIP348, also unactivated) to enable arbitrary-script verification
without explicit miner support.

**Status**: Concept. Not a formal BIP.

## Cross-Input Signature Aggregation (CISA)

Aggregate all signatures in a transaction into a single signature.
Massive witness savings (n inputs → 1 sig instead of n sigs). Active
research; not yet a deployable proposal.

As of September 2026 CISA is rarely discussed standalone: the live
question is whether to bundle it with a post-quantum output type.
Pieter Wuille put the maximum weight reduction at about 28%, and only
for transactions with many inputs, argued wallet and custodian
support is the real bottleneck, and warned that bundling would delay
a P2TRv2 soft fork; Adam Gibson agreed. Conduition argued pairing
CISA with P2TRv2 would strongly incentivise migration, and that a
CISA-supporting output type can ship first with ordinary BIP340
signatures and gain aggregation later (Optech, 2026-09-04).

## Post-quantum proposals

Post-quantum work is now a dominant consensus-track discussion and
covers far more than signature schemes.

| Proposal | What it is | Status |
|----------|------------|--------|
| **BIP360** | Pay-to-Merkle-Root output type | Draft (v0.12.1) |
| **BIP361** | PQ migration / legacy signature sunset | Draft, Informational |
| **P2TRv2** | Candidate PQC output type, not a BIP | Under discussion |
| **SHRINCS** | Semi-stateful hash-based signatures | Draft spec, no BIP |
| **DropKick** | Commit/reveal rescue for stranded coins | Sketch |

- **BIP360** "Pay-to-Merkle-Root (P2MR)": a P2TR-like output type with
  the key path spend removed, so no EC point is exposed. Hunter Beast,
  Ethan Heilman, Isabel Foxen Duke; assigned 2024-12-18. Scoped to
  long-exposure resistance; PQ signatures are a separate proposal.
- **BIP361** "Post Quantum Migration and Legacy Signature Sunset":
  Phase A disallows sending to quantum-vulnerable addresses; Phase B
  encumbers ECDSA/Schnorr spends with a quantum-safe rescue protocol
  on a well-publicized flag day five years after activation. Jameson
  Lopp et al.; assigned 2026-02-11, published 2026-04-24.
- **P2TRv2**: positioned by Wuille as the default for casual users,
  with P2MR for sophisticated users who want to hide EC points.
- **SHRINCS**: 48-byte pubkeys, 548-byte stateful signatures at the
  smallest, 5,777-byte stateless fallback, 2^40 stateless signature
  budget. First draft posted 2026-09-04, alongside `libshrincs` with
  machine-checked WOTS+C proofs. A signature scheme only - deployment
  would be a separate proposal.
- **DropKick**: commit/reveal rescue for coins not moved to PQC
  outputs by Q-day, deployable as a non-confiscatory soft fork only if
  it encumbers UTXOs with decidable knowledge asymmetries. Conduition,
  2026-09-04.

Also live: a proposed segwit commitment to post-quantum witness data
(Optech, 2026-08-07) and a post-quantum path for BIP324 P2P transport
encryption (Optech, 2026-06-05).

Reusing a SHRINCS stateful counter lets an observer forge signatures;
Antoine Riard noted 5,777-byte stateless signatures would be roughly
90x today's onchain cost absent a witness discount. None of these is
activated, numbered as a consensus deployment, or scheduled.

## The 2026 script / covenant BIP cluster

Any engineer reasoning about Bitcoin covenants today will run into
these. All **Draft**, none deployed, as of September 2026:

| BIP | Title | Author(s) |
|-----|-------|-----------|
| 440 | Varops Budget For Script Runtime Constraint | Russell, Moik |
| 441 | Restoration of disabled script (Tapleaf 0xC2) | Russell, Moik |
| 442 | OP_PAIRCOMMIT | moonsettler, Brandon Black |
| 443 | OP_CHECKCONTRACTVERIFY | Salvatore Ingala |
| 446 | OP_TEMPLATEHASH | Sanders, Poinsot, Roose |
| 448 | Taproot-native (Re)bindable Transactions | Sanders, Poinsot, Roose |
| 449 | OP_TWEAKADD - x-only key tweak addition | Jeremy Rubin |

- 440 and 441 are Rusty Russell and Julian Moik's "Great Script
  Restoration", both assigned 2026-03-25; 441 requires 440.
- 442 is a vector-commitment primitive; 443 is the proposed
  replacement for BIP345; 446 is bundled by BIP448, which bundles
  446 + 348 + 349.
- The range is not contiguous: there are no BIP444, 445 or 447 rows
  in the BIPs index.

Alongside them, BIP53 "Disallow 64-byte transactions" (Chris Stewart,
Draft) is the standalone spec for one of BIP54's four fixes.

## Status terminology

BIP-3 replaced the older BIP-2 status set. Current statuses:

| Status | Meaning |
|--------|---------|
| **Draft** | In the BIPs repo, work ongoing |
| **Complete** | Planned work concluded; adoption recommended |
| **Deployed** | Evidence of active use; for a soft fork, activated |
| **Closed** | Of historical interest only; not worked on or in use |

A Specification BIP needs a reference implementation and
comprehensive test vectors before it can move to Complete.

The BIP-2 names still appear in secondary sources and in this
corpus's older material. BIP-3 renamed **Proposed** to `Complete`,
folded **Deferred, Obsolete, Rejected, Replaced** and **Withdrawn**
into `Closed`, and **Final** and **Active** into `Deployed`. Older
material in this corpus that says "Proposed" means `Complete`. A
Closed BIP may carry a `Proposed-Replacement: <n>` header naming its
successor (BIP345 does, pointing at 443).

For consensus changes, `Deployed` requires a successful soft-fork
deployment — never assume it from `Complete`. BIP54 and BIP347 are
both Complete and neither is active on mainnet.

## Common pitfalls

- Reasoning about a protocol that **depends** on CTV/APO/OP_CAT as if
  those were already active. Always name the dependency explicitly.
- Citing drivechain TVL or activity → likely on a private testnet or
  on LayerTwo Labs' forked "eCash" chain, not Bitcoin mainnet.
- Reading "Status: Complete" as "activated". Under BIP-3 it only means
  the authors finished the spec (BIP54, BIP347).
- Citing miner signaling for CTV as evidence of momentum: the
  third-party BIP9 bit-5 deployment has been at 0.00% since it began.
- Confusing forward-compatible coinbase construction (BIP54
  `nLockTime = height - 1`) with BIP9 signaling. They are different
  things and only the latter can lock in a soft fork.
- Presenting BIP118/APO as the current eltoo route. Since March 2026
  the active proposal is BIP448.
- Confusing **signet** activation (custom signet challenge that includes
  the proposed opcode) with mainnet activation.

## See also

- [consensus/SKILL.md](../consensus/SKILL.md) - BIP54 touches block
  validation, merkle roots and BIP30
- [bips/SKILL.md](../bips/SKILL.md) - BIP numbering and status index
- [scripts/SKILL.md](../scripts/SKILL.md) - opcode allocations the
  BIP448 bundle redefines
- [../../mining/pool-architectures/SKILL.md](../../mining/pool-architectures/SKILL.md)
  - coinbase construction, which BIP54 constrains
- [../../lightning/channels/SKILL.md](../../lightning/channels/SKILL.md)
  - LN-Symmetry depends on BIP448
- [../../l2/statechains/SKILL.md](../../l2/statechains/SKILL.md) -
  BIP448 cites statechain improvement as motivation
- [../../l2/drivechains-spacechains/SKILL.md](../../l2/drivechains-spacechains/SKILL.md)
- [../../l2/ark/SKILL.md](../../l2/ark/SKILL.md)
- [../../l2/bitvm/SKILL.md](../../l2/bitvm/SKILL.md)
- [../../cryptography/schnorr/SKILL.md](../../cryptography/schnorr/SKILL.md)
  - the signature scheme the post-quantum work would replace
