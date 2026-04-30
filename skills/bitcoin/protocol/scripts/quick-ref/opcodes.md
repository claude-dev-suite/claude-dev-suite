# Bitcoin Script opcode reference

## Constants
- `OP_0` (0x00) — push empty bytes (treated as 0).
- `OP_PUSHBYTES_N` (0x01–0x4b) — push next N bytes.
- `OP_PUSHDATA1/2/4` (0x4c/0x4d/0x4e) — push next 1/2/4-byte LE length, then data.
- `OP_1NEGATE` (0x4f) — push -1.
- `OP_1`..`OP_16` (0x51–0x60) — push 1..16.

## Flow control
- `OP_NOP` (0x61) — no-op.
- `OP_IF` (0x63), `OP_NOTIF` (0x64), `OP_ELSE` (0x67), `OP_ENDIF` (0x68).
- `OP_VERIFY` (0x69) — abort if top of stack not true.
- `OP_RETURN` (0x6a) — abort. Used for data outputs (provably unspendable).

## Stack
- `OP_TOALTSTACK` (0x6b), `OP_FROMALTSTACK` (0x6c).
- `OP_DROP` (0x75), `OP_DUP` (0x76), `OP_NIP` (0x77), `OP_OVER` (0x78).
- `OP_PICK` (0x79), `OP_ROLL` (0x7a), `OP_SWAP` (0x7c), `OP_TUCK` (0x7d).
- `OP_2DROP`/`OP_2DUP`/`OP_3DUP`/`OP_2OVER`/`OP_2ROT`/`OP_2SWAP`.

## Splice (mostly disabled)
- `OP_CAT` (0x7e) — DISABLED on legacy/segwit. **Re-proposed for Tapscript** (BIP CAT-revival).
- `OP_SUBSTR`, `OP_LEFT`, `OP_RIGHT` — disabled.
- `OP_SIZE` (0x82) — push byte length of top stack item.

## Bitwise
- `OP_AND`, `OP_OR`, `OP_XOR` — disabled.
- `OP_EQUAL` (0x87), `OP_EQUALVERIFY` (0x88).

## Arithmetic
- `OP_1ADD` (0x8b), `OP_1SUB` (0x8c).
- `OP_NEGATE` (0x8f), `OP_ABS` (0x90), `OP_NOT` (0x91), `OP_0NOTEQUAL` (0x92).
- `OP_ADD` (0x93), `OP_SUB` (0x94).
- `OP_MUL`/`OP_DIV`/`OP_MOD`/`OP_LSHIFT`/`OP_RSHIFT` — disabled.
- `OP_BOOLAND`, `OP_BOOLOR`, `OP_NUMEQUAL`, `OP_NUMEQUALVERIFY`,
  `OP_NUMNOTEQUAL`, `OP_LESSTHAN`, `OP_GREATERTHAN`, `OP_LESSTHANOREQUAL`,
  `OP_GREATERTHANOREQUAL`, `OP_MIN`, `OP_MAX`, `OP_WITHIN`.

Numbers in script are **little-endian, sign-magnitude**, max 4 bytes.

## Crypto
- `OP_RIPEMD160`, `OP_SHA1`, `OP_SHA256`, `OP_HASH160` (RIPEMD160(SHA256(x))),
  `OP_HASH256` (SHA256d).
- `OP_CODESEPARATOR` (0xab) — affects sighash computation; rarely used.
- `OP_CHECKSIG` (0xac), `OP_CHECKSIGVERIFY` (0xad).
- `OP_CHECKMULTISIG` (0xae), `OP_CHECKMULTISIGVERIFY` (0xaf).
  - Bug: consumes 1 extra stack item (the "null" / extra arg).
  - **Disabled in Tapscript**, replaced by `OP_CHECKSIGADD`.
- `OP_CHECKSIGADD` (0xba, Tapscript only) — k-of-n with explicit
  counter, replaces `OP_CHECKMULTISIG`.

## Locktime
- `OP_CHECKLOCKTIMEVERIFY` / `OP_CLTV` (0xb1, BIP65) — abort if
  `nLockTime < top_of_stack` or sequence final.
- `OP_CHECKSEQUENCEVERIFY` / `OP_CSV` (0xb2, BIP112) — abort if
  relative-locktime not satisfied.

## Reserved / NOPs
- `OP_NOP1`..`OP_NOP10` (excluding NOP2/NOP3 which became CLTV/CSV).
  Soft-fork upgrade hooks.

## Tapscript-specific changes (BIP342)

- New opcode `OP_CHECKSIGADD`.
- `OP_CHECKMULTISIG`/`OP_CHECKMULTISIGVERIFY` → **disabled**.
- Strict push semantics enforced (`MINIMALPUSH`).
- Discouraged opcodes (`OP_NOP1`..) reserved for future leaf versions.
- No 520-byte stack item limit; stack items can be up to 4 MB
  (block weight limit is the only constraint).
