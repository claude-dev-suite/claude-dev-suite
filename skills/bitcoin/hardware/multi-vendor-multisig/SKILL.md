---
name: bitcoin-hardware-multi-vendor-multisig
description: |
  Multi-vendor multisig: combining HW wallets from different vendors
  (Trezor + Ledger + Coldcard) for diversification. Coordinator-mediated
  setup, descriptor sharing, threat model.
  USE WHEN: designing multi-vendor custody, implementing 2-of-3
  multisig with diverse hardware.
allowed-tools: Read, Grep, Glob
---

# Multi-Vendor Multisig

Using HW wallets from **different manufacturers** for the same
multisig. Defense against single-vendor compromise (firmware bug,
supply chain).

## Why multi-vendor

If all 3 keys are on Ledger devices and Ledger has a critical bug:
- All 3 keys potentially compromised.
- 2-of-3 = full theft.

Multi-vendor 2-of-3 (e.g., Trezor + Coldcard + Ledger):
- One vendor's vulnerability doesn't compromise majority.
- Need 2 simultaneous vulnerabilities + access.
- Substantially harder to attack.

## Trade-offs

- **Multi-vendor signing UX harder**: each vendor has different
  flows.
- **Coordinator complexity**: must speak multiple HW protocols.
- **Recovery complicated**: must remember which vendor goes where.

## Setup

1. Generate seeds on each device independently.
2. Get xpubs at standard multisig path (e.g., `m/48'/0'/0'/2'` for
   P2WSH; `m/48'/0'/0'/2'` for Tapscript variant).
3. Use coordinator (Sparrow / Specter / Caravan) to:
   - Combine xpubs into descriptor.
   - Generate addresses.
   - Verify each device shows the same multisig address.
4. Register wallet policy on each device (Ledger especially needs
   this).
5. Test with small amount before full deposit.

## Common configurations

**2-of-3 with Trezor + Ledger + Coldcard**:
- Trezor: hot signer (everyday use).
- Ledger: secondary signer.
- Coldcard: deep cold (airgapped, signed only for large txs).

**3-of-5 with diverse vendors**:
- Trezor + Ledger + Coldcard + BitBox02 + Jade.
- Higher availability + diversification.

## Descriptor format

```
wsh(sortedmulti(2,
  [trezor_fp/48h/0h/0h/2h]xpub_trezor.../<0;1>/*,
  [ledger_fp/48h/0h/0h/2h]xpub_ledger.../<0;1>/*,
  [coldcard_fp/48h/0h/0h/2h]xpub_coldcard.../<0;1>/*
))#chk
```

Or Taproot-multisig:
```
tr(KEY_AGGREGATE,
   multi_a(2,
     [fp1/86h/0h/0h]xpub1.../<0;1>/*,
     [fp2/86h/0h/0h]xpub2.../<0;1>/*,
     [fp3/86h/0h/0h]xpub3.../<0;1>/*))#chk
```

For Taproot, key-path can be a MuSig2 of all three (cooperative
spend). Less HW support currently.

## Coordinator wallets

| Coordinator | Strengths |
|-------------|-----------|
| **Sparrow Desktop** | Cleanest cross-vendor; native PSBT |
| **Specter Desktop** | Web UI; multi-device flow |
| **Caravan** | Web-based, no install |
| **Bitcoin Core + HWI** | Most flexible, scriptable |

## Recovery

- **Backup descriptor** along with seeds. Without descriptor, can't
  reconstruct addresses without all 3 xpubs.
- **Recovery contact info**: where each backup lives.
- **Document vendor + path** explicitly.

## Threat model considerations

- **Common-mode failure**: even multi-vendor doesn't help against
  attacks on the **wallet UX** (e.g., compromised desktop coordinator
  showing wrong address).
- **Address verification on device** is critical: each HW wallet
  must independently confirm the full multisig address before
  funds deposit.

## Common pitfalls

- **Coordinator-only address generation** without verifying on each
  device → all devices lie about their actual key contribution.
- **Path mismatch**: BIP48 path used inconsistently across devices.
- **Wallet policy missing on Ledger** → signing fails.
- **Forgetting xpub backup** → can't reconstruct without all 3
  devices.

## See also

- [hwi/SKILL.md](../hwi/SKILL.md)
- [psbt-flows/SKILL.md](../psbt-flows/SKILL.md)
- [../wallets/vaults/SKILL.md](../../wallets/vaults/SKILL.md)
- [../infrastructure/sparrow/SKILL.md](../../infrastructure/sparrow/SKILL.md)
- [../infrastructure/specter-desktop/SKILL.md](../../infrastructure/specter-desktop/SKILL.md)
- [../infrastructure/caravan/SKILL.md](../../infrastructure/caravan/SKILL.md)
