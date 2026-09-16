---
name: bitcoin-wallet-entropy
description: |
  BIP85 deterministic entropy: derive child entropy/seeds from a
  parent BIP32 path. Used for sub-wallets, cross-app keys, deterministic
  randomness without separate backups.
  USE WHEN: spawning sub-wallets from one master seed, generating
  encryption keys deterministically, building a "memory" of one seed.
allowed-tools: Read, Grep, Glob
---

# BIP85 — Deterministic Entropy

BIP85 lets a single BIP32 master key generate **deterministic
entropy** at child paths. Each child can become:
- A separate BIP39 mnemonic.
- A WIF private key.
- A separate xprv.
- HEX bytes for any other use.

The parent seed still backs everything; only one paper backup needed.

## Path structure

```
m/83696968'/<app_id>'/<index>'
```

- `83696968'` = ASCII for `BIP85` (`0x4F` `0x4E` `0x53` `0x4F`...
  actually it's the ASCII codes). Hardened.
- `app_id` = which sub-application (BIP39 mnemonic, WIF, xprv, etc.).
- `index` = nth child for this app.

## App IDs (selected)

| App ID | Output | Path suffix |
|--------|--------|-------------|
| 39 | BIP39 mnemonic | `<app_id=39>'/<lang>'/<words>'/<index>'` |
| 2 | HD-Seed WIF | `<app_id=2>'/<index>'` |
| 32 | XPRV | `<app_id=32>'/<index>'` |
| 128169 | HEX bytes | `<app_id=128169>'/<num_bytes>'/<index>'` |
| 707764 | PWD-base85 | password generator |

## BIP39 example

```
parent: m/83696968'/39'/0'/12'/0'   (English, 12 words, index 0)
HMAC-SHA512(key="bip-entropy-from-k", msg=childkey) → 64 bytes
take first 16 bytes → 128 bits of entropy
add BIP39 checksum → 12-word mnemonic
```

The result is a deterministic 12-word mnemonic. Any future derivation
from the parent at the same path always returns the same 12 words.

## Why BIP85

Use cases:
- **Multi-account separation** — one master, many independent BIP39
  wallets for different purposes (savings, payments, hot wallet).
- **Children's wallets** — give kids a seed deterministically derived
  from your master.
- **Hardware-wallet-internal sub-seeds** — Coldcard's "Drunken Sailor"
  uses BIP85 to spawn sub-seeds for deniability.
- **App keys** — derive a deterministic Nostr key, GPG key, encryption
  key for cloud backup.
- **Device backups** — Foundation Passport uses BIP85 for reproducible
  device-id seed.

## Hardware wallet support

| Device | BIP85 |
|--------|-------|
| Coldcard Mk4 / Mk5 / Q | yes (full app catalogue) |
| Trezor (T / Safe) | yes via Suite |
| Ledger | yes via 3rd-party app |
| BitBox02 | partial |
| SeedSigner | yes |
| Krux | yes |
| Specter DIY | yes |

## Weak parent entropy: the COLDCARD advisory

Coinkite's advisory of 30 July 2026 (expanded 1 August 2026) disclosed
that COLDCARD firmware from March 2021 onward generated seeds from
MicroPython's software PRNG instead of the hardware TRNG. Effective
entropy was ~40 bits on Mk2/Mk3 and ~72 bits on Mk4/Mk5/Q, against a
128-bit design target. Fixed in Standard 4.2.0 (Mk2/Mk3), 5.6.0
(Mk4/Mk5) and 1.5.0Q (Q), and in Edge 6.6.0X / 6.6.0QX.

BIP85 does not launder this. Every child is a deterministic function
of the parent, so a master holding ~72 bits of real entropy yields
children with no more than ~72 bits, however long the child mnemonic
prints. If the BIP85 master was generated on affected firmware, treat
every mnemonic, WIF, xprv and password ever derived under it as
compromised, not just the master. Coinkite exempts masters mixed with
at least 50 fair, independent, private dice rolls — those are not at
risk from this RNG bug alone. Updating firmware does not repair an
existing seed; the remedy is a freshly generated master on fixed
firmware, after which the same BIP85 paths yield new children.

The general rule: BIP85 output entropy is capped by the parent seed's
entropy. Auditing a BIP85 tree means auditing how the master was
generated.

## Implementation

```python
def bip85_derive(master_xprv, path, app_args):
    child_xprv = derive_path(master_xprv, path)
    k = child_xprv.private_key
    entropy = HMAC_SHA512(key="bip-entropy-from-k", msg=k)
    return apply_app(app_id, entropy[:N], app_args)

# For BIP39 mnemonic at index 0, 12 English words:
seed12 = bip85_derive(master, "m/83696968'/39'/0'/12'/0'", "bip39_12")
```

## Security implications

- A child seed derived via BIP85 is **fully independent** in terms of
  keys derived under it (different secp256k1 group, different addresses).
- BUT: anyone with the parent seed can derive ANY child. Compromising
  the parent compromises all children.
- Conversely, a child can be backed up / shared / lost without
  affecting the parent.

## Common pitfalls

- Treating BIP85 child as "stronger" than parent — they're equally
  strong, just deterministically related.
- Confusing BIP85 path with BIP44 path — BIP85 always starts at
  `m/83696968'`, never at `m/44'/0'/...`.
- Generating a child mnemonic and sharing it without realizing the
  parent backup also unlocks it.
- Re-deriving with a different `lang` or `words` count — produces
  totally different output.

## See also

- [hd/SKILL.md](../hd/SKILL.md)
- [backup/SKILL.md](../backup/SKILL.md)
- [../../cryptography/bip32/SKILL.md](../../cryptography/bip32/SKILL.md)
- [../../hardware/coldcard/SKILL.md](../../hardware/coldcard/SKILL.md)
