---
name: bitcoin-transactions
description: |
  Bitcoin transaction structure: inputs, outputs, witness, version, locktime,
  serialization (legacy + segwit + wtxid), sighash modes, malleability,
  TRUC v3, ephemeral anchors. Quick-ref docs cover sighash combinatorics,
  serialization wire format, malleability classes, RBF/CPFP rules.
  USE WHEN: building/decoding transactions, choosing sighash flags,
  understanding txid vs wtxid, fee bumping logic.
allowed-tools: Read, Grep, Glob
---

# Bitcoin Transactions

> **Quick refs**: [sighash.md](quick-ref/sighash.md), [serialization.md](quick-ref/serialization.md), [malleability.md](quick-ref/malleability.md), [rbf-cpfp.md](quick-ref/rbf-cpfp.md), [v3-truc.md](quick-ref/v3-truc.md)

## Anatomy

```
version (4 bytes)
[marker (0x00) flag (0x01)]    ← only if SegWit, signals witness presence
vin count (varint)
vin[]:
  prevout: { txid (32), vout (4) }
  scriptSig (varint-prefixed)   ← legacy unlocking script
  sequence (4 bytes)
vout count (varint)
vout[]:
  value (8 bytes, sats)
  scriptPubKey (varint-prefixed)
[witness[]]                     ← if marker/flag present, one stack per input
locktime (4 bytes)
```

**Version**: 1, 2 (BIP68 relative locktimes require v≥2), 3 (TRUC, BIP431).

## txid vs wtxid

- `txid = SHA256d(tx without witness data)` — what spends and merkle root
  reference.
- `wtxid = SHA256d(tx with witness)` — what coinbase witness commitment
  uses (BIP141 witness merkle root).
- For legacy non-segwit txs, `txid == wtxid`.

## Inputs & outputs

- **Input** spends a previous output (`txid:vout`) and proves authorization
  via scriptSig + (for SegWit) witness stack. Value = whatever the
  prevout had — never serialized in the spending tx (must be looked up).
- **Output** locks N sats to a `scriptPubKey`. Address formats:
  - P2PKH (`1...`) — `OP_DUP OP_HASH160 <20> OP_EQUALVERIFY OP_CHECKSIG`
  - P2SH (`3...`) — `OP_HASH160 <20> OP_EQUAL`
  - P2WPKH (`bc1q...`) — `OP_0 <20>` (Bech32)
  - P2WSH (`bc1q...`) — `OP_0 <32>` (Bech32)
  - P2TR (`bc1p...`) — `OP_1 <32>` (Bech32m)

## Sighash flags

See [sighash.md](quick-ref/sighash.md) for full combinatorics. Summary:

| Flag | Signs |
|------|-------|
| `ALL` (0x01) | All inputs, all outputs |
| `NONE` (0x02) | All inputs, no outputs (anyone can change outputs) |
| `SINGLE` (0x03) | All inputs, only output at same index |
| `\| ANYONECANPAY` (0x80) | Only this input's prevout (others can be added) |

Taproot adds `SIGHASH_DEFAULT` (0x00 = ALL with new digest) and changes
serialization (BIP341).

## TRUC v3 (BIP431)

- Version=3 marks the tx as TRUC.
- Constraints: `vsize ≤ 10000 vB`, ≤1 unconfirmed ancestor, ≤1 unconfirmed
  descendant, ancestor must also be v3.
- Sibling eviction: a v3 child can replace a sibling without paying for
  the sibling's bandwidth.
- Designed for Lightning anchor / commitment fee bumping: enables 0-fee
  parent + child paying full package fee.

## Ephemeral anchors

"Ephemeral anchor" names two separate policies shipped in two different
releases; see [package-relay/SKILL.md](../package-relay/SKILL.md).

- **Pay-to-Anchor (P2A)** — keyless standard output `OP_1 <0x4e73>`, a
  2-byte witness v1 program (*not* Taproot, whose programs are 32 bytes).
  Standard to spend since Bitcoin Core 28.0 (October 2024); specified by
  BIP433, Status Draft as of September 2026. Default dust limit 240 sat.
- **Ephemeral dust** — Bitcoin Core 29.0 (April 2025) permits one dust
  output, any script type and down to `value=0`, provided the creating tx
  pays **zero fee**.
- The dust must be spent by anything that spends the parent's
  unconfirmed outputs, i.e. in the same package (mempool rule).
- A bare `OP_TRUE` scriptPubKey is **not** a standard output template and
  will not relay; BIP433 presents P2A as the compact replacement for
  `sh(OP_TRUE)`.
- Combined with TRUC v3, replaces BOLT-3's two 330-sat keyed anchor
  outputs with a single keyless `shared_anchor` P2A output under
  `zero_fee_commitments`: 240 sat in the normal case, dropping below
  240 sat (down to 0) only when the commitment has less than that left
  over, in which case the commitment pays zero fee. See BOLT-3
  03-transactions.md, "`shared_anchor` Output (zero_fee_commitments)".

## See also

- [scripts/SKILL.md](../scripts/SKILL.md) — opcodes, output type construction
- [taproot/SKILL.md](../taproot/SKILL.md) — Taproot witness, SIGHASH_DEFAULT
- [psbt/SKILL.md](../psbt/SKILL.md) — partially-signed tx workflow
