---
name: bitcoin-hardware-psbt-flows
description: |
  PSBT signing flow patterns across HW vendors: USB direct, microSD
  airgap, QR airgap, NFC, multi-device coordination, silent-payment
  PSBT fields (BIP375/BIP376).
  USE WHEN: designing HW signing UX, debugging cross-device PSBT
  flow, supporting multi-vendor multisig or silent payments.
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

Wallets: Coldcard, Passport Core, Jade (with SD), Keystone.

Pro: no USB connection; truly airgapped. Con: SD card handling
overhead.

### QR airgap (animated QR / BCUR)
```
Host wallet displays animated QR → HW reads via camera
→ HW signs → HW displays animated QR → Host reads
```

Wallets: Passport Core, Coldcard Q, Jade, Keystone, SeedSigner,
Krux. Passport Prime scans QR too, but its USB-C data port, NFC and
Bluetooth are all live (as of September 2026), so QR on Prime is a
transport, not an airgap.

Pro: no physical connection. Con: scan time for big PSBTs.

BCUR (Blockchain Commons UR Format) is the standard encoding for
multi-frame QR. Compatible wallets must understand BCUR.

### NFC tap
```
Host (phone) → NFC tap to HW → HW signs → NFC tap back
```

Wallets: Coldcard Mk4 / Q, some others. Not Passport: Core has no
radios at all (power-only USB-C, QR + microSD), and Prime's NFC
carries only its Shamir backup KeyCards, not PSBTs (as of September
2026).

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
- **Bitcoin Core** with HWI external signer — but HWI entered a
  maintenance-only wind-down in August 2026 (no new features, no new
  devices, repo to be archived once a drop-in replacement is ready),
  so weigh it before building on it: [hwi/SKILL.md](../hwi/SKILL.md).

## PSBT versions

- v0 (BIP174): widely supported; still the safe interop default as of
  September 2026.
- v2 (BIP370): required for the silent-payment fields below. Coldcard
  has parsed v2 since firmware 5.2.0 (October 2023); Sparrow made v2
  its internal PSBT representation in 2.4.0 (February 2026).

For multi-device multisig, **all** signers must agree on PSBT version
or coordinator transcodes between them.

## Silent payments (BIP352) on hardware

Three BIPs carry silent payments into the hardware signing path. All
of their new fields are **PSBTv2-only** — BIP375 and BIP376 both mark
them as requiring exclusion from v0.

### Sending: BIP375

BIP375 ("Sending Silent Payments with PSBTs", number assigned January
2025) lets a PSBT name a recipient by silent-payment code rather than
by script, because the output script cannot be computed until every
input is known.

- `PSBT_OUT_SP_V0_INFO = 0x09` — 33-byte scan key + 33-byte spend key.
  `PSBT_OUT_SCRIPT` becomes optional when this is present.
- `PSBT_OUT_SP_V0_LABEL = 0x0a` — label index, so a signer can verify
  that a silent-payment output is its own change.
- `PSBT_IN_SP_ECDH_SHARE = 0x1d` / `PSBT_GLOBAL_SP_ECDH_SHARE = 0x07`
  — `a*B_scan` for one input, or for the sum over all eligible inputs.
- `PSBT_IN_SP_DLEQ = 0x1e` / `PSBT_GLOBAL_SP_DLEQ = 0x08` — a 64-byte
  BIP374 discrete-log-equality proof for the matching ECDH share.

The DLEQ proof is what makes this safe on a device: a signer that does
not hold every input key can still verify the other signers' shares
before it computes and commits to `PSBT_OUT_SCRIPT`. Extra signer
rules that trip devices:

- Fail if any input spends a segwit version > 1 output.
- SIGHASH_ALL only — output scripts are derived from the number and
  position of the codes, which NONE/SINGLE would let move.
- No signature until every silent-payment output has a computed
  `PSBT_OUT_SCRIPT`; whoever fills those in must clear the Inputs
  Modifiable and Outputs Modifiable flags.

### Spending: BIP376

BIP376 ("Spending Silent Payment outputs with PSBTs", assigned
February 2026, merged to the BIPs repo April 2026) covers the other
direction:

- `PSBT_IN_SP_TWEAK = 0x20` — the 32-byte tweak recovered during
  scanning.
- `PSBT_IN_SP_SPEND_BIP32_DERIVATION = 0x1f` — fingerprint + path for
  the 33-byte spend key. It cannot reuse
  `PSBT_IN_TAP_BIP32_DERIVATION`, whose keydata is a 32-byte x-only
  key.

The signer derives `d = (b_spend + tweak) mod n`, negates `d` if `d*G`
has an odd y-coordinate, and **must fail if x(`d*G`) does not equal
the output key `P`** in the witness UTXO — the tweak comes from the
Updater, and signing on an unverified one produces a valid signature
for a key the device does not control. Finalizers strip
`PSBT_IN_SP_TWEAK` and `PSBT_IN_SP_SPEND_BIP32_DERIVATION` once
`PSBT_IN_FINAL_SCRIPTWITNESS` is built.

### Why an airgapped signer can sign but cannot scan

The BIP376 tweak is *handed to* the device. Recovering it means
scanning the chain with the scan private key, which an offline signer
cannot do. BIP392 (`sp()` output descriptors, merged March 2026)
encodes the split directly: its `spscan` key expression holds the scan
**private** key plus the spend **public** key — exactly a watch-only
coordinator — while `spspend` holds both private keys. So the
coordinator scans and supplies tweaks; the hardware signer only ever
sees a spend-key derivation and a 32-byte tweak that it re-verifies.

### Shipping support (as of September 2026)

- **BitBox02** firmware v9.21.0 (September 2024) — sending to BIP352
  addresses. The device returns a 33-byte ECDH share plus a 64-byte
  DLEQ proof over its own USB protocol so the host can re-derive and
  check the generated output; the same construction BIP375 later
  standardised as PSBT fields.
- **Sparrow** 2.3.0 (October 2025) — sending to silent-payment
  addresses; 2.4.0 (February 2026) — BIP375 PSBT fields and DLEQ
  proof verification for hardware-wallet sends; 2.5.0 (May 2026) —
  silent-payment *receiving* wallets, including airgapped hardware
  signers.

BIP374, BIP375, BIP376 and BIP392 are all still **Draft** status as of
September 2026.

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
- **Silent-payment PSBT downgraded to v0**: the BIP375/BIP376 fields
  are v2-only, so a coordinator that transcodes down silently drops
  the ECDH shares, DLEQ proofs and tweaks.
- **Air-gap delays**: long PSBTs via QR/SD take minutes; users
  abandon.

## See also

- [hwi/SKILL.md](../hwi/SKILL.md)
- [multi-vendor-multisig/SKILL.md](../multi-vendor-multisig/SKILL.md)
- [../wallets/hd/SKILL.md](../../wallets/hd/SKILL.md)
- [../../protocol/psbt/SKILL.md](../../protocol/psbt/SKILL.md)
- [../../privacy/silent-payments/SKILL.md](../../privacy/silent-payments/SKILL.md)
