# Taproot tweak math

The taproot tweak ties an internal pubkey `P` to a script tree root
(or to nothing) such that:
- The public output key `Q = P + t*G` is unique per (P, R) pair.
- Spending key-path requires knowing `p + t` (the tweaked private key),
  which the original key holder can derive (since they know `p`).
- Spending script-path requires revealing P + a leaf + a path to it.

## Tagged hash framework (BIP340)

```
TaggedHash(tag, msg) = SHA256(SHA256(tag) || SHA256(tag) || msg)
```

Used for `t`:
```
t = int( TaggedHash("TapTweak", P_x || R) )  mod n
```
Where `n` is the secp256k1 group order, `P_x` is the 32-byte x-coordinate
of `P`, `R` is the 32-byte merkle root (or empty bytes if no scripts).

## TapLeafHash

```
TapLeafHash(leaf_version, script) =
  TaggedHash("TapLeaf", leaf_version || compact_size(len(script)) || script)
```

`leaf_version` is currently `0xc0` (= base Tapscript, BIP342).

## TapBranchHash

For an internal node combining two children:
```
TapBranchHash(a, b) = TaggedHash("TapBranch", min(a,b) || max(a,b))
```

The min/max sort makes the merkle proof depend only on the multiset of
hashes (no canonical "left" vs "right"). Means proof bytes are the same
regardless of tree-rotation choices.

## Spending derivations

- `Q_x` is the 32 bytes in scriptPubKey.
- `Q = lift_x(Q_x)` chooses the even-Y point.
- During key-path signing: tweaked private key `q = (p + t) mod n`,
  with parity adjustment if `lift_x(P).y` is odd or if `Q.y` is odd
  after tweak.

## Reference implementation pattern

```python
# pseudo-code, follows BIP341 Test Vectors exactly
def taproot_tweak_pubkey(P_x, R):
    t = tagged_hash("TapTweak", P_x + R)
    P = lift_x(P_x)
    Q = P + t * G
    return Q.has_even_y(), Q.x_bytes()    # parity, Q_x

def taproot_tweak_seckey(p, R):
    P = p * G
    if not P.has_even_y():
        p = n - p
    t = tagged_hash("TapTweak", P.x_bytes() + R)
    return (p + t) % n
```

## Common errors

- Forgetting `lift_x(P)` may flip the y-coordinate; the tweaked private
  key derivation must match. Test against BIP341 vectors.
- Hashing without the tagged-hash domain separation → incompatible
  with consensus.
- Sorting children in TapBranchHash by hash bytes vs by index — must
  be by hash (lexicographic on serialized bytes).
