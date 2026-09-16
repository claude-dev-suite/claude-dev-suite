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

Companion concept — really two separate policies with separate
deployments; BIP433 records the split:

- **Pay-to-Anchor (P2A)**, Bitcoin Core 28.0 (October 2024): keyless
  standard output `OP_1 <0x4e73>` — a 2-byte witness v1 program (the
  bytes spell "fees" in bech32m), *not* a Taproot output. Default dust
  limit 240 sat. Standard *to spend* since 28.0.
- **Ephemeral dust**, Bitcoin Core 29.0 (April 2025): one dust output —
  any script type, down to `value == 0` — is allowed if the creating
  transaction pays **zero fee**.
- The dust must be spent by anything spending that transaction's
  unconfirmed outputs, i.e. in the **same package** (otherwise the
  package is rejected).
- A bare `OP_TRUE` scriptPubKey is **not** a standard output template and
  will not relay; P2A is the compact standard replacement for
  `sh(OP_TRUE)`.
- Combined with TRUC v3, lets BOLT-3's `zero_fee_commitments`
  commitment carry one keyless `shared_anchor` P2A output in place of
  the two 330-sat keyed anchors: 240 sat normally, below 240 sat (down
  to 0) only when the commitment has less than that left over, in which
  case the commitment pays zero fee.

## Why this matters for Lightning

Pre-TRUC commitment with anchor outputs (BOLT-3 update):
- Anchor was 330 sats per side.
- Could be pinned by an attacker who attaches a low-fee descendant to
  the same anchor before you can CPFP it.
- Replacement cycling (paper 2023) exploited the fact that you could
  cycle replacements to delay your honest tx past its CLTV.

Post-TRUC + ephemeral anchors:
- One keyless anchor spendable by anyone → no per-party anchor to pin;
  an anchor below 240 sat is ephemeral dust and must be spent in the
  same package.
- v3 ≤1 descendant → attacker cannot stack arbitrary descendants.
- Sibling eviction → fee bumping replaces the bad sibling cleanly.

## Wallet integration

- Set `tx.version = 3` for the commitment.
- Add the anchor output: `scriptPubKey = OP_1 <0x4e73>` (P2A). At
  >= 240 sat it already clears dust; at `value=0` the parent must pay
  zero fee so the ephemeral-dust rule applies.
- Build child spending the anchor + a confirmed-or-self-input that
  carries fees.
- Use `submitpackage` RPC to atomically broadcast parent + child. This is a
  local RPC, not BIP331 package relay — BIP331 is still Draft as of
  September 2026.

## Status

Activated as **mempool policy** in Bitcoin Core 28.0 (October 2024). Not
a consensus change — older nodes will still validate v3 txs as plain
v3 transactions if the activation block is found.

## See also

- [package-relay/SKILL.md](../../package-relay/SKILL.md) — BIP331, P2A,
  ephemeral dust
- [transactions/SKILL.md](../SKILL.md)
- [../../../lightning/replacement-cycling/SKILL.md](../../../lightning/replacement-cycling/SKILL.md)
