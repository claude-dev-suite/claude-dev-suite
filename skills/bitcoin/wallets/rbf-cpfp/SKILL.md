---
name: bitcoin-rbf-cpfp
description: |
  Replace-by-Fee (BIP125, full-RBF) and Child-Pays-For-Parent fee
  bumping. Mempool ancestor/descendant rules, package CPFP (BIP331),
  TRUC v3 (BIP431). Wallet-level fee bump strategies.
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
1. Build initial tx with sequence < 0xfffffffe on at least one input
   (signals opt-in RBF). Default to 0xfffffffd.
2. Sign and broadcast.
3. After N blocks of non-confirmation OR explicit user request:
   a. Estimate new fee rate.
   b. Build replacement: same outputs, possibly different change
      amount (smaller, since more goes to fee).
   c. Verify BIP125 rules: replacement adds no new unconfirmed
      inputs; pays > old fee + incremental_relay × vsize.
   d. Sign and broadcast.
4. Old tx is dropped from mempool; new tx awaits confirmation.
```

## BIP125 replacement rules (simplified)

For replacement `R` of original `O`:
1. R has higher absolute fee than O.
2. R has higher fee rate than O.
3. R does not add new unconfirmed inputs.
4. R replaces ≤ 100 conflicting txs (and their descendants).
5. R pays at least `incrementalrelayfee × R.vsize` extra per added
   vbyte beyond O.

Bitcoin Core 28.0 made **full-RBF** the default — even txs without
opt-in signal (sequence ≥ 0xfffffffe) can be replaced.

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
4. Broadcast child via sendrawtransaction (Core ≤ 28) or
   submitpackage (BIP331).
```

## Receiver-side CPFP

If you're the **receiver** of an unconfirmed payment that's stuck:
- Option A: spend the received output to yourself with high fee.
  Now both txs in mempool; package CPFP includes parent.
- Option B: wait. Sender may RBF on their side.

## Package CPFP (BIP331)

`submitpackage` RPC accepts `[parent, child]` array atomically.
Pre-BIP331, child alone was rejected if parent below mempool min.
Now: package effective rate is computed.

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
- RBF replacement that adds new unconfirmed input from someone else's
  tx → rejected (rule 3).
- Building child that spends a parent output that's already fully
  spent in another descendant → rejected as conflict.
- Computing fee rate against `size` instead of `vsize` → underpays
  for SegWit txs.

## See also

- [fee-estimation/SKILL.md](../fee-estimation/SKILL.md)
- [../../protocol/package-relay/SKILL.md](../../protocol/package-relay/SKILL.md)
- [../../protocol/transactions/quick-ref/v3-truc.md](../../protocol/transactions/quick-ref/v3-truc.md)
