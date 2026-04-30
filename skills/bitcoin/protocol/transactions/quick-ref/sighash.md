# SIGHASH flag combinatorics

## Legacy / SegWit v0 (BIP143)

Sighash byte = `(base | anyonecanpay)` where:
- `base` ∈ {`ALL`=0x01, `NONE`=0x02, `SINGLE`=0x03}
- `anyonecanpay` = 0x80 if set

| Combo | Hex | Inputs signed | Outputs signed | Use case |
|-------|-----|---------------|----------------|----------|
| `ALL` | 0x01 | All | All | Default. Most txs. |
| `NONE` | 0x02 | All | None | Delegate output choice. Rare. |
| `SINGLE` | 0x03 | All | Output at same index as this input | DLC, escrow with paired io. |
| `ALL\|ACP` | 0x81 | This one | All | Crowdfunding: anyone can add inputs. |
| `NONE\|ACP` | 0x82 | This one | None | Free-form. |
| `SINGLE\|ACP` | 0x83 | This one | Output at same index | Atomic swap, partial signing. |

`SIGHASH_SINGLE` bug (legacy): if no output at the input's index, sighash
is `0x0...01`. Avoid with last-input-only or use SegWit/Taproot.

## Taproot (BIP341)

- `SIGHASH_DEFAULT` = 0x00 → equivalent to ALL but with the new
  BIP341 message digest (cleaner, faster, batch-friendly).
- ALL/NONE/SINGLE with optional ANYONECANPAY same numeric values.
- New digest commits to: tx version, locktime, inputs hash (or single
  prevout if ACP), output hash (or single output if SINGLE), spent
  amounts/spks (for batch validation).

## Witness encoding

- Schnorr (Taproot): if SIGHASH = `SIGHASH_DEFAULT` (0x00), the signature
  is **64 bytes**. Otherwise **65 bytes** with the sighash flag appended.
- ECDSA (legacy/segwit v0): always DER + 1-byte sighash suffix.

## Common pitfalls

- Mixing `ALL` and `SINGLE\|ACP` on the same tx → fee race (other parties
  can drop your fee budget). Always cosign with same flag if collaborative.
- Forgetting to add `0x80` when the workflow expects "anyone can add
  inputs". Result: signature commits to inputs that don't yet exist,
  immediate invalidation when inputs added.
- `SIGHASH_NONE` without `ANYONECANPAY` is rarely correct: it lets anyone
  change outputs on a tx that signs all current inputs (donation
  hijacking).
