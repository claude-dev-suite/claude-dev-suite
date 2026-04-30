---
name: bitcoin-psbt
description: |
  Partially Signed Bitcoin Transaction format: BIP174 (v0), BIP370 (v2),
  BIP371 (Taproot fields). Roles (Creator, Updater, Signer, Combiner,
  Finalizer, Extractor), required fields per input/output type,
  Taproot-specific fields (tap_key_sig, tap_script_sig, tap_leaf_script,
  tap_bip32_derivation), magic bytes, separators.
  USE WHEN: building/signing/coordinating PSBTs, debugging "why won't
  my hardware wallet sign", cross-vendor multisig flows.
allowed-tools: Read, Grep, Glob
---

# PSBT (BIP174 / BIP370 / BIP371)

PSBT = a binary container for a transaction-in-progress, where one party
constructs the skeleton, others contribute signatures, and a finalizer
emits the broadcastable transaction.

## Versions

- **v0 (BIP174)** — original. Magic `psbt\xff`. Tx is fully serialized
  in `PSBT_GLOBAL_UNSIGNED_TX`.
- **v2 (BIP370)** — version field, per-input/output amount fields.
  Allows incremental construction without re-encoding the whole tx.
  Required for some workflows (BOLT12, advanced taproot).
- **BIP371** adds Taproot-specific fields (orthogonal to version).

## Roles

| Role | Responsibility |
|------|---------------|
| **Creator** | Builds initial PSBT skeleton (inputs, outputs, no sigs). |
| **Updater** | Adds metadata: `non_witness_utxo`, `witness_utxo`, derivation paths, redeem/witness scripts, taptree info. |
| **Signer** | Reads PSBT, produces partial sigs for inputs it controls. |
| **Combiner** | Merges multiple Signers' partial PSBTs into one. |
| **Finalizer** | Replaces partial sigs with `final_scriptSig` / `final_scriptWitness`. |
| **Extractor** | Pulls final tx from finalized PSBT for broadcast. |

Tools: `walletprocesspsbt`, `combinepsbt`, `finalizepsbt`,
`decodepsbt`, `analyzepsbt` (Bitcoin Core); `hwi signtx` (hardware
wallet); Sparrow/Specter/Caravan for coordination.

## Wire format (v0)

```
[5 bytes]  magic = b"psbt" + 0xff
[ globals section ]
[ for each input:  inputs section, terminated by 0x00 ]
[ for each output: outputs section, terminated by 0x00 ]
```

Each section is a series of `<key, value>` pairs:
```
[varint] key length
[1 byte] key type
[..]     key data
[varint] value length
[..]     value data
```

End of section = 0x00 byte (zero-length key).

## Required input fields by output type being spent

| Output type | Required |
|-------------|----------|
| **Legacy P2PKH/P2SH** | `non_witness_utxo` (full prev tx) |
| **SegWit v0 (P2WPKH/P2WSH)** | `witness_utxo` (just the spent output) **AND** `non_witness_utxo` recommended (defends against fee-bumping attack on signing devices) |
| **P2SH-wrapped SegWit** | both, plus `redeem_script` |
| **P2WSH** | `witness_script` |
| **Taproot key-path** | `witness_utxo` + `taproot_internal_key` + `tap_bip32_derivation` |
| **Taproot script-path** | above + `tap_leaf_script` (script + control block) + `tap_script_sig` |

Always include **all spent prevouts** for Taproot inputs — sighash
commits to all of them (BIP341).

## Key BIP174 fields (selected)

| Section | Type | Name |
|---------|------|------|
| Global | 0x00 | `PSBT_GLOBAL_UNSIGNED_TX` |
| Global | 0x01 | `PSBT_GLOBAL_XPUB` |
| Global | 0xfb | `PSBT_GLOBAL_VERSION` (v2 only) |
| Input | 0x00 | `PSBT_IN_NON_WITNESS_UTXO` |
| Input | 0x01 | `PSBT_IN_WITNESS_UTXO` |
| Input | 0x02 | `PSBT_IN_PARTIAL_SIG` |
| Input | 0x03 | `PSBT_IN_SIGHASH_TYPE` |
| Input | 0x04 | `PSBT_IN_REDEEM_SCRIPT` |
| Input | 0x05 | `PSBT_IN_WITNESS_SCRIPT` |
| Input | 0x06 | `PSBT_IN_BIP32_DERIVATION` |
| Input | 0x07 | `PSBT_IN_FINAL_SCRIPTSIG` |
| Input | 0x08 | `PSBT_IN_FINAL_SCRIPTWITNESS` |
| Input | 0x13 | `PSBT_IN_TAP_KEY_SIG` (BIP371) |
| Input | 0x14 | `PSBT_IN_TAP_SCRIPT_SIG` |
| Input | 0x15 | `PSBT_IN_TAP_LEAF_SCRIPT` |
| Input | 0x16 | `PSBT_IN_TAP_BIP32_DERIVATION` |
| Input | 0x17 | `PSBT_IN_TAP_INTERNAL_KEY` |
| Input | 0x18 | `PSBT_IN_TAP_MERKLE_ROOT` |
| Output | 0x00 | `PSBT_OUT_REDEEM_SCRIPT` |
| Output | 0x01 | `PSBT_OUT_WITNESS_SCRIPT` |
| Output | 0x02 | `PSBT_OUT_BIP32_DERIVATION` |
| Output | 0x05 | `PSBT_OUT_TAP_INTERNAL_KEY` |
| Output | 0x06 | `PSBT_OUT_TAP_TREE` |
| Output | 0x07 | `PSBT_OUT_TAP_BIP32_DERIVATION` |

Proprietary fields use type `0xfc` with key prefix.

## Encoding helpers

PSBT can be encoded as:
- Binary (canonical wire format).
- Base64 (most common transport between wallets).
- Hex (less common, larger).

A "PSBT object" with the right magic bytes round-trips losslessly.

## Common bugs

- Missing `non_witness_utxo` for SegWit inputs on hardware signers
  → device refuses to sign (post Coinkite/Trezor/Ledger fix for
  fee-bumping attack).
- Wrong `bip32_derivation` paths → device cannot find the key.
- Combining PSBTs from different versions (v0 ↔ v2) → format error.
- Missing `tap_internal_key` for Taproot inputs → finalizer cannot
  reconstruct script-path / verify key-path.
- Calling Finalizer before all required signers contributed → leaves
  partial sigs in place; tx will be invalid if extracted.

## See also

- [descriptors/SKILL.md](../descriptors/SKILL.md)
- [taproot/SKILL.md](../taproot/SKILL.md)
- [../../wallets/hd/SKILL.md](../../wallets/hd/SKILL.md)
- [../../hardware/psbt-flows/SKILL.md](../../hardware/psbt-flows/SKILL.md)
