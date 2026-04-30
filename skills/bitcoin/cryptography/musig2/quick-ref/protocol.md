# MuSig2 — full protocol round-by-round

## Setup

n signers, ordered list of pubkeys `[P_1, ..., P_n]`, message m (32 bytes).

Aggregated pubkey `Q` derived from KeyAgg (see [key-agg.md](key-agg.md)).

## Round 1 — Nonce gen and exchange

Each signer i (1..n):

```
Inputs: secret_i, secret_extra_in, m, Q, n_signers
Output: (k_{i,1}, k_{i,2}) private, (R_{i,1}, R_{i,2}) public

rand1 = HKDF-derived from (secret_i, m, extra)
k_{i,1} = int(rand1) mod n
k_{i,2} = int(rand2) mod n   (independent derivation)

R_{i,1} = k_{i,1} * G
R_{i,2} = k_{i,2} * G

Send (R_{i,1}, R_{i,2}) to coordinator.
Persist (k_{i,1}, k_{i,2}) — must NOT reuse across sessions.
```

## Coordinator — Aggregate nonces

```
R_1 = sum(R_{i,1}) for i in 1..n
R_2 = sum(R_{i,2}) for i in 1..n

b = TaggedHash("MuSig/noncecoef",
               serP(R_1) || serP(R_2) || Q.x || m)
b = int(b) mod n

R = R_1 + b * R_2

If R.y is odd: g_R = -1, R = -R   (force even-y for Schnorr verifier)
Else: g_R = +1
```

`R` is the final aggregated nonce point that goes into the signature.

## Round 2 — Partial signing

Each signer i:

```
Inputs: secret_i, k_{i,1}, k_{i,2}, public state (R, b, Q, parity flags)

a_i = key-agg coefficient for signer i (computed from L and P_i.x)
e   = TaggedHash("BIP0340/challenge", R.x || Q.x || m) mod n

# Adjust signer's secret based on parities accumulated through key agg + tweak
d_i_adj = secret_i  (with parity flips per BIP327 procedure)

s_i = (k_{i,1} + b * k_{i,2} + e * a_i * d_i_adj) mod n

# Apply g_R flip if needed
if g_R == -1: s_i = (-s_i) mod n

Send s_i to coordinator.
```

## Coordinator — Aggregate partial sigs

```
s = sum(s_i) mod n
final_sig = (R.x, s)    (64 bytes)
```

This is a valid BIP340 Schnorr signature under public key `Q` for
message `m`. Anyone can verify with the standard BIP340 verifier.

## Verifying partial sigs (PartialSigVerify)

Useful for the coordinator to check each signer didn't cheat:
```
For signer i with (R_{i,1}, R_{i,2}, s_i):
  R_i_eff = R_{i,1} + b * R_{i,2}
  expected = s_i * G
  actual   = R_i_eff + e * a_i * P_i_adjusted
  If g_R == -1: actual = -actual

  Verify: expected == actual
```

If any signer's partial sig is invalid → reject session, restart.

## State management

CRITICAL: each signer must:
1. Persist `(k_{i,1}, k_{i,2})` between Round 1 and Round 2.
2. Wipe them immediately after sending Round 2 partial sig.
3. NEVER reuse them.

Power loss / crash between rounds → restart session with fresh nonces.
A signer that reuses nonces leaks their private key (see
[attacks.md](attacks.md)).

## Asynchronous flows

For Lightning-style protocols where co-signers may be unavailable for
long periods:
- Nonce pre-commitment: pre-publish R nonce commitments and store
  the pre-images encrypted.
- "Adaptor MuSig" variants for atomic-style swaps.

## Protocol complexity summary

```
| Phase   | Per-signer comm | Total bytes (n=2) | Total bytes (n=10) |
|---------|-----------------|-------------------|--------------------|
| Round 1 | 66 (R_1, R_2)   | 132               | 660                |
| Round 2 | 32 (s_i)        | 64                | 320                |
| Total   | 98              | 196               | 980                |
```

Compare to legacy n-of-n multisig on-chain: n × 64-byte signatures =
640 bytes for n=10. MuSig2 keeps on-chain footprint at 64 bytes total.
