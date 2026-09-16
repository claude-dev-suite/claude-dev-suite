---
name: bitcoin-package-relay
description: |
  Package relay and the mempool policy Bitcoin Core actually ships:
  opportunistic 1p1c relay, package validation, cluster limits,
  submitpackage RPC, package CPFP, sibling eviction with TRUC v3
  (BIP431), P2A anchors (BIP433) and ephemeral dust. Critical for
  Lightning fee bumping and any multi-tx workflow.
  USE WHEN: implementing CPFP, designing fee-bump strategies, debugging
  "why won't my child confirm", reasoning about Lightning anchor pinning.
allowed-tools: Read, Grep, Glob
---

# Package Relay

Package = a set of related transactions (typically parent + child) that
mempool evaluates **atomically**. Historically the mempool processed one
tx at a time, which broke CPFP when a parent was below mempool min fee
rate.

## Status and deployment timeline (as of September 2026)

**BIP331 "Ancestor Package Relay" is still Status: Draft and has never
been deployed.** Its `sendpackages` / `pkgtxns` P2P messages do not exist
in Bitcoin Core. What Core ships is a narrower, opportunistic
1-parent-1-child (1p1c) scheme carried over the *existing* transaction
relay protocol, plus local package submission via RPC:

| Release | What landed |
|---------|-------------|
| 26.0 (December 2023) | `submitpackage` RPC - local submission only, no P2P package relay |
| 28.0 (October 2024) | Opportunistic 1p1c relay over the existing tx relay protocol; TRUC v3 (BIP431) standard; Pay-to-Anchor (BIP433) standard output type; limited package RBF |
| 29.0 (April 2025) | Ephemeral dust: one dust output allowed if the tx is zero fee and the dust is spent alongside it |
| 30.0 (October 2025) | 1p1c handles a child that already has unconfirmed parents in the mempool; `submitpackage` no longer requires every unconfirmed parent to be present |
| 31.0 (April 2026) | Cluster mempool; the 1p1c parent may be below `-minrelaytxfee`, even 0 fee, for non-TRUC packages too |

Core 28.0's release notes warn that the P2P feature is limited (a child
with multiple unconfirmed parents was not supported then) and "not yet
reliable under adversarial conditions".

BIP431 (TRUC) and BIP433 (P2A) are likewise **Draft** - but unlike
BIP331 the policy they describe did ship as standard in Core 28.0.

Latest release line as of September 2026: Bitcoin Core 31.1 (July 2026).

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
any tx in package fails, none are accepted. This is a **local** submission
path; it does not make the package propagate any better than opportunistic
1p1c relay does.

## Package validation rules (selected)

1. All txs share at least one ancestor or descendant relationship within
   the package.
2. Package count ≤ 25 txs and total package weight ≤ 404,000 WU, and the
   resulting mempool cluster must stay within the cluster limits (below).
   TRUC v3 has its own ≤10 kvB limit per tx.
3. No tx in package conflicts with another (no shared inputs).
4. Package effective fee rate ≥ mempool min fee.
5. Package CPFP allowed: a high-fee child can carry a low-fee parent.
6. Packages submitted to the mempool must be **child-with-parents**:
   exactly one child plus some of its unconfirmed parents, nothing else
   (`doc/policy/packages.md`, as of Bitcoin Core 31.1, July 2026).

## Mempool topology limits (default)

Since the cluster mempool rewrite in Core 31.0 (April 2026), the mempool
**no longer enforces ancestor or descendant count/size limits**. They are
replaced by *cluster* limits, where a cluster is a connected component of
the mempool's parent/child graph:

- 64 transactions per cluster.
- 101 kvB total virtual size per cluster.

History - up to and including Core 30.x the limits were 25 unconfirmed
ancestors, 25 unconfirmed descendants and 101 kvB of ancestor or
descendant size. Code and docs written against that model still assume
`-limitancestorcount` / `-limitdescendantcount` semantics.

Either way these are **policy** limits (mempool admission only), not
consensus.

Core 31.0 also removed the CPFP carve-out; TRUC plus sibling eviction is
the intended replacement for the use cases that relied on it.

## TRUC v3 (BIP431) interaction

TRUC v3 imposes stricter rules to prevent pinning:
- ≤ 1 unconfirmed ancestor (which must also be v3).
- ≤ 1 unconfirmed descendant.
- ≤ 10 kvB tx size.
- Sibling eviction: a v3 child can replace a sibling without paying for
  the sibling's bandwidth (mitigates pinning).

Combined with **P2A anchors and ephemeral dust** (below), this creates a
non-pinnable fee-bumping primitive specifically for Lightning commitment
txs.

## Pay-to-Anchor (P2A, BIP433)

Standard output type since Core 28.0 (October 2024); specified as BIP433
(Status: Draft, Informational, author Gregory Sanders).

```
scriptPubKey = OP_1 <0x4e73>       # witness v1, 2-byte program
addresses    = bc1pfeessrawgf     (mainnet)
               tb1pfees9rn5nz     (public testnets)
               bcrt1pfeesnyr2tx   (regtest)
dust limit   = 240 sat
```

- **Keyless**: no signature or witness data at all is required to spend
  it. Core only treats the spend as standard if the witness is *empty*,
  which avoids meaningless witness padding.
- It is a witness v1 program but it is **not** a taproot output (taproot
  programs are 32 bytes) - a genuine parsing trap.
- Creating P2A outputs has been standard since segwit activated; what
  28.0 changed is that *spending* them is standard.
- Anyone can attach a child, so P2A needs an anti-pinning companion;
  BIP433 recommends using it with TRUC transactions.

**Ephemeral dust** (Core 29.0, April 2025) is a separate mechanism often
conflated with it: a transaction may carry a single dust output provided
the transaction pays **zero fee**, and any spend of that transaction's
unconfirmed outputs must also spend the dust. The two are usually used
together - the older name "ephemeral anchor" is the union of P2A and
ephemeral dust - but neither implies the other, and keyed anchors plus
ephemeral dust remains an accepted pattern.

Lightning: BOLT changes merged 2026-05-04 (lightning/bolts #1228) add
`zero_fee_commitments`, where a v3 commitment carries a single shared
P2A `shared_anchor` output instead of the two keyed 330-sat
`option_anchors` outputs.

## Practical Lightning use case

Pre-TRUC (before Core 28.0, October 2024):
- Lightning commitment with keyed `option_anchors` outputs at 330 sats.
- Channel partner publishes commitment + bumps via anchor with high fee.
- **Pinning attack**: attacker spends anchor with low-fee descendant
  before honest CPFP can land → your honest tx waits indefinitely.
- **Replacement cycling**: attacker cycles their descendant rapidly,
  exploiting BIP125 rule 5 to stall your honest tx past CLTV.

Post-TRUC:
- Use v3 (TRUC) transactions for the commitment.
- A single shared P2A anchor replaces the two keyed anchors; if the
  commitment pays zero fee the anchor may sit below the 240-sat P2A dust
  limit under the ephemeral-dust rule, and must then be spent alongside
  any spend of the commitment's unconfirmed outputs.
- v3 ≤1 descendant limit blocks pinning stacking.
- Sibling eviction lets you cleanly replace bad descendants.

## RBF interaction

Core 31.0 (April 2026) replaced the BIP125 rule set with the **feerate
diagram** rule: a replacement is accepted only if the resulting mempool's
feerate diagram is strictly better than before. For a singleton (a tx
alone in its cluster) it is sufficient to pay both a higher fee and a
higher feerate than the original. The absolute-fee and
incremental-relay-feerate requirements (old BIP125 rules 3 and 4) still
apply; BIP125 rules 1 (opt-in signalling) and 2 (no new unconfirmed
inputs) are gone (`doc/policy/mempool-replacements.md`, as of Bitcoin
Core 31.1, July 2026). Full RBF has been the default since 28.0, so
nothing has to signal.

Package replacement is still **limited** (`doc/policy/packages.md`, as of
31.1):
- The package must be 1-parent-1-child with no in-mempool ancestors.
- Parent feerate must be lower than package feerate.
- Total fees must pay for the replacement at the incremental relay
  feerate.
- The replacement must improve the feerate diagram.
- At most 100 distinct clusters may contain conflicting transactions.

History - 28.0 (October 2024) through 30.x required every conflicting
cluster to be of size ≤ 2 rather than counting clusters, and nodes
before 31.0 evaluated replacements under BIP125. **Partial replacement**
(some package txs replace old ones while others are new) remains the
awkward case.

## Common bugs

- Calling `sendrawtransaction` on the parent only when the parent is
  below mempool min → parent rejected, child has no parent in mempool,
  use `submitpackage` instead.
- Building a v3 child for a v0/v1 parent → policy violation.
- Forgetting to spend an ephemeral-dust anchor alongside the parent →
  rejected; the parent must be zero fee and the dust must go with it.
- Attaching witness data to a P2A spend → nonstandard; the witness must
  be empty.
- Assuming a successful local `submitpackage` means the package will
  propagate. Only the 1p1c shape relays opportunistically; there is no
  BIP331 package-relay protocol on the network.

## See also

- [transactions/quick-ref/v3-truc.md](../transactions/quick-ref/v3-truc.md)
- [transactions/quick-ref/rbf-cpfp.md](../transactions/quick-ref/rbf-cpfp.md)
- [../../lightning/replacement-cycling/SKILL.md](../../lightning/replacement-cycling/SKILL.md)
- [../../lightning/pinning-attacks/SKILL.md](../../lightning/pinning-attacks/SKILL.md)
