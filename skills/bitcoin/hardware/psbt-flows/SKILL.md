---
name: bitcoin-hardware-psbt-flows
description: |
  PSBT signing flow patterns across HW vendors: USB direct, microSD
  airgap, QR airgap, NFC, multi-device coordination.
  USE WHEN: designing HW signing UX, debugging cross-device PSBT
  flow, supporting multi-vendor multisig.
allowed-tools: Read, Grep, Glob
---

# PSBT Signing Flow Patterns

A summary of how PSBTs flow through different hardware wallet
transports.

## Flow types

### USB direct (online signer)
```
Host wallet ──── PSBT ────► HW (via USB)
            ◄── signed PSBT
```

Wallets: Trezor, Ledger, BitBox02, Coldcard via USB, Jade USB,
Keystone (charging only).

Pro: fastest. Con: USB connectivity = potentially compromised host.

### microSD airgap (true offline)
```
Host wallet → save PSBT to SD → eject → insert into HW → sign on
HW → eject → insert into Host
```

Wallets: Coldcard, Passport, Jade (with SD), Keystone.

Pro: no USB connection; truly airgapped. Con: SD card handling
overhead.

### QR airgap (animated QR / BCUR)
```
Host wallet displays animated QR → HW reads via camera
→ HW signs → HW displays animated QR → Host reads
```

Wallets: Passport, Coldcard Q, Jade, Keystone, SeedSigner, Krux.

Pro: no physical connection. Con: scan time for big PSBTs.

BCUR (Blockchain Commons UR Format) is the standard encoding for
multi-frame QR. Compatible wallets must understand BCUR.

### NFC tap
```
Host (phone) → NFC tap to HW → HW signs → NFC tap back
```

Wallets: Coldcard Mk4 / Q, Passport (limited), some others.

Pro: convenient with Android. Con: iOS NFC limited; PSBT size
limits.

## Coordinator role

For multisig, a **coordinator** wallet handles:
1. Build PSBT.
2. Send to signer 1, get partial sig.
3. Send to signer 2, get partial sig.
4. Combine + finalize.
5. Broadcast.

Coordinators:
- **Sparrow Desktop** — best for cross-vendor multisig.
- **Specter Desktop** — multisig + multiple HW.
- **Caravan** — web-based multisig.
- **Bitcoin Core** with HWI external signer.

## PSBT versions

- v0 (BIP174): widely supported.
- v2 (BIP370): newer; spec-compliant signing only on modern devices.

For multi-device multisig, **all** signers must agree on PSBT version
or coordinator transcodes between them.

## Cross-vendor multisig

Best practice: use **descriptors with key origins**:
```
wsh(sortedmulti(2,
  [fp1/48'/0'/0'/2']xpub1.../<0;1>/*,
  [fp2/48'/0'/0'/2']xpub2.../<0;1>/*,
  [fp3/48'/0'/0'/2']xpub3.../<0;1>/*
))#chk
```

Each signer's device must:
- Have its xpub at the declared path.
- Match key origin fingerprint.
- Recognize the wallet policy (Ledger requires explicit registration
  with HMAC).

## Common pitfalls

- **PSBT missing data**: device rejects if `non_witness_utxo` or
  `tap_internal_key` missing for the input type.
- **Path mismatch**: device can't find the key for declared
  derivation.
- **Multi-vendor wallet policy registration**: Ledger requires
  explicit wallet-policy + HMAC registration before multisig signing.
- **Stale PSBT**: signer signed an old version; coordinator must
  reconcile.
- **Air-gap delays**: long PSBTs via QR/SD take minutes; users
  abandon.

## See also

- [hwi/SKILL.md](../hwi/SKILL.md)
- [multi-vendor-multisig/SKILL.md](../multi-vendor-multisig/SKILL.md)
- [../wallets/hd/SKILL.md](../../wallets/hd/SKILL.md)
- [../../protocol/psbt/SKILL.md](../../protocol/psbt/SKILL.md)
