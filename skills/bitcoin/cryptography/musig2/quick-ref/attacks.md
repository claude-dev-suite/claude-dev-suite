# MuSig2 — attacks and how the spec defeats them

## 1. Rogue-key attack (defeated by KeyAgg coefficients)

### Attack
Eve sees Alice's pubkey `P_A` and chooses her own `P_E` such that:
```
P_E = P_chosen - P_A   for some target P_chosen
```
Then aggregated `Q = P_A + P_E = P_chosen`. Eve can sign for `P_chosen`
alone (she knows the private key for it, since she chose it).

### Defense
KeyAgg coefficients `a_i` depend on the **list** of all pubkeys. Eve
cannot pick `P_E` such that `a_A * P_A + a_E * P_E` equals her target,
because `a_E` depends on `P_E` itself (chicken-and-egg).

## 2. Wagner sub-exponential attack on parallel signing (defeated by `b` coefficient)

### Attack
With many concurrent signing sessions, attacker can mix-and-match
nonces from different sessions to forge a signature on a chosen
message via a generalized birthday attack. MuSig1 was vulnerable;
MuSig2 defeats it via the `b` nonce coefficient.

### Defense
```
b = TaggedHash("MuSig/noncecoef", R_1 || R_2 || Q || msg)
R = R_1 + b * R_2
```
`b` depends on the message m. Different sessions → different `b` →
nonces don't combine across sessions.

## 3. Nonce reuse (catastrophic; protocol-level)

### Attack
If a signer reuses `(k_{i,1}, k_{i,2})` across two sessions with
different messages, partial sigs leak the private key:

```
s_1 = k1 + b1*k2 + e1*a*d
s_2 = k1 + b2*k2 + e2*a*d

→ d = (s_1 - s_2) * (e1*a - e2*a)^{-1} * ...
```

### Defense
- BIP327 mandates fresh nonces every session.
- Implementations must persist nonces between Round 1 and Round 2,
  then **wipe** them.
- Hardware: nonce state must be in tamper-resistant storage.

### Operational mitigation: NonceGen non-determinism
- Mix `(secret_key, msg, extra_in)` into nonce derivation.
- Even with deterministic derivation, slight non-deterministic input
  helps when secret-key + msg are reused (e.g., re-signing same payload).

## 4. Concurrent session manipulation

### Attack
Coordinator runs multiple parallel sessions and tricks signer into
contributing nonce/partial sig material for one session in another.

### Defense
- Signer maintains explicit session state including: list of
  pubkeys, msg, expected `R`, expected `b`. Refuses partial-sig
  request that doesn't match.
- Best-practice: sign immediately on Round 2, don't keep sessions
  open longer than needed.

## 5. Aggregator dishonesty

### Attack
Coordinator submits invalid partial sigs from some signers, blame on
honest signers when final sig fails.

### Defense
- `PartialSigVerify` algorithm: each partial sig is independently
  verifiable against the public values `(R, Q, P_i, m, a_i)`.
- Honest signers can demand proof of valid partial sigs from peers
  before submitting their own.

## 6. Forced parity flip mismatch

### Attack
Signer applies wrong parity for `Q` or `R` → produces malformed sig.

### Defense
- Spec is explicit on parity flag tracking (`g_q`, `g_b`, `g_R`).
- Reference implementations include unit tests for all 8 parity
  combinations.

## 7. Side channel on nonce derivation

### Attack
If nonce derivation function leaks via timing, an attacker could
recover `k_{i,1}` and chain-attack to private key.

### Defense
- Use libsecp256k1's constant-time `secp256k1_musig2_nonce_gen`.
- Avoid Python/JS impls in production unless audited for CT.

## 8. Subkey pinning — DOS, not key compromise

If signer 1 doesn't show up for Round 2 after broadcasting nonces in
Round 1, the entire signing session must be discarded. Mitigation:
short timeouts + retry with different nonces.

Not a key-leak issue, but a UX/availability concern.
