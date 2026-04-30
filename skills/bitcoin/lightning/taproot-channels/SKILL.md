---
name: lightning-taproot-channels
description: |
  Simple Taproot Channels (BOLT 9 bit 56): MuSig2-aggregated funding
  output, Tapscript commitment leaves, taproot-native HTLCs.
  USE WHEN: enabling taproot channels in your impl, evaluating
  cooperative-spend privacy gains, designing taproot HTLC scripts.
allowed-tools: Read, Grep, Glob
---

# Simple Taproot Channels

Replaces the legacy 2-of-2 P2WSH funding output with a P2TR + MuSig2
aggregated key. Cooperative spends (the common case) are
indistinguishable from single-sig outputs on chain.

Status: deployed in early form across LDK, CLN, LND, Eclair as of
late 2025; spec ongoing.

## Funding output

Pre-taproot:
```
P2WSH(MULTI 2 <pk1> <pk2> 2 CHECKMULTISIG)
```

Taproot channel:
```
P2TR(MuSig2(pk1, pk2))
```

Both parties run MuSig2 KeyAgg → single 32-byte x-only pubkey, which
is the Taproot output key (potentially with empty taptree, or with
emergency-script leaf).

## Commitment tx

Outputs:
- `to_local` — Tapscript with revocation + delay.
- `to_remote` — simple P2TR(remote_static_pubkey) — looks like
  single-sig!
- `to_local_anchor` / `to_remote_anchor` — small-value Taproot.
- HTLC outputs — Tapscript leaves with hash/timeout/revocation paths.

## Cooperative close

Cooperative close in taproot channels:
- Both parties sign a single Schnorr sig over the new tx (via MuSig2
  on the funding output).
- Result: tx with **single 64-byte witness** — looks like ordinary
  Taproot single-sig.
- On-chain analysis cannot distinguish from a regular wallet spend.

## Privacy gain

| Tx type | Pre-taproot | Taproot channel |
|---------|-------------|-----------------|
| Funding tx | P2WSH 2-of-2 (visible) | P2TR (looks single-sig) |
| Cooperative close | P2WSH spend (visible script) | P2TR keypath spend (single-sig look) |
| Force close | P2WSH commitment | P2TR keypath spend, Tapscript only on revealed branch |

Force-close with Tapscript reveals the script branch used; the other
branches stay private.

## HTLC scripts in Tapscript

HTLC offered (Tapscript leaf):
```
<remote_htlc_pk> CHECKSIG
  <local_htlc_pk> CHECKSIGADD 2 NUMEQUAL  ; 2-of-2
  HASH160 <RIPEMD160(payment_hash)> EQUALVERIFY CHECKSIG
```

Simpler than legacy because:
- No P2WSH wrapper.
- Schnorr 64-byte sigs vs DER 71-byte.
- `OP_CHECKSIGADD` cleaner than `OP_CHECKMULTISIG`.

## Funding key generation

Each party generates:
- `funding_pubkey` (will be aggregated via MuSig2).
- `revocation_basepoint`, `delayed_payment_basepoint`, `htlc_basepoint`,
  `payment_basepoint` (per-commitment-derivation basepoints).

MuSig2 KeyAgg of `funding_pubkey_local` + `funding_pubkey_remote` →
funding output key.

## Implementation challenges

- **Nonce management**: MuSig2 requires careful nonce state across
  signing rounds. Channel updates need MuSig2 sessions for the
  funding output spend.
- **Hardware wallet support**: lags. Most HW wallets don't support
  MuSig2 yet (Coldcard Mk4 has experimental).
- **Splicing + taproot**: splice tx needs both MuSig2 cooperative
  spend + new output construction; protocol coordination is more
  complex than legacy.

## Compatibility

`option_simple_taproot_chans` (BOLT 9 bit 56/57) negotiated in init.
If only one side supports, channel falls back to legacy.

## Implementations (late 2025)

| Implementation | Status |
|----------------|--------|
| LDK | Production with experimental flag |
| CLN | Beta |
| LND | Beta |
| Eclair | Beta |

Spec is in late stages but not finalized; some interop differences
remain.

## Common bugs

- MuSig2 nonce reuse across commitment updates → catastrophic key
  leak.
- Forgetting to commit empty taptree (or chosen leaves) on funding
  output construction → mismatched output key.
- Tapscript HTLC scripts with wrong sigops budget calculation.
- HW wallet signing without MuSig2 capability → channel cannot be
  opened or updated.

## See also

- [channels/SKILL.md](../channels/SKILL.md)
- [htlcs/SKILL.md](../htlcs/SKILL.md)
- [../../cryptography/musig2/SKILL.md](../../cryptography/musig2/SKILL.md)
- [../../protocol/taproot/SKILL.md](../../protocol/taproot/SKILL.md)
