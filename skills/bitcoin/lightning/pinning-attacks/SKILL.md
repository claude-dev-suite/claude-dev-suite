---
name: lightning-pinning-attacks
description: |
  Pinning attacks: low-fee descendant txs block honest fee-bumping
  by exploiting mempool descendant policy. Anchor outputs (BOLT-3),
  TRUC v3 (BIP431), and ephemeral anchors as defenses.
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

## Mitigation 1: Anchor outputs (BOLT-3 update, ~2020)

Each commitment tx gets two 330-sat anchor outputs (one per party):
- Spendable immediately by the party.
- Spendable by anyone after 16 blocks.

You can spend your anchor with a high-fee child to CPFP the
commitment. Defeats simple pinning of commitment.

But: HTLC-timeout txs themselves still vulnerable.

## Mitigation 2: Ephemeral anchors + TRUC v3 (BIP431, 2024)

- Ephemeral anchor: `value=0`, trivial script, MUST be spent in
  same package.
- TRUC v3: ≤ 1 descendant, ≤ 10 kvB tx size, sibling eviction.

Combined: pinning surface is removed. Attacker can't keep stacking
descendants; honest party can sibling-evict bad children cheaply.

## Mitigation 3: Package relay (BIP331)

`submitpackage` lets you submit parent + your CPFP child atomically.
Mempool computes effective package fee rate. No race against attacker.

## State as of late 2025

- Anchor commitment + TRUC v3 + ephemeral anchors + package relay
  combined → robust against known pinning variants.
- Legacy non-anchor channels still exist; gradual migration.
- Channels opened post-BIP431 activation should use TRUC v3 by
  default per impl.

## Implementation status

| Impl | TRUC v3 | Ephemeral anchors | Package CPFP |
|------|---------|-------------------|--------------|
| LDK | yes (post 0.0.130) | yes | yes |
| LND | yes (0.18+) | yes | yes |
| CLN | yes | yes | yes |
| Eclair | yes | yes | yes |

## Common confusions

- **Pinning** vs **replacement cycling** — both attack mempool
  policy but differently:
  - Pinning: block your tx from confirming.
  - Cycling: drain your bumping budget while attacker's tx sits.
- **Pinning** vs **channel jamming** — different layers (on-chain vs
  off-chain).
- **Anchor outputs** mitigate **commitment pinning** but not necessarily
  HTLC pinning. Full fix: anchor + TRUC v3 + ephemeral anchors.

## See also

- [replacement-cycling/SKILL.md](../replacement-cycling/SKILL.md)
- [channel-jamming/SKILL.md](../channel-jamming/SKILL.md)
- [channels/SKILL.md](../channels/SKILL.md)
- [../../protocol/package-relay/SKILL.md](../../protocol/package-relay/SKILL.md)
- [../../protocol/transactions/quick-ref/v3-truc.md](../../protocol/transactions/quick-ref/v3-truc.md)
