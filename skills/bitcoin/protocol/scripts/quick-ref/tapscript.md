# Tapscript: differences from legacy/SegWit-v0 script

Tapscript = the script language used in **script-path** Taproot spends
(BIP342). Different from key-path (which has no script execution).

## What stays the same

- Stack-based execution.
- Most opcodes work identically (push, arithmetic, hash, IF/ELSE).
- `OP_CHECKLOCKTIMEVERIFY` and `OP_CHECKSEQUENCEVERIFY` still apply.

## What changes

| Aspect | Legacy / SegWit v0 | Tapscript |
|--------|-------------------|-----------|
| Stack item max size | 520 bytes | block weight only (~4 MB) |
| `OP_CHECKMULTISIG`, `OP_CHECKMULTISIGVERIFY` | enabled | **DISABLED** |
| `OP_CHECKSIGADD` | n/a | new (0xba), replaces multisig |
| Sig type | ECDSA, DER | Schnorr (BIP340), 64/65 bytes |
| Sighash | BIP143 (segwit) / legacy | BIP341 message digest |
| Empty signature | invalid for `CHECKSIG` | valid → pushes false (for CHECKSIGADD branches) |
| Public key encoding | 33 (compressed) / 65 (uncompressed) | 32 bytes x-only |
| `OP_SUCCESS` | n/a | OP_SUCCESSx (80, 98, 126-129, 131-134, 137-138, 141-142, 149-153, 187-254) → script succeeds immediately |
| Tagged hash usage | only in some contexts | BIP340 tagged-hash framework everywhere |
| Resource limits | sigops budget per script | sigops budget = floor(witness_weight / 50) per input |
| Push minimality | enforced post-segwit | strictly enforced |

## OP_CHECKSIGADD (replacement for multisig)

```
                        — stack —
... <sig> <num> <pk> CHECKSIGADD
```
- Pops `pk`, `num`, `sig`.
- If `sig == ""`, pushes `num` unchanged.
- Else verifies `sig` against `pk` over BIP341 message; on success
  pushes `num + 1`, on failure aborts.

k-of-n multisig pattern:
```
<pk1> OP_CHECKSIG
<pk2> OP_CHECKSIGADD
<pk3> OP_CHECKSIGADD
<k>   OP_NUMEQUAL
```

## OP_SUCCESS opcodes

Soft-fork upgrade hook: when **any unexecuted** `OP_SUCCESSx` is reached
during execution, script returns success immediately. Lets future
leaf versions repurpose these opcodes via soft fork without breaking
old nodes (which see "OP_SUCCESS").

## Annex (rare)

Witness can include an "annex" (last witness element, prefixed `0x50`).
Currently has no consensus meaning — reserved for future use. Counted
in weight; sometimes used for fee bumping commitments.

## Why Schnorr matters here

- **Linearity** → enables MuSig2 key aggregation off-chain.
- **Batch verification** → sub-linear validation across blocks.
- **No malleability of (r, s)** → simpler signing protocols.
- **Smaller** when using `SIGHASH_DEFAULT` (64 bytes vs ECDSA's
  ~71-72 with sighash byte).
