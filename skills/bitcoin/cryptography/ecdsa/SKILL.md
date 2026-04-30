---
name: bitcoin-ecdsa
description: |
  ECDSA signatures over secp256k1: sign/verify, deterministic-k (RFC6979),
  low-s (BIP146), DER encoding, malleability, recoverable signatures.
  USE WHEN: signing legacy/SegWit-v0 inputs, verifying legacy signatures,
  debugging "non-canonical signature" errors.
allowed-tools: Read, Grep, Glob
---

# ECDSA on secp256k1

ECDSA is the original Bitcoin signature scheme. Used for legacy P2PKH,
P2SH, and SegWit v0 (P2WPKH/P2WSH). Replaced by Schnorr in Taproot.

## Sign (private key d, message hash h)

```
1. Generate nonce k ∈ [1, n-1].
2. R = k * G
3. r = R.x mod n.    if r == 0, retry.
4. s = k^(-1) * (h + r*d)  mod n.   if s == 0, retry.
5. Apply low-s normalization: if s > n/2, s = n - s.   (BIP146)
6. Output (r, s).
```

The signature is `(r, s)` ∈ Z_n × Z_n.

## Verify (public key Q, message hash h, signature (r, s))

```
1. Check r, s ∈ [1, n-1].
2. w = s^(-1) mod n.
3. u1 = h * w mod n,  u2 = r * w mod n.
4. P = u1*G + u2*Q.
5. Verify P.x mod n == r.
```

## Deterministic k (RFC6979)

**CRITICAL**: never reuse k. If you sign two different messages with
the same k, the private key leaks.

```
d * (s1 - s2) = k * (h2 - h1)  (mod n)
→ d = (s1 - s2)^(-1) * (h2 - h1) * k  (mod n)
```

RFC6979 derives `k` deterministically from `(d, h)` via HMAC-SHA256.
Bitcoin libraries default to RFC6979 — never accept "user-provided"
k unless you implement extra randomness mixing (RFC6979 + extra entropy
pattern, used by some hardware wallets to defeat fault attacks).

## DER encoding (for tx witness)

Bitcoin Script uses ASN.1 DER:
```
30 LL 02 LR <r> 02 LS <s>
```
Where:
- `30` = SEQUENCE tag.
- `LL` = total length following.
- `02` = INTEGER tag.
- `LR` / `LS` = length of r / s.
- `<r>` / `<s>` = big-endian, with leading 0x00 byte if high bit set
  (DER strict).

Followed by 1-byte sighash flag in tx witness:
```
<DER signature> <sighash byte>
```

Total length typically 71-72 bytes.

## Strict DER (BIP66)

Bitcoin Core enforces strict DER since 2015 to defeat malleability:
- No extra leading bytes.
- Length fields exactly minimal.
- Integers must be DER-canonical.

Non-DER signatures are rejected at script execution.

## Low-s (BIP146)

Both `(r, s)` and `(r, n-s)` verify against the same message and key.
This is malleability. BIP146 enforces `s ≤ n/2` as standard policy
(strictly enforced in Tapscript and as standard in segwit; mempool
rejects but consensus historically accepts both forms).

## Recoverable signatures

A 65-byte ECDSA encoding `<header byte> r s` lets verifier recover the
public key from the signature alone:
- `header` byte = `27 + recovery_id + (4 if compressed pubkey)`.
- `recovery_id ∈ [0, 3]`: encodes which of (R, -R, R+n, -R+n) to use.

Used by:
- BIP137 message signing.
- Lightning gossip messages (signed announcements).
- Some Ethereum-bridge tools (`ecrecover`).

Not used in raw tx witness (regular DER is more compact for that).

## Common errors

- Reusing k → key leak. **Never** accept an external nonce.
- Skipping low-s normalization → mempool rejection.
- Including a high-s signature in standardness-strict mempools → tx
  goes nowhere.
- Off-by-one in DER length encoding (the most common DER bug).
- Confusing nonce `k` with private key `d` in code reviews.

## See also

- [secp256k1/SKILL.md](../secp256k1/SKILL.md)
- [schnorr/SKILL.md](../schnorr/SKILL.md)
- [../../protocol/transactions/quick-ref/sighash.md](../../protocol/transactions/quick-ref/sighash.md)
