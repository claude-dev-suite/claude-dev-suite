---
name: bitcoin-package-relay
description: |
  BIP331 package relay + accompanying mempool policy: package validation,
  ancestor/descendant limits, submitpackage RPC, package CPFP, sibling
  eviction with TRUC v3 (BIP431), ephemeral anchors. Critical for
  Lightning fee bumping and any multi-tx workflow.
  USE WHEN: implementing CPFP, designing fee-bump strategies, debugging
  "why won't my child confirm", reasoning about Lightning anchor pinning.
allowed-tools: Read, Grep, Glob
---

# Package Relay (BIP331)

Package = a set of related transactions (typically parent + child) that
mempool evaluates **atomically**. Until BIP331, mempool processed one
tx at a time, which broke CPFP when a parent was below mempool min fee
rate.

## Activation

- BIP331 mempool policy in Bitcoin Core 28.0 (Sept 2024).
- Companion: TRUC v3 transactions (BIP431) for stricter Lightning-class
  packages.

## Why packages

Pre-package relay:
- Parent tx P with fee rate X submitted; if X < mempool min, P is rejected.
- Child C spending P's output, even at high fee rate, **cannot rescue P**
  because mempool evaluates C alone, can't find its parent.

Post-package relay:
- Submit P + C atomically via `submitpackage`.
- Mempool computes the package effective fee rate
  `(fee_P + fee_C) / (vsize_P + vsize_C)`.
- If above mempool min, both accepted.

## submitpackage RPC

```bash
bitcoin-cli submitpackage '["<rawtx_parent_hex>", "<rawtx_child_hex>"]'
```

Returns per-tx result: `accepted` / `rejected` with reason. Atomic: if
any tx in package fails, none are accepted.

## Package validation rules (selected)

1. All txs share at least one ancestor or descendant relationship within
   the package.
2. Total package size ≤ default ancestor/descendant size limits unless
   TRUC v3 (which has its own ≤10 kvB limit per tx).
3. No tx in package conflicts with another (no shared inputs).
4. Package effective fee rate ≥ mempool min fee.
5. Package CPFP allowed: a high-fee child can carry a low-fee parent.

## Ancestor/descendant limits (default)

- 25 unconfirmed ancestors.
- 25 unconfirmed descendants.
- 101 kvB total ancestor or descendant size.

These are **policy** limits (mempool admission only), not consensus.

## TRUC v3 (BIP431) interaction

TRUC v3 imposes stricter rules to prevent pinning:
- ≤ 1 unconfirmed ancestor (which must also be v3).
- ≤ 1 unconfirmed descendant.
- ≤ 10 kvB tx size.
- Sibling eviction: a v3 child can replace a sibling without paying for
  the sibling's bandwidth (mitigates pinning).

Combined with **ephemeral anchors** (value=0 anchor outputs that must
be spent in the same package), this creates a non-pinnable
fee-bumping primitive specifically for Lightning commitment txs.

## Practical Lightning use case

Pre-BIP331/431:
- Lightning commitment with anchor output (BOLT-3 update) at 330 sats.
- Channel partner publishes commitment + bumps via anchor with high fee.
- **Pinning attack**: attacker spends anchor with low-fee descendant
  before honest CPFP can land → your honest tx waits indefinitely.
- **Replacement cycling**: attacker cycles their descendant rapidly,
  exploiting BIP125 rule 5 to stall your honest tx past CLTV.

Post-BIP331/431:
- Use v3 transactions for commitment.
- Ephemeral anchor (value=0) can only be spent in same package.
- v3 ≤1 descendant limit blocks pinning stacking.
- Sibling eviction lets you cleanly replace bad descendants.

## RBF interaction

Package replacement: a package can replace a previously submitted
package if it satisfies BIP125 rules at the package level (total fee
≥ replaced + incremental, etc.). Implementation has nuances around
**partial replacement** (some package txs replace some old, others
add); current Core treats this carefully.

## Common bugs

- Calling `sendrawtransaction` on the parent only when the parent is
  below mempool min → parent rejected, child has no parent in mempool,
  use `submitpackage` instead.
- Building a v3 child for a v0/v1 parent → policy violation.
- Forgetting to spend ephemeral anchor in the same package → package
  rejected (anchor output is unspendable except in package context).

## See also

- [transactions/quick-ref/v3-truc.md](../transactions/quick-ref/v3-truc.md)
- [transactions/quick-ref/rbf-cpfp.md](../transactions/quick-ref/rbf-cpfp.md)
- [../../lightning/replacement-cycling/SKILL.md](../../lightning/replacement-cycling/SKILL.md)
- [../../lightning/pinning-attacks/SKILL.md](../../lightning/pinning-attacks/SKILL.md)
