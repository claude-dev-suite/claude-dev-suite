---
name: bitcoin-rbf-cpfp
description: |
  Replace-by-Fee (BIP125, full-RBF) and Child-Pays-For-Parent fee
  bumping. Cluster mempool policy (Core 31.0+), package CPFP via
  submitpackage, TRUC v3 (BIP431). Wallet-level fee bump strategies.
  USE WHEN: implementing fee bumping, debugging "stuck transaction",
  designing wallet UX for fee acceleration.
allowed-tools: Read, Grep, Glob
---

# RBF + CPFP

> See also [../../protocol/transactions/quick-ref/rbf-cpfp.md](../../protocol/transactions/quick-ref/rbf-cpfp.md)
> for protocol-level details. This SKILL.md focuses on **wallet
> implementation**.

## Wallet-level RBF flow

```
1. Build initial tx with sequence 0xfffffffd on every input (the
   BIP125 opt-in signal, and the ecosystem-majority value — see
   "nSequence is a fingerprint" below). Under full-RBF policy this
   does not decide replaceability; it is an anti-fingerprinting
   default.
2. Sign and broadcast.
3. After N blocks of non-confirmation OR explicit user request:
   a. Estimate new fee rate.
   b. Build replacement: same outputs, possibly different change
      amount (smaller, since more goes to fee).
   c. Verify the replacement rules: pays more than the sum of the
      replaced fees, plus incrementalrelayfee × vsize.
   d. Sign and broadcast.
4. Old tx is dropped from mempool; new tx awaits confirmation.
```

## Replacement rules (simplified)

Core's policy has drifted away from BIP125; the live specification is
`doc/policy/mempool-replacements.md`, not the BIP. For replacement `R`
of original set `O` (the directly conflicting txs plus their in-mempool
descendants), as of Bitcoin Core 31.1 (July 2026) — numbered as in
that doc:
3. R pays an absolute fee at least the sum paid by O.
4. R pays for its own bandwidth: the fee delta is at least
   `incrementalrelayfee × R.vsize` (the default dropped from
   1 sat/vB to 0.1 sat/vB in Core 30.0, October 2025).
5. R conflicts with at most 100 **distinct clusters**.
6. R strictly improves the mempool's feerate diagram. For a
   *singleton* — a tx alone in its cluster — a higher fee **and** a
   higher feerate is sufficient.

Rules 1 and 2 are both marked "(Removed)" in that doc. Rule 1 was the
opt-in signalling requirement; rule 2 was "no new unconfirmed inputs",
dropped in Core 31.0 (April 2026), so a replacement may now spend
unconfirmed outputs the original did not. Rule 6 was, before 31.0, the
Core 0.12 constraint that R beat the feerate of every directly
conflicting tx; the feerate-diagram form replaced it with cluster
mempool.

Bitcoin Core 28.0 made **full-RBF** the default — even txs without
opt-in signal (sequence ≥ 0xfffffffe) can be replaced. Core 29.0 then
removed the `-mempoolfullrbf` opt-out entirely (PR #30592), so as of
Bitcoin Core 31.1 (July 2026) a default-policy node replaces any
transaction regardless of its nSequence values.

## nSequence is a fingerprint, not a switch

Because default-policy nodes ignore the signal, the nSequence value a
wallet picks no longer controls replaceability — it mainly identifies
the wallet that built the transaction. rkrux opened Bitcoin Core #35405
in May 2026 to stop the Core wallet signalling by default, using `MAX-1`
(`0xfffffffe`, where `MAX` is `0xffffffff`), and took the question —
should wallets converge on a single value? — to bitcoin-dev in June
2026. Murch and Electrum contributor SomberNight objected: `MAX-2`
(`0xfffffffd`) is already the dominant value — roughly 75–78% of
transactions as of June 2026 (mainnet-observer, as read by Optech #410
and by the #35405 thread), and nearly all Electrum transactions — so
moving Core to a non-signalling `MAX-1` would make Core txs stand out
rather than blend in. rkrux closed the PR in light of that feedback;
Core's wallet default is unchanged (`DEFAULT_WALLET_RBF = true`,
emitting `MAX_BIP125_RBF_SEQUENCE = 0xfffffffd`) as of September 2026.

Practical rule: emit `0xfffffffd` on every input unless you need
nSequence for a BIP68 relative timelock. Choosing a distinctive value
to "opt out" of replacement buys nothing under full-RBF policy and
costs privacy.

## Mempool topology limits (Core 31.0+)

Core 31.0 (April 2026) reimplemented the mempool as a **cluster
mempool**. Ancestor and descendant count/size limits are no longer
enforced. In their place, a *cluster* — any set of mempool transactions
connected through parent/child relationships — is capped at 64
transactions and 101 kB of virtual size. Both limits are overridable
from the command line (see `-help-debug`). Wallets that budgeted chain
depth against the pre-31.0 defaults (25 ancestors, 25 descendants,
101 kvB each) must budget against the cluster instead.

Within the mempool, transactions are ordered by **chunk** feerate — the
feerate of the set that would be mined together, e.g. a parent and its
child. That ordering drives block template selection, eviction and relay
announcement, and it is what makes CPFP work. New in 31.0:
`getmempoolcluster` and `getmempoolfeeratediagram`; `getmempoolentry`
now also reports chunk size and chunk fees.

The **CPFP carveout** — one extra child, at most 10 kvB with exactly one
ancestor, allowed past the descendant limit — was removed in 31.0.
Nothing bypasses the cluster count limit; TRUC plus sibling eviction is
the replacement mechanism for those use cases.

## Wallet UX for RBF

User-facing controls:
- Slider: target confirmation time (10 min, 1 hour, next day).
- "Bump fee" button on pending txs.
- Display fee bump cost: extra fee + new total.
- Warning: "Replacing this transaction will invalidate the previous
  one. Recipient may not see it."

## Wallet-level CPFP flow

When sender's tx is stuck and CPFP is the only option (e.g., tx is
non-RBF or is from someone else):

```
1. Identify a UTXO from the stuck tx that you control (your change
   output, or a received output).
2. Build a child tx spending that UTXO.
3. Compute child fee such that:
   package_fee_rate = (parent_fee + child_fee) / (parent_vsize + child_vsize)
   ≥ target_rate
4. Broadcast child via submitpackage (Core 26.0+, December 2023), or
   via sendrawtransaction and rely on opportunistic 1p1c relay
   (Core 28.0+).
```

## Receiver-side CPFP

If you're the **receiver** of an unconfirmed payment that's stuck:
- Option A: spend the received output to yourself with high fee.
  Now both txs in mempool; package CPFP includes parent.
- Option B: wait. Sender may RBF on their side.

## Package CPFP (`submitpackage`)

`submitpackage` RPC accepts a `[parent, child]` array atomically; it
landed in Bitcoin Core 26.0 (December 2023). Before it, a child alone
was rejected if the parent was below mempool min. Now the package
effective rate is computed.

This is Core's own RPC, **not** an implementation of BIP331. BIP331
("Ancestor Package Relay") is still Status: Draft as of September 2026
and its `sendpackages` / `pkgtxns` P2P messages do not exist in Core
31.1. What Core relays over P2P is a narrower, opportunistic
1-parent-1-child (1p1c) scheme carried on the *existing* transaction
relay protocol: added in 28.0 (October 2024), and widened in 31.0
(April 2026) so the parent of a non-TRUC 1p1c package may also pay below
`-minrelaytxfee`, even 0 fee.

```bash
bitcoin-cli submitpackage '["<parent_hex>","<child_hex>"]'
```

## TRUC v3 (BIP431)

Strict version=3 transactions for Lightning-style use:
- ≤ 1 unconfirmed ancestor / descendant.
- ≤ 10 kvB tx size.
- Sibling eviction: a v3 child can replace a sibling without paying
  for the sibling's bandwidth.

Combined with **ephemeral anchors** (value=0 anchor outputs that must
be spent in the same package), gives non-pinnable Lightning fee
bumping.

## Lightning-specific fee bumping

- **Anchor commitment** (BOLT-3 update): small value (330 sats)
  output spendable by either party for CPFP.
- **TRUC v3 + ephemeral anchor**: zero-value anchor, must be spent
  in same package. Mitigates pinning.

LSP and self-custodial Lightning wallets implement these via:
- LND: `chantools transient-fee-bumper` (legacy) or built-in fee
  bumping for anchor channels.
- CLN: `feebumper` plugin or core support.
- LDK: `OnchainTxHandler` orchestrates child txs.

## Common bugs

- Reusing the same input in both old and new tx but for different
  outputs → not a valid replacement (input set must overlap to
  conflict).
- Assuming an RBF replacement may never add a new unconfirmed input →
  that was BIP125 rule 2, removed in Core 31.0 (April 2026). Default
  policy now allows it; only code targeting pre-31.0 nodes still needs
  to avoid it.
- Building child that spends a parent output that's already fully
  spent in another descendant → rejected as conflict.
- Computing fee rate against `size` instead of `vsize` → underpays
  for SegWit txs.
- Setting nSequence to `0xffffffff` or `0xfffffffe` believing it makes
  the tx non-replaceable → it does not (full-RBF), and it marks the
  transaction as coming from a minority wallet.

## See also

- [fee-estimation/SKILL.md](../fee-estimation/SKILL.md)
- [../../protocol/package-relay/SKILL.md](../../protocol/package-relay/SKILL.md)
- [../../protocol/transactions/quick-ref/v3-truc.md](../../protocol/transactions/quick-ref/v3-truc.md)
