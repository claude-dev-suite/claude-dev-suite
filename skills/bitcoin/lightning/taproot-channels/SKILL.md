---
name: lightning-taproot-channels
description: |
  Simple Taproot Channels (feature bits 80/81): MuSig2-aggregated
  funding output, Tapscript commitment leaves, taproot-native HTLCs.
  USE WHEN: enabling taproot channels in your impl, evaluating
  cooperative-spend privacy gains, designing taproot HTLC scripts.
allowed-tools: Read, Grep, Glob
---

# Simple Taproot Channels

Replaces the legacy 2-of-2 P2WSH funding output with a P2TR + MuSig2
aggregated key. Cooperative spends (the common case) are
indistinguishable from single-sig outputs on chain.

Status: the extension BOLT `bolt-simple-taproot.md` was merged into
lightning/bolts on 2026-05-04 (PR #995), so the scripts and feature
bits are final. Taproot channels still cannot be announced on the
public network — that needs the separate taproot gossip extension
(lightning/bolts#1059), still an open draft as of September 2026 — so
every taproot channel today is a private (unannounced) one.

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
- Under RBF cooperative close, each fee-bump round needs fresh nonces:
  the spec uses a JIT (just-in-time) nonce pattern, bundling the
  closer's nonce with its signature in `closing_complete` and rotating
  the closee's nonce in `closing_sig` per iteration.

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

`option_simple_taproot` (bits 80/81) negotiated in init. The bits are
defined in the extension BOLT `bolt-simple-taproot.md`, not in BOLT 9;
`option_simple_taproot_staging` (180/181, the +100 staging pair) is the
pre-finalization variant older deployments still speak. If only one
side supports, channel falls back to legacy.

The feature bit is also a defined **channel type**. The spec says it
SHOULD only be used with *explicit* channel negotiation — it cannot be
an interchangeable default, because `open_channel` for this type MUST
NOT set the `announce_channel` bit.

## Implementations (as of September 2026)

| Implementation | Status |
|----------------|--------|
| LND | Production — v0.21.0-beta (June 2026), final scripts, bits 80/81 |
| Eclair | Production — v0.14.0 (May 2026), final spec, LND-interoperable |
| CLN | No support — `common/features.c` on master has no taproot entry |
| LDK | No simple-taproot channels shipped — `main` still carries only the older `option_taproot` (bit 30/31) feature definition |

LND requires the type explicitly; bare `taproot` now means the
production variant, `taproot-staging` opens the staging variant and
`taproot-final` is a deprecated alias:
```bash
lncli openchannel --channel_type=taproot ...
```

Eclair enables the feature by default (disable with
`eclair.features.option_simple_taproot = disabled`) and opens with:
```bash
eclair-cli open --channelType=simple_taproot_channel --announceChannel=false ...
```

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
