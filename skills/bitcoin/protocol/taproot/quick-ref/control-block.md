# Taproot control block layout

Last element of the witness stack on a script-path spend.

## Bytes

```
[0]            leaf version | parity_of_Q
[1..33]        internal pubkey P (32 bytes, x-only)
[33..33+32m]   merkle path: one 32-byte sibling hash per level (m levels)
```

- `leaf_version` low 7 bits, low bit of byte 0 = parity_of_Q.
- Currently `leaf_version = 0xc0` (Tapscript base). Future leaf
  versions can be added by soft fork (interpret 0xc0 today, ignore
  unknown leaf versions = `OP_SUCCESS` semantics).
- Max merkle path depth: 128 levels.

## Validation algorithm

```
Verifier:
  1. Read scriptPubKey: must be OP_1 <Q_x>.
  2. Read control block C, leaf script S (last two witness items).
  3. parity = C[0] & 1
  4. lv     = C[0] & 0xfe          # leaf version
  5. P      = C[1..33]
  6. path   = [C[33+i*32 .. 33+(i+1)*32] for i in 0..m]
  7. k = TapLeafHash(lv, S)
     for h in path:
       k = TapBranchHash(k, h)
  8. t = TaggedHash("TapTweak", P || k)
  9. expected_Q = lift_x(P) + t*G,
     with y parity matched against `parity`.
  10. require expected_Q.x == Q_x.
```

If steps 1–10 succeed, the script `S` is then executed under Tapscript
semantics with the witness stack (excluding S and C) as initial stack.

## Building the merkle path

Given a script tree (e.g., 3 leaves):
```
       root
      /    \
     a      c
    / \
   l1  l2
       (leaf l3 = c)
```

For leaf `l1`:
- TapLeafHash(0xc0, l1) → k1
- sibling = TapLeafHash(0xc0, l2) = k2
- after merge: a = TapBranchHash(k1, k2)
- sibling level above = c = TapLeafHash(0xc0, l3)
- root = TapBranchHash(a, c)
- merkle path for l1 = [k2, c]

Each level appends 32 bytes to the control block.

## Cost analysis

- Empty taptree: control block is 33 bytes.
- 1-leaf taptree: 33 bytes (no path).
- Depth-m taptree: 33 + 32m bytes.
- Witness discount: 4× — so cost in vB ≈ (33 + 32m) / 4.
- Choose tree shape so the most-likely spend path has the **shortest**
  merkle proof.

## Leaf versions

Currently only `0xc0` (Tapscript) is consensus-active. Future leaf
versions: anything with same top 7 bits + appropriate parity bit
allocation. Existing nodes treat unknown leaf versions as
`OP_SUCCESS` (script trivially valid) → enables future opcodes
via soft fork.

## Common bugs

- Using leaf version `0x00` instead of `0xc0` → today valid only as
  anyone-can-spend; do not use until a future BIP defines it.
- Concatenating siblings in wrong order — TapBranchHash sorts by
  byte order before hashing.
- Forgetting parity bit in byte 0.
