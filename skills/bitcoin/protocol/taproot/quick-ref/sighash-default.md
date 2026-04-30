# Taproot sighash differences (BIP341)

## Old vs new

| Property | Legacy / BIP143 | BIP341 |
|----------|-----------------|--------|
| Default flag | none — must specify ALL | `SIGHASH_DEFAULT` (0x00) = ALL |
| Sig length when default | n/a | 64 bytes (no sighash suffix) |
| Commits to all spent values | only current input's value | **all** prevout amounts |
| Commits to all spent scriptPubKeys | only current's | **all** spent SPKs |
| Annex commitment | n/a | yes, if present |
| Hash function | SHA256d (BIP143) | SHA256 once + tagged-hash framework |

## Why "commits to all spent" matters

Pre-BIP341, a malicious co-signer could change the **value** of inputs
not yet signed, and your signature would still verify against your
input alone. The aggregator then submits a tx with different fees.

BIP341 fixes this by including all spent amounts in every input's
sighash. A signature is bound to the entire set of input values + SPKs.

## Sighash flag values

```
SIGHASH_DEFAULT      = 0x00   # cleanest; equivalent to ALL
SIGHASH_ALL          = 0x01
SIGHASH_NONE         = 0x02
SIGHASH_SINGLE       = 0x03
| SIGHASH_ANYONECANPAY = 0x80
```

If non-default, append the byte to the 64-byte signature → 65 bytes
total in the witness.

## Schnorr sig vs ECDSA sig in witness

ECDSA (legacy/segwit v0):
- DER-encoded `(r, s)` — variable 70-72 bytes typically.
- Always followed by sighash byte → 71-73 bytes total.
- Low-s mandatory (BIP146).

Schnorr (Taproot):
- Raw `(r, s)` concatenation, 64 bytes flat.
- Optional sighash byte → 64 or 65 bytes.
- No low-s issue (Schnorr is canonical by construction).
- Cheaper to verify, supports batch verification.

## Signing pseudocode

```
m = bip341_sighash(tx, input_index, prevouts, sighash_type)
# prevouts = list of (value, scriptPubKey) for ALL inputs

if sighash_type == SIGHASH_DEFAULT:
    sig = schnorr_sign(seckey, m)   # 64 bytes
else:
    sig = schnorr_sign(seckey, m) + bytes([sighash_type])  # 65 bytes
```

## Test vectors

BIP341 has reference test vectors covering 8 distinct cases (key path
+ several script paths with different leaf depths). Always validate
against these.
