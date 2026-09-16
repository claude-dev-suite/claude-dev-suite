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
| **Modified BIP9** (BIP8-style mandatory signaling) | BIP110 “reduced_data”, 2026 — failed | bit 4, threshold 1109/2016 (55%), `NO_TIMEOUT` |

Thresholds are per deployment, not a BIP9 constant: BIP9 specifies 1916/2016
(95%) on mainnet and SegWit used it; Taproot's Speedy Trial used 1815/2016
(90%), which is still Core's mainnet default.

BIP110 is the most recent mainnet attempt. Its mandatory-signaling
window opened at block 961,632 (2026-08-08) and mainnet did not signal bit 4,
so enforcing nodes split onto a branch that mined two blocks in ~8 hours; the
BIPs repo moved BIP110 to **Closed** on 2026-08-10. No BIP110 rule is in force
as of September 2026.

## nLockTime / nSequence semantics (key for layer-2)

- `nLockTime`: tx valid only after specified block-height or unix-time.
- `nSequence` per-input:
  - `0xFFFFFFFF` → final, disables `nLockTime` for that input.
  - `0xFFFFFFFE` → does not signal opt-in RBF (BIP125). Signalling is
    moot for relay: full-RBF is the Core default since v28.0 (Oct 2024).
  - `< 0xFFFFFFFE` → signals opt-in RBF.
  - **BIP68 relative locktime** when input's tx version ≥ 2:
    - bit 31 = 0 → relative time enforced
    - bit 22 = 0 → block-height units, =1 → 512s units
    - low 16 bits = the lock value

## Consensus vs Policy

| Layer | Examples | Where defined |
|-------|----------|---------------|
| **Consensus** | block size weight ≤ 4M WU, sigops ≤ 80k, nLockTime, output value rules | `src/consensus/` in Core |
| **Standardness** | non-standard scripts rejected by mempool, dust threshold, `MAX_STANDARD_TX_WEIGHT=400k`, replaceability, cluster limits | `src/policy/` |

A tx that is **non-standard** but **consensus-valid** can be mined (via
direct submission to a miner like `mempool.space accelerator`) and is
valid in a block.

## Recent additions

- **Cluster mempool (Bitcoin Core 31.0, April 2026)** — the mempool no
  longer enforces ancestor/descendant size or count limits. Connected
  components ("clusters") are capped instead: 64 txs and 101 kvB
  (`-limitclustercount` / `-limitclustersize`). RBF now requires the
  resulting mempool feerate diagram to be strictly better; the CPFP
  carveout is gone (use TRUC + sibling eviction). Still current in 31.1
  (July 2026).
- **Opportunistic 1p1c relay (Bitcoin Core 28.0, October 2024)** — a
  parent below the mempool min feerate is paired with one child and
  evaluated as a package over the **existing** tx-relay protocol;
  `submitpackage` (26.0, December 2023) does the same locally.
  **BIP331 (“Ancestor Package Relay”) is still Status: Draft as of
  September 2026** and its `sendpackages` / `pkgtxns` P2P messages have
  never shipped — see [package-relay/SKILL.md](../package-relay/SKILL.md).
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
