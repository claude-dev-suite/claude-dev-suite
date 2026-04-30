# TRUC v3 transactions (BIP431)

TRUC = "Topologically Restricted Until Confirmation". Version-3 transactions
designed to fix Lightning fee bumping limitations exposed by **replacement
cycling** and **pinning** attacks.

## Constraints (mempool policy)

- `version == 3`.
- `vsize ≤ 10,000 vB`.
- ≤ 1 unconfirmed ancestor (which must also be v3).
- ≤ 1 unconfirmed descendant (which must also be v3).
- Sibling eviction allowed: a v3 child replacing a sibling does **not**
  pay for the sibling's bandwidth (mitigates pinning).

## Ephemeral anchor pattern

Companion concept (separate policy, related deployment):

- An output with `value == 0` and a trivially-spendable script
  (e.g., `OP_TRUE` / `1`).
- Must be spent in the **same package** as its parent (otherwise
  package is rejected).
- Combined with TRUC v3, removes the need for non-zero anchor amounts
  in Lightning's BOLT-3 commitment.

## Why this matters for Lightning

Pre-TRUC commitment with anchor outputs (BOLT-3 update):
- Anchor was 330 sats per side.
- Could be pinned by an attacker who attaches a low-fee descendant to
  the same anchor before you can CPFP it.
- Replacement cycling (paper 2023) exploited the fact that you could
  cycle replacements to delay your honest tx past its CLTV.

Post-TRUC + ephemeral anchors:
- Zero-value anchor → no pinning surface (must be spent immediately).
- v3 ≤1 descendant → attacker cannot stack arbitrary descendants.
- Sibling eviction → fee bumping replaces the bad sibling cleanly.

## Wallet integration

- Set `tx.version = 3` for the commitment.
- Add ephemeral anchor output: `value=0, scriptPubKey=OP_TRUE` (or
  whatever your impl normalizes).
- Build child spending the anchor + a confirmed-or-self-input that
  carries fees.
- Use `submitpackage` RPC (BIP331) to atomically broadcast parent + child.

## Status

Activated as **mempool policy** in Bitcoin Core 28.0 (Sept 2024). Not
a consensus change — older nodes will still validate v3 txs as plain
v3 transactions if the activation block is found.

## See also

- [package-relay/SKILL.md](../../package-relay/SKILL.md) — BIP331
- [transactions/SKILL.md](../SKILL.md)
- [../../../lightning/replacement-cycling/SKILL.md](../../../lightning/replacement-cycling/SKILL.md)
