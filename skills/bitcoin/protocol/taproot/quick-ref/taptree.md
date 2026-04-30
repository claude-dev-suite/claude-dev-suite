# Building a Taproot script tree

## Design principle

Taproot lets you commit to a **set of alternative spending conditions**
in a single output. Each condition is a **leaf** in a Merkle tree.
Only the leaf you actually use is revealed at spend time.

Total cost ≈ leaf script bytes + merkle path bytes — minimize for the
**likely** spend path.

## Choosing tree shape

| Shape | Best when |
|-------|-----------|
| Single leaf | One alternative path beyond key-path |
| Balanced binary | All paths equally likely |
| Skewed (likely-path shallow) | One path is dominant; others are emergency |

Rule of thumb: hot/common path at depth 0 or 1; cold/recovery path can
be deep.

## Example: single-sig + 2-of-3 emergency multisig + timelock recovery

Internal pubkey `P` = aggregated MuSig2 of (Alice, Bob).
Tree:
```
root
├── leaf_a:   <pkA> CHECKSIG <pkB> CHECKSIGADD <pkC> CHECKSIGADD 2 NUMEQUAL
└── leaf_b:   <144> CSV DROP <pk_recovery> CHECKSIG
```

- Cooperative spend: key-path with MuSig2 (cheapest, private).
- 2-of-3 multisig path: reveal `leaf_a` + 2 sigs.
- After 144 blocks, `leaf_b` enables recovery via single key.

## Constructing the merkle root

```python
leaf_a_hash = TapLeafHash(0xc0, leaf_a_script)
leaf_b_hash = TapLeafHash(0xc0, leaf_b_script)
root = TapBranchHash(leaf_a_hash, leaf_b_hash)   # auto-sort
```

Then `Q = P + TaggedHash("TapTweak", P_x || root) * G`.

## Encoding for descriptors

`tr(KEY, {leaf_a, leaf_b})` — descriptor language denotes the tree
inline. Sub-trees: `tr(KEY, {leaf, {sub_leaf_1, sub_leaf_2}})`.

## Script policy → taptree

When using miniscript-extended policies (`tr(KEY, ms_policy)`), tools
like `bitcoin-cli getdescriptorinfo` and `rust-miniscript` emit the
taptree. Generally:

1. Compile policy to alternative miniscripts (one per OR branch).
2. Each branch becomes a leaf.
3. Order by likelihood (declared via `prob` or inferred from script
   structure).
4. Build a Huffman-like tree: most likely branches at shallowest depth.

## Maximum tree size

Consensus: control block max 128 merkle levels (= 4096 + 33 bytes).
Practical: 2-4 levels is enough for most schemes. Going deeper costs
witness bytes.

## Edge cases

- **No scripts at all**: pass `R = ""` (empty 32-byte string) to the
  tweak — many implementations have a special "no taptree" path.
- **Single leaf**: control block has zero merkle path bytes (33 bytes).
- **Same leaf twice**: BIP341 allows duplicates; sorting in
  TapBranchHash handles them.
