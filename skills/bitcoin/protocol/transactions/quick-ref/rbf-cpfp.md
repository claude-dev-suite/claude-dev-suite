# RBF and CPFP

> Policy state as of Bitcoin Core 31.1 (July 2026). RBF and mempool policy
> changed materially in 28.0, 29.0, 30.0 and 31.0 — see History below.

## Replace-by-Fee

Replacement is **unconditional**: any mempool tx may be replaced regardless of
its `nSequence` values. Signalling has not been required since Bitcoin Core
29.0 (April 2025), which removed the `-mempoolfullrbf` option entirely.

### Current replacement rules (Core 31.0+)

Core keeps BIP125's rule numbers; rules 1 and 2 are marked "(Removed)" in
`doc/policy/mempool-replacements.md`.

3. The replacement pays an absolute fee **at least** the sum paid by the
   original txs.
4. The additional fee pays for the replacement's own bandwidth at or above the
   node's incremental relay feerate (`incrementalrelayfee`, default
   **0.1 sat/vB** since Core 30.0, October 2025).
5. The number of distinct **clusters** corresponding to conflicting txs is
   ≤ 100.
6. The mempool's **feerate diagram** must be strictly improved by the
   replacement.

Rule 6 is the cluster-mempool incentive-compatibility check added in Core 31.0
(April 2026). For singleton txs (alone in their cluster) it reduces to the
familiar "higher absolute fee and higher feerate than the original".

### Full-RBF

- Bitcoin Core 24.0: `mempoolfullrbf=1` added as an opt-in mempool policy.
- Bitcoin Core 28.0 (October 2024) changed the default from 0 to 1.
- Bitcoin Core 29.0 (April 2025) removed the option — full replace-by-fee is
  now standard behaviour with no knob to turn it off.
- Bitcoin Core 30.0 (October 2025): `bumpfee` and `psbtbumpfee` allow a
  replacement under full-RBF and no longer require BIP-125 signalling.
- Implications: 0-conf assumptions are gone for any well-connected
  receiver — wallets should monitor mempool and not credit unconfirmed.

### History (BIP125, no longer the operative test)

- Opt-in signalling: a tx was replaceable iff **at least one** of its inputs
  had `nSequence < 0xfffffffe` (convention `0xfffffffd`). Removed as rule 1.
- Rule 2 ("the replacement does not add new unconfirmed inputs") is also
  removed — a replacement may now pull in new unconfirmed inputs.
- Rule 5 was "≤ 100 original txs and descendants replaced"; it is now phrased
  over clusters rather than individual txs.
- A "replacement must beat the replaced txs' fee rate" test is widely assumed
  but was never in BIP125 and was never enforced by Core before 31.0 — rules 3
  and 4 compare absolute fees only. Rule 6's feerate diagram check (Core 31.0,
  April 2026) is the first rule that actually enforces an incentive-compatible
  feerate comparison.
- `incrementalrelayfee` and `minrelaytxfee` defaulted to 1 sat/vB before Core
  30.0 (October 2025); both are 0.1 sat/vB now.

## Child-Pays-For-Parent (CPFP)

CPFP = bumping a parent's effective fee rate by spending its output(s)
in a child tx with high enough fee that the **package** average rate
clears the next block.

### Mempool cluster rules (Core 31.0+)

Core 31.0 (April 2026) reimplemented the mempool as a "cluster mempool":

- Ancestor and descendant size/count limits are **no longer enforced**. The
  pre-31.0 defaults (25 txs / 101 kvB for each of ancestors and descendants)
  are history.
- In their place: a **cluster** — any set of mempool txs connected through
  parent/child relationships — is limited to **64 transactions and 101 kB of
  virtual size**. Both limits can be overridden with command-line arguments;
  see the extended help (`-help-debug`) for those arguments.
- Txs are ordered by **chunk** feerate: the set that would be mined together
  (e.g. a parent and its child). That ordering drives block template
  selection, eviction and relay announcements — it is what makes CPFP work.
- The **CPFP carveout** (one extra small child past the descendant limit) was
  removed in 31.0; TRUC + sibling eviction is the replacement mechanism.
- New RPCs: `getmempoolcluster` (cluster membership, ordering, chunking) and
  `getmempoolfeeratediagram`. `getmempoolentry` now also reports chunk size
  and chunk fees.
- Package CPFP: mempool accepts **packages** atomically; child can include
  parent fee even if parent alone is below mempool min fee rate.
  `submitpackage` RPC. A 1-parent-1-child package may carry a parent below
  `minrelaytxfee`, even 0 fee — allowed for TRUC since 28.0 and extended to
  non-TRUC packages in 31.0. Core's 1p1c relay is its own opportunistic
  scheme, not an implementation of BIP331; BIP331 is still Draft as of
  September 2026 and its `ancpkginfo`/`pkgtxns` P2P messages are not shipped.

### TRUC v3 (BIP431)

For Lightning-class fee bumping:
- Parent v3, child v3, ≤1 unconfirmed ancestor, ≤1 descendant.
- P2A anchor `OP_1 <0x4e73>`, default dust limit 240 sat (Core 28.0,
  October 2024); ephemeral dust takes it down to `value=0` only when the
  parent pays zero fee (Core 29.0, April 2025), and that below-dust
  output must then be spent in the same package. See
  [v3-truc.md](v3-truc.md).
- Child can pay 0 fee; package fee must be carried by an additional
  child input.

## Fee bump algorithm (typical wallet)

```
needed_rate = target_rate                    # e.g. 30 sat/vB
existing_fee = sum(in) - sum(out)
existing_rate = existing_fee / vsize
if existing_rate >= needed_rate: nothing to do

# Option A: RBF (always available — full-RBF is unconditional since 29.0)
new_fee = max(existing_fee + incremental_fee_per_vb * vsize,
              needed_rate * vsize)
build replacement with new_fee, broadcast.
# incremental_fee_per_vb defaults to 0.1 sat/vB (Core 30.0+); a node may
# still reject on rule 6 if the diagram does not strictly improve.

# Option B: CPFP
child_vsize ≈ 110          # 1 input from parent change, 1 output
package_vsize = vsize + child_vsize
desired_package_fee = needed_rate * package_vsize
child_fee = desired_package_fee - existing_fee
build child spending parent change, broadcast (or submitpackage).
```

## Common pitfalls

- Assuming a replacement may **not add new unconfirmed inputs** — BIP125
  rule 2 was removed; the binding constraint is now the rule 6 feerate
  diagram.
- Computing fee rate against `size` instead of `vsize` for SegWit txs.
- Forgetting rule 4: every added vbyte needs paid bandwidth at
  `incrementalrelayfee`.
- Hardcoding `incrementalrelayfee = 1 sat/vB`; the default has been
  0.1 sat/vB since Core 30.0 (October 2025), and it is configurable.
- Bumping by a hair over the old absolute-fee test and expecting acceptance:
  on a non-singleton cluster rule 6 can still reject the replacement.
- Trying to CPFP a P2WSH output with no anchor that is already at the
  bottom of mempool — the chain must respect the 64-tx / 101 kB cluster
  limits.
- Assuming opt-in semantics: full-RBF has been the default since Core 28.0
  (October 2024) and the `-mempoolfullrbf` toggle is gone since 29.0.
