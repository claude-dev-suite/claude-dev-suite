# Schnorr / BIP340 — common pitfalls

## 1. Nonce reuse

If you sign two messages `m1, m2` with the **same** nonce `k`:
```
s1 = k + e1*d
s2 = k + e2*d
→ s1 - s2 = (e1 - e2) * d
→ d = (s1 - s2) * (e1 - e2)^-1 mod n
```

Catastrophic key leak. Same as ECDSA, except worse: in MuSig2 / FROST
/ adaptor protocols, nonce reuse can leak across **multiple parties**.

**Always use BIP340's deterministic nonce derivation** with `aux_rand`
mixing. Never accept user-provided nonces.

## 2. Wrong even-y convention

BIP340 forces:
- Pubkey P has even y → adjust private key on key gen.
- Nonce point R has even y → adjust k on sign.

If you skip these adjustments, your sig fails verification with
correct verifier. Check against test vectors.

## 3. Tagged-hash collisions

The framework `TaggedHash(tag, msg)` is the **only** safe way to hash
in BIP340 contexts. Two different protocols using the **same tag** can
produce signature replay across protocols.

- Use `BIP0340/challenge` for Schnorr challenge.
- Use `BIP0340/nonce` for nonce derivation.
- Use `BIP0340/aux` for aux entropy.

For MuSig2: `KeyAgg list`, `KeyAgg coefficient`, `MuSig/nonce`,
`MuSig/noncecoef`. Never reuse a BIP340 tag for a custom purpose.

## 4. Off-curve points / invalid lift

`lift_x(x)` returns None if `(x, y)` for any y is not on curve. Always
check return value before using.

## 5. Assuming the message must be 32 bytes

BIP340 accepts **arbitrary-length** messages since its 2023-04 revision
("Allow messages of arbitrary size" in the BIP's own changelog);
earlier revisions did require exactly 32 bytes. A verifier that
hard-rejects `len(m) != 32` is non-conformant: BIP340 test vectors
15-18 sign messages of 0, 1, 17 and 100 bytes and all expect `TRUE`.

The libsecp256k1 API mirrors the split — `secp256k1_schnorrsig_sign32`
is the 32-byte convenience wrapper, while
`secp256k1_schnorrsig_sign_custom` and `secp256k1_schnorrsig_verify`
take a `msglen`.

Pre-hashing to 32 bytes is now a *performance* recommendation, not a
spec requirement (BIP340 puts the break-even around 56 bytes). Bitcoin
consensus is unaffected: the BIP341 sighash is always 32 bytes.

## 6. Mixing aux entropy semantics

`aux_rand` is **not** a nonce. It's auxiliary entropy mixed into the
nonce derivation. Pass 32 bytes of fresh randomness if you have it,
or zeros if you don't (still safe due to deterministic derivation
based on `(d, m)`).

But **never** pass attacker-controlled data as aux_rand: a malicious
counterparty could try to influence nonce in protocols like adaptor
sigs.

## 7. Schnorr sig over message hash vs sig over message

BIP340 signs the **message bytes** directly. It does NOT internally
pre-hash the message — the challenge is
`TaggedHash("BIP0340/challenge", R.x || P.x || m)` over exactly the
bytes you pass.

Compare: ECDSA signs `H(m)`, BIP340 signs `m` — and since the
2023-04 revision `m` may be any length (see #5), pre-hashing
arbitrary-length data is a choice, not an obligation. Bitcoin's own
sighash already is a 32-byte digest.

## 8. Confusing signing for output key vs internal key

In Taproot, you sign for the **tweaked output key** Q, not the
internal key P:
```
sig = schnorr_sign(d_q, sighash_msg, aux)   # d_q = (d_p + t) mod n
```

Forgetting the tweak → sig verifies against P (which isn't in the
scriptPubKey), fails on consensus.

## 9. Sighash flag byte

If you use `SIGHASH_DEFAULT` (0x00), the witness contains **64 bytes
only**. Any other flag → 65 bytes (sig + flag byte). Verifiers check
length explicitly. Off-by-one here is a common copy-paste bug.

## 10. Batch verify with adversarial coefficients

If your batch combiner is adversarial-controllable (e.g., aggregator
service), use cryptographic-quality random `a_i` and **never** accept
client-supplied `a_i`.
