---
name: bitcoin-consensus
description: |
  Bitcoin consensus rules: block validation, transaction validation,
  soft-fork activation mechanics (BIP9, BIP8, Speedy Trial), nLockTime /
  nSequence semantics, mempool policy vs consensus distinction.
  USE WHEN: discussing what makes a tx/block valid, soft-fork deployment,
  reorg handling, "is this consensus-valid".
allowed-tools: Read, Grep, Glob
---

# Bitcoin Consensus

Bitcoin consensus = the set of rules every full node enforces to decide if
a block / transaction is **valid for inclusion in the chain**. Distinct
from **mempool policy** (which is a node-local default for what tx to
accept and relay).

## Block validation (high-level)

1. Decoded block header is well-formed (80 bytes).
2. `prev_block` exists and points to current best chain (or triggers reorg).
3. Proof-of-work: `SHA256d(header) ≤ target` where target is derived
   from the difficulty re-target window (every 2016 blocks).
4. Block timestamp > median of last 11 blocks (MTP) and ≤ network-adjusted
   time + 2 hours.
5. Coinbase is the first tx, has 1 input with null prevout, scriptSig
   length in [2,100], and includes BIP34 height in scriptSig (active
   since block 227,931).
6. Witness commitment in coinbase's `OP_RETURN` matches the merkle root
   of `wtxid`s (BIP141).
7. Merkle root of `txid`s matches header.
8. All transactions are individually consensus-valid (see below).
9. Total fees + subsidy ≥ coinbase value.

## Transaction validation

1. Non-empty `vin` and `vout`.
2. No negative or `> MAX_MONEY` (21M × 1e8 sats) output amount.
3. No duplicate inputs (within the tx).
4. Coinbase input present iff this is the coinbase tx.
5. For each non-coinbase input: prevout exists in UTXO set and is unspent.
6. Script execution succeeds for `scriptSig + scriptPubKey` and (post-segwit)
   the witness stack.
7. Sum(inputs) ≥ Sum(outputs).
8. nLockTime / nSequence rules (BIP65, BIP112) — see [proposals/](../proposals/SKILL.md).

## Soft-fork activation

| Mechanism | First used | Note |
|-----------|------------|------|
| **BIP9** (versionbits) | CSV (BIP68/112/113), SegWit (initially) | bit signaled in version field; needs 95% of last 2016 |
| **BIP8** (LOT=true/false) | proposed for Taproot, debated | BIP9 + lockinontimeout option |
| **Speedy Trial** (BIP9 short window) | Taproot deployment 2021 | 3-month signaling, 6-month grace |

## nLockTime / nSequence semantics (key for layer-2)

- `nLockTime`: tx valid only after specified block-height or unix-time.
- `nSequence` per-input:
  - `0xFFFFFFFF` → final, disables `nLockTime` for that input.
  - `0xFFFFFFFE` → opt-in RBF disabled (BIP125).
  - `< 0xFFFFFFFE` → opts in to RBF.
  - **BIP68 relative locktime** when input's tx version ≥ 2:
    - bit 31 = 0 → relative time enforced
    - bit 22 = 0 → block-height units, =1 → 512s units
    - low 16 bits = the lock value

## Consensus vs Policy

| Layer | Examples | Where defined |
|-------|----------|---------------|
| **Consensus** | block size weight ≤ 4M WU, sigops ≤ 80k, nLockTime, output value rules | `src/consensus/` in Core |
| **Standardness** | non-standard scripts rejected by mempool, dust threshold, `MAX_STANDARD_TX_WEIGHT=400k`, replaceability, package limits | `src/policy/` |

A tx that is **non-standard** but **consensus-valid** can be mined (via
direct submission to a miner like `mempool.space accelerator`) and is
valid in a block.

## Recent additions

- **Package relay (BIP331)** — mempool now accepts dependent packages,
  enables CPFP for unconfirmed parents at any depth (within ancestor
  limits).
- **TRUC v3 transactions (BIP431)** — version=3, ≤1 unconfirmed ancestor,
  ≤ 10kvB, sibling-eviction, child can pay 0 fee. Pairs with **ephemeral
  anchors** (output value = 0, must be spent in same package).

## See also

- [transactions/SKILL.md](../transactions/SKILL.md) — tx structure, sighash
- [scripts/SKILL.md](../scripts/SKILL.md) — Script language
- [proposals/SKILL.md](../proposals/SKILL.md) — covenants, unactivated forks

## Reference

- Bitcoin Core source: `src/consensus/`, `src/validation.cpp`
- BIPs: 9, 8, 16, 30, 34, 65, 68, 112, 113, 141, 143, 144, 147, 341, 342, 431
