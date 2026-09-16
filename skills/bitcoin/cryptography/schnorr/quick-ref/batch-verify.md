# BIP340 Schnorr batch verification

Schnorr's linearity enables verifying n signatures roughly together
faster than n individual verifications.

## Single verification recap

For one sig `(r, s)` over msg `m` and pubkey `P`:
```
e = TaggedHash("BIP0340/challenge", r || P_x || m)
verify: s*G - e*P == R   (where R has x = r and even y)
```

This requires 2 scalar multiplications.

## Batch verification

Given n triples `(P_i, m_i, sig_i)` we want to verify all of them.

Naive: n × 2 = 2n scalar mults.

Batch:
```
For i in 1..n: a_1 = 1, a_i = uniform random in [1, 2^128).
  e_i = TaggedHash("BIP0340/challenge", r_i || P_ix || m_i)
  s_i, r_i, lift_x of P_i computed.

Check:
  (sum_i a_i * s_i) * G  ==  sum_i a_i * R_i + sum_i a_i * e_i * P_i

Where R_i = lift_x(r_i, even_y).
```

This is **one** multi-scalar multiplication of length 1 + 2n. Using
optimized algorithms (Pippenger / Bos-Coster), this is O(n / log n)
group ops total — substantially faster than the 2n individual mults.

## Random a_i protection

The random coefficients `a_i` prevent an attacker from constructing a
batch where individual sigs are invalid but their linear combination
verifies. Coefficients should be:
- Cryptographic-quality random (CSPRNG).
- ≥ 128 bits.
- `a_1 = 1` is safe (and common — anchors the system).

## Failure handling

If batch fails:
- A single corrupt sig could be the culprit.
- Strategy: split batch in half, recurse → O(log n) batches to find
  the bad one. Or fall back to individual verification.
- Some implementations just return "batch failed" without identifying
  the bad sig — caller decides whether to bisect.

## Where batch verify would pay off

Theoretical, not deployed: libsecp256k1 exposes no batch-verify API
and Bitcoin Core verifies each Taproot signature individually (as of
September 2026 — see the API section below). The places it would
help:

- **IBD** (initial block download): batch all sigs in a block, then
  whole-block batch.
- **Tx relay**: batch sigs of mempool txs in a batch window.
- **Mempool admit**: per-tx, n inputs → batch within tx is small but
  still helpful.

Speedup typically 2-3x for ~100-1000 sigs. Negligible for a single sig.

## libsecp256k1 API

**There is no batch-verify entry point.** As of libsecp256k1 v0.8.0
(August 2026), `include/secp256k1_schnorrsig.h` declares exactly three
functions, all single-signature:

```c
int secp256k1_schnorrsig_sign32(...);       /* 32-byte message    */
int secp256k1_schnorrsig_sign_custom(...);  /* arbitrary msglen   */
int secp256k1_schnorrsig_verify(...);       /* one signature      */
```

`secp256k1_schnorrsig_verify_batch` has never shipped in a public
header — the only occurrences of that name upstream are `(TODO)`
comments in `src/modules/schnorrsig/tests_impl.h`. The
`secp256k1_scratch_space` struct and its `_create` / `_destroy`
helpers — the usual companion of a multi-scalar API — were removed
from the public API in v0.6.0 (November 2024), "because the scratch
space was unused in the API"; an internal, unexported scratch
implementation survives in `src/scratch.h`.

Batching is therefore the caller's job — built on raw EC arithmetic,
or on a fork that exports libsecp256k1's internal multi-scalar routine
(`secp256k1_ecmult_multi_var`, `static` in `src/ecmult.h`). Bitcoin
Core does not batch: `XOnlyPubKey::VerifySchnorr`
(`src/pubkey.cpp`) calls `secp256k1_schnorrsig_verify` once per
signature, driven by `CheckSchnorrSignature` in
`src/script/interpreter.cpp` (master, September 2026).

## Common pitfalls

- Using `a_i = 1` for all i → trivially forgeable batches.
- Reusing the same `a_i` across batches → some attacks possible.
- Not pre-checking individual sig sizes (64 bytes) → variable-time
  failures leak.
