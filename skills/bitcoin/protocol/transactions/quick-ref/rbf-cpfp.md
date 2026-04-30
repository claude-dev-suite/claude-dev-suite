# RBF and CPFP

## Replace-by-Fee (BIP125)

Opt-in RBF: a tx is replaceable iff **at least one** of its inputs has
`nSequence < 0xfffffffe`. Convention: set sequence to `0xfffffffd`.

### BIP125 replacement rules

1. The replacement tx pays an absolute fee greater than all txs being
   replaced.
2. The replacement does not add new unconfirmed inputs.
3. The number of original txs (and descendants) replaced is ≤ 100.
4. The replacement pays a fee rate ≥ all replaced txs.
5. The replacement pays at least the minimum relay fee
   (`incrementalrelayfee = 1 sat/vB` by default) extra per added vbyte.

### Full-RBF

- Bitcoin Core 24.0+: `mempoolfullrbf=1` allows replacement even of
  non-opt-in txs.
- Bitcoin Core 28.0 (sept 2024) made full-RBF the **default**.
- Implications: 0-conf assumptions are gone for any well-connected
  receiver — wallets should monitor mempool and not credit unconfirmed.

## Child-Pays-For-Parent (CPFP)

CPFP = bumping a parent's effective fee rate by spending its output(s)
in a child tx with high enough fee that the **package** average rate
clears the next block.

### Mempool ancestor/descendant package rules

- Default ancestor limit: 25 txs / 101 kvB.
- Default descendant limit: 25 txs / 101 kvB.
- Package CPFP (BIP331, post-2024): mempool accepts **packages** atomically;
  child can include parent fee even if parent alone is below mempool
  min fee rate. `submitpackage` RPC.

### TRUC v3 (BIP431)

For Lightning-class fee bumping:
- Parent v3, child v3, ≤1 unconfirmed ancestor, ≤1 descendant.
- Ephemeral anchor (value=0, trivial script) must be spent in same package.
- Child can pay 0 fee; package fee must be carried by an additional
  child input.

## Fee bump algorithm (typical wallet)

```
needed_rate = target_rate                    # e.g. 30 sat/vB
existing_fee = sum(in) - sum(out)
existing_rate = existing_fee / vsize
if existing_rate >= needed_rate: nothing to do

# Option A: RBF (if opted-in or full-RBF mempool)
new_fee = max(existing_fee + incremental_fee_per_vb * vsize,
              needed_rate * vsize)
build replacement with new_fee, broadcast.

# Option B: CPFP
child_vsize ≈ 110          # 1 input from parent change, 1 output
package_vsize = vsize + child_vsize
desired_package_fee = needed_rate * package_vsize
child_fee = desired_package_fee - existing_fee
build child spending parent change, broadcast (or submitpackage).
```

## Common pitfalls

- RBF replacement that **adds new unconfirmed inputs** → rejected
  (rule 2).
- Computing fee rate against `size` instead of `vsize` for SegWit txs.
- Forgetting BIP125 rule 5: every added vbyte needs paid bandwidth.
- Trying to CPFP a P2WSH output with no anchor that is already at the
  bottom of mempool — descendants must respect package limits.
- Assuming opt-in semantics post-Core 28.0 when full-RBF is default.
