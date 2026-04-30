---
name: bitcoin-segwit
description: |
  Segregated Witness: BIP141 (consensus), BIP143 (sighash), BIP144 (P2P
  serialization), BIP173 (Bech32 address). Witness segregation,
  weight units, txid vs wtxid, witness commitment.
  USE WHEN: working with native segwit (P2WPKH/P2WSH), embedded segwit
  (P2SH-P2WPKH/P2SH-P2WSH), or understanding the witness discount.
allowed-tools: Read, Grep, Glob
---

# SegWit (BIP141 family)

Activated August 2017. Moved signatures and other auxiliary data into
a new **witness** section that is **not** included in `txid` hashing.

## Goals achieved

1. **Fixed transaction malleability** for SegWit-only inputs.
2. **Weight discount** — witness bytes count 1 WU (vs 4 WU for base).
   Effective block size cap rose from 1 MB to ~4 MWU.
3. **Linear sighash** (BIP143) — O(n) signing instead of O(n²) for
   multi-input txs.
4. **Soft-fork upgrade path** — version field on witness program enables
   future versions (1 = Taproot).

## Witness program structure

`scriptPubKey` for SegWit outputs:

```
<version_byte> <data_push>
```

Version byte = `OP_0` (v0), `OP_1` (v1 = Taproot, BIP341). Future
versions reserved.

Length of data push determines type:
- v0, 20 bytes: P2WPKH
- v0, 32 bytes: P2WSH
- v1, 32 bytes: P2TR
- Other v0 lengths: invalid (consensus failure post-activation).
- v2..v16 with **any** length: forward-compat (anyone-can-spend until
  future soft fork).

## Address encoding (BIP173 / BIP350)

- Bech32 (BIP173) for v0 → `bc1q...` (mainnet), `tb1q...` (testnet).
- **Bech32m** (BIP350) for v1+ → `bc1p...`. Different checksum constant
  to fix BIP173 length-extension bug.

Encoding helpers usually check the witness version byte and
auto-select Bech32 vs Bech32m.

## Embedded SegWit (legacy compat)

For wallets that can only produce P2SH addresses:

- **P2SH-P2WPKH**:
  - `scriptPubKey = OP_HASH160 <H160(redeemScript)> OP_EQUAL`
  - `redeemScript = OP_0 <H160(pk)>`
  - `scriptSig = OP_PUSH(redeemScript)`
  - `witness = [<sig>, <pk>]`
- **P2SH-P2WSH**: similar with 32-byte witness program.

## Sighash (BIP143)

For SegWit v0 inputs, sighash is computed over a precomputed digest:
`hashPrevouts || hashSequence || outpoint || scriptCode || amount ||
nSequence || hashOutputs || nLockTime || nHashType`.

Two key facts:
1. The **input amount** is committed → fee-bumping attack with old
   signatures is detected (each input value is signed).
2. `hashPrevouts`, `hashSequence`, `hashOutputs` are reused across all
   inputs → O(n) total cost.

Taproot (BIP341) supersedes this with an even cleaner digest.

## P2P relay (BIP144)

- Old nodes see SegWit transactions as anyone-can-spend (witness
  stripped).
- New nodes use service flag `NODE_WITNESS` (1 << 3) to advertise
  witness support.
- Block download: `getdata` with type `MSG_WITNESS_BLOCK` for full
  witness data.

## Common gotchas

- Forgetting `marker/flag` (0x00, 0x01) bytes when serializing for
  network → wire-format invalid.
- Computing `txid` over the segwit serialization (with witness) →
  wrong, must strip witness for txid.
- Using P2SH-P2WPKH addresses (`3...`) when wallet supports native
  P2WPKH (`bc1q...`) → wastes ~10 vB per input.
- Mixing v1 (Taproot) outputs and assuming Bech32 addresses → must use
  Bech32m, otherwise checksum is rejected by spec-compliant wallets.

## See also

- [transactions/SKILL.md](../transactions/SKILL.md)
- [taproot/SKILL.md](../taproot/SKILL.md)
- [scripts/SKILL.md](../scripts/SKILL.md)
