---
name: bitcoin-miniscript
description: |
  Miniscript: structured subset of Bitcoin Script with fragment types,
  satisfaction analysis, malleability resistance. Policy → Miniscript
  → Script compilation. Used in descriptors (wsh + tr) and modern
  wallets to express spending conditions safely.
  USE WHEN: composing complex spending conditions, deriving the
  cheapest satisfaction, ensuring scripts are non-malleable.
allowed-tools: Read, Grep, Glob
---

# Miniscript

Miniscript is a **structured subset of Bitcoin Script** with these
properties:

1. **Composable** — fragments combine cleanly, no parser ambiguity.
2. **Analyzable** — every miniscript has a known correctness, malleability,
   and resource analysis.
3. **Satisfiable** — given a set of available signatures/preimages,
   you can derive the cheapest valid witness automatically.
4. **Round-trip with Script** — every miniscript has a unique Script
   serialization and (almost) every Script can be parsed as miniscript.

## Two flavours

- **Legacy miniscript** — for `wsh()` (P2WSH). Uses ECDSA `CHECKSIG`,
  legacy multisig (`OP_CHECKMULTISIG`).
- **Tapscript miniscript** — for `tr()` script paths. Uses Schnorr,
  `OP_CHECKSIGADD` instead of `OP_CHECKMULTISIG`. Different fragment
  semantics in some places (different limits, no `OP_CHECKMULTISIG`).

## Policy language (compiler input)

Higher-level than miniscript; expresses the **what**, not the **how**.

```
pk(K)               # signature from K required
pkh(K)              # legacy hash-locked key
older(n)            # nSequence relative timelock (BIP112)
after(n)            # nLockTime absolute timelock (BIP65)
sha256(H), hash256(H), ripemd160(H), hash160(H)   # preimage reveal
and(A, B)           # both A and B
or(A, B)            # either A or B
or_b(A, B), or_d(...), or_c(...), or_i(...)       # variants
thresh(k, A1, ..., An)   # k of n
multi(k, K1, ..., Kn)    # threshold sig (uses native multisig in legacy)
```

Probabilities can be annotated: `or(99@A, 1@B)` makes A the dominant
spend path; the compiler uses this for shape choice (which branch
goes where in the taptree, which fragment is cheaper).

## Miniscript fragments (selection)

Each fragment has a **type** in {B, V, K, W} and modifier letters
{z, o, n, d, u}:
- `B` Boolean: leaves a 0/1 on stack.
- `V` Verify: leaves nothing, fails if not satisfied.
- `K` Key: leaves a pubkey, used in CHECKSIG composition.
- `W` Wrapped: takes its input from one position back on the stack.

Modifiers describe properties (`z` = no inputs consumed, `o` = consumes
exactly one, `n` = "non-zero" satisfaction, `d` = "dissatisfiable",
`u` = unique satisfaction).

Some example fragments:
- `pk(K)` → `<K> CHECKSIG`
- `pk_k(K)` → `<K>` (just push, used inside other fragments)
- `older(n)` → `<n> CSV`
- `and_v(V, B)` → `V B` concatenation (V leaves nothing, B leaves bool)
- `or_b(B, W)` → uses BOOLOR
- `thresh(k, ...)` → uses ADDs and NUMEQUAL

## Compilation example

Policy:
```
or(99@pk(Hot), and(pk(Cold), older(1008)))
```

Compiler emits a miniscript like:
```
or_d(pk(Hot), and_v(v:pk(Cold), older(1008)))
```

Translates to Script (legacy):
```
<Hot> CHECKSIG
IFDUP NOTIF
  <Cold> CHECKSIGVERIFY
  <1008> CSV
ENDIF
```

The same policy in `tr()` lands in the script tree as a **tapscript**
fragment and is reachable via the script-path. Key-path stays free for
the cooperative case (e.g., MuSig2(Hot, Cold)).

## Satisfaction algorithm

Given a miniscript `M` and a set of available `(sig, preimage,
timelock-OK)` flags, the satisfier returns:
- The cheapest valid witness (in vbytes).
- Or "no satisfaction" if no path works.

Crucial for fee-optimal spending: if the witness has multiple OR
branches, the satisfier picks the one that fits available data.

## Resource analysis

Each fragment has known:
- Static script size.
- Worst-case satisfaction size (witness bytes).
- Sigop cost / Tapscript sigop budget consumption.
- Static guarantee of non-malleability (or known caveats).

Wallets use this to estimate fees accurately even before the script
is satisfied.

## Tapscript miniscript differences

- `multi_a(k, ...)` instead of `multi(k, ...)` — uses CHECKSIGADD.
- 32-byte x-only pubkeys throughout.
- Schnorr 64/65-byte signatures.
- No `older`/`after` time-locks limits the same as legacy (consensus
  unchanged), but witness sizing differs.
- `OP_SUCCESSx` opcodes are forbidden in Tapscript miniscript.

## Implementations

- `rust-miniscript` (most complete)
- `python-miniscript` (port)
- bdk (uses `rust-miniscript`)
- Bitcoin Core integrates miniscript in `wsh()` and `tr()` descriptors.

## Common bugs

- Building a script in raw Script that "looks like" miniscript but
  isn't valid — won't satisfy correctly. Always go via the policy
  compiler.
- Choosing the wrong branch order in `or` without probability
  annotations → suboptimal taptree weighting.
- Forgetting that `older(n)` requires `tx.version ≥ 2`.

## See also

- [scripts/SKILL.md](../scripts/SKILL.md)
- [taproot/SKILL.md](../taproot/SKILL.md)
- [descriptors/SKILL.md](../descriptors/SKILL.md)
- [../../libraries/miniscript-rs/SKILL.md](../../libraries/miniscript-rs/SKILL.md)
