---
name: lightning-pinning-attacks
description: |
  Pinning attacks: low-fee descendant txs block honest fee-bumping
  by exploiting mempool descendant policy. Anchor outputs (BOLT-3),
  TRUC v3 (BIP431), P2A + ephemeral dust, and the single shared
  anchor of `zero_fee_commitments` as defenses.
  USE WHEN: auditing fee-bump robustness, evaluating channel security,
  reviewing post-2024 LN deployments.
allowed-tools: Read, Grep, Glob
---

# Pinning Attacks

Pinning = an attacker publishes a tx that **blocks your tx from
confirming** by attaching as a descendant chain that exhausts mempool
descendant limits or replacement-fee budgets.

## Classic pinning

You publish parent P (commitment, HTLC-timeout, etc.). Attacker
publishes child C spending P's output:
- C has very low fee rate but has 24+ unconfirmed ancestors/
  descendants of its own (Tx graph).
- Mempool admits C; descendant chain reaches policy limits.
- Now ANY new descendant of P is rejected: descendant limit
  exceeded.
- You can't CPFP P; you can't RBF (your replacement would conflict
  with C, but BIP125 rule 5 makes it economically prohibitive).

Result: your honest tx P is "stuck" until mempool eviction (which
might never happen if attacker keeps refilling).

## Lightning impact

In Lightning context:
- After force-close, you publish HTLC-timeout to claim funds before
  CLTV expiry.
- Attacker pins HTLC-timeout's anchor / output → can't bump.
- CLTV expires upstream (Alice's HTLC times out before you can claim
  Bob's).
- You lose the in-flight HTLC.

## Mitigation 1: Anchor outputs (`option_anchors`, BOLT-3, ~2020)

Each commitment tx gets two 330-sat anchor outputs, one **keyed to
each party's funding key**:
- Spendable immediately by that party.
- Spendable by anyone after 16 blocks (UTXO-set hygiene).

You can spend your anchor with a high-fee child to CPFP the
commitment. Defeats simple pinning of commitment. Two separate keyed
anchors are what stops a peer from monopolising the descendant limit
on a shared fee-bump output.

But: HTLC-timeout txs themselves still vulnerable. And because every
non-anchor output is CSV-locked under `option_anchors`, the anchor is
the only CPFP handle, so its child needs an external wallet UTXO.

## Mitigation 2: TRUC v3 + P2A / ephemeral dust (2024-2025)

- TRUC v3 (BIP431): ≤ 1 unconfirmed ancestor, ≤ 1 unconfirmed
  descendant, ≤ 10,000 vB per TRUC tx, ≤ 1,000 vB for a TRUC child
  that has an unconfirmed ancestor, plus sibling eviction. Standard
  policy since Bitcoin Core 28.0 (October 2024).
- P2A (BIP433): the keyless anchor script `OP_1 <0x4e73>`, spent by
  anyone with an empty witness. Standard output type since Core 28.0;
  standard dust limit 240 sat.
- Ephemeral dust (Core 29.0, April 2025): a tx may carry one dust
  output provided the tx pays zero fee and that output is spent in the
  same package.

"Ephemeral anchors" was the 2023 working name for this idea. What
actually shipped is the P2A output type plus the ephemeral-dust rule,
so prefer those terms. BIP431 and BIP433 are both still Status: Draft
as of September 2026 — the *policy* shipped as standardness in Core,
the BIPs themselves were never finalised.

Combined: pinning surface is removed. Attacker can't keep stacking
descendants; honest party can sibling-evict bad children cheaply.

## Mitigation 3: Package submission and 1p1c relay

`submitpackage` (RPC, since Bitcoin Core 26.0, December 2023) lets you
submit parent + your CPFP child atomically to your own node. Mempool
computes effective package fee rate. No race against attacker.

Over the wire, Core 28.0 (October 2024) added *opportunistic
1-parent-1-child (1p1c) relay*, carried on the existing tx-relay
protocol. **BIP331 "Ancestor Package Relay" is still Status: Draft and
has never been deployed** — its `sendpackages` / `ancpkginfo` /
`pkgtxns` messages do not exist in the Bitcoin Core source tree as of
September 2026. Do not design around a negotiated package-relay
protocol on the wire; design around 1p1c plus local `submitpackage`.

## Mitigation 4: Zero-fee commitments (`zero_fee_commitments`, 2026)

Merged into the BOLT spec on 2026-05-04 (lightning/bolts PR #1228,
BOLT-9 feature bits 40/41). This replaces the anchor + `update_fee`
model rather than tuning it:

- Commitment tx `version` is **3** (TRUC), so commitment + one child
  form a TRUC package under TRUC's topology limits.
- `feerate_per_kw` is fixed at `0`: commitment, HTLC-timeout and
  HTLC-success all have base fee 0, and `update_fee` is never sent.
- The two keyed anchors are replaced by a single **`shared_anchor`**:
  the standard P2A script `OP_1 <0x4e73>`, spendable by anyone with an
  empty witness. Its amount is the sum of trimmed outputs plus
  rounded-down msat; below the 240-sat P2A dust limit that is legal
  only under the ephemeral-dust rule, which applies precisely because
  the parent pays no fee. Above 240 sat the anchor caps at 240 and the
  remainder becomes a real mining fee.
- The 1-block CSV is scoped to `option_anchors`, so here `to_remote`
  is a plain P2WPKH. You can CPFP a *remote* commitment by spending
  your own main-balance or HTLC output — no external wallet UTXO
  needed.

Anti-pinning consequence: a single keyless anchor is safe here only
*because* of TRUC. With at most one unconfirmed descendant and sibling
eviction, an attacker's child can always be replaced by a
higher-feerate sibling, so there is nothing to monopolise — which is
why the per-party keyed anchors of Mitigation 1 are no longer needed.
Requires a relay path accepting v3/TRUC (Core 28.0+) and ephemeral
dust (Core 29.0+).

## State as of September 2026

- `option_anchors` + TRUC v3 + P2A/ephemeral dust + 1p1c package
  submission → robust against known pinning variants.
- `zero_fee_commitments` is the current end-state design, merged into
  the BOLT spec but shipped in only two implementations so far (see
  below).
- Legacy non-anchor channels still exist; gradual migration. Eclair
  v0.14.0 (2026-05-21) dropped support for channels that do not use
  anchor outputs.
- TRUC/v3 is mempool *policy*, not a consensus rule, so there is no
  "activation" to key channel defaults off — what matters is whether
  your relay path runs Core 28.0+ (and 29.0+ for ephemeral dust).

## Implementation status (as of September 2026)

| Impl | TRUC v3 commitments (`zero_fee_commitments`) | Anchor CPFP |
|------|----------------------------------------------|-------------|
| LDK (`lightning` crate) | yes — shipped in 0.2 (2025-12-02) | yes |
| Eclair | yes — final form in v0.14.0 (2026-05-21); moved its Bitcoin Core dependency to v30.x for v3/TRUC + ephemeral dust | yes |
| LND | no — no `zero_fee_commitments` in the source tree (latest release v0.21.3-beta, 2026-09-02) | yes |
| CLN | no — no `zero_fee_commitments` in the source tree (latest release v26.06.7, 2026-08-28) | yes |

LDK's 0.2 release notes flag that 0FC channels currently only
interoperate with LDK peers and that feature signalling may still
change. Do **not** cite a `0.0.1xx` LDK version as the floor: the
0.0.x series ended at 0.0.125 (2024-10-14) and was succeeded by 0.1.0
(2025-01-16).

## Common confusions

- **Pinning** vs **replacement cycling** — both attack mempool
  policy but differently:
  - Pinning: block your tx from confirming.
  - Cycling: drain your bumping budget while attacker's tx sits.
- **Pinning** vs **channel jamming** — different layers (on-chain vs
  off-chain).
- **Anchor outputs** mitigate **commitment pinning** but not necessarily
  HTLC pinning. Full fix: TRUC v3 commitments with the single shared
  P2A anchor (`zero_fee_commitments`).
- **BIP331** vs **1p1c relay** — BIP331 is an undeployed Draft; 1p1c
  over ordinary tx relay is what Core actually ships.
- **Two keyed anchors** vs **one `shared_anchor`** — `option_anchors`
  needs one anchor per party because descendant limits are shared;
  `zero_fee_commitments` needs only one keyless P2A because TRUC caps
  the parent at one evictable descendant.

## See also

- [replacement-cycling/SKILL.md](../replacement-cycling/SKILL.md)
- [channel-jamming/SKILL.md](../channel-jamming/SKILL.md)
- [channels/SKILL.md](../channels/SKILL.md)
- [../../protocol/package-relay/SKILL.md](../../protocol/package-relay/SKILL.md)
- [../../protocol/transactions/quick-ref/v3-truc.md](../../protocol/transactions/quick-ref/v3-truc.md)
