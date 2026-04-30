---
name: bitcoin-bip32
description: |
  BIP32 hierarchical deterministic key derivation: master key from seed,
  hardened vs unhardened derivation, xpub/xprv encoding, fingerprints,
  child-key chaining, key origin paths.
  USE WHEN: building HD wallets, deriving addresses, parsing xpubs,
  validating descriptors with key origin.
allowed-tools: Read, Grep, Glob
---

# BIP32 — Hierarchical Deterministic Wallets

A single 256-bit master seed deterministically generates an unlimited
tree of (priv, pub, chain code) triples. Wallets derive new addresses
without seed access at runtime.

## Master derivation

```
Input: seed bytes (typically 64 bytes from BIP39)
HMAC-SHA512(key="Bitcoin seed", msg=seed) → 64 bytes
  Left 32 bytes  → master private key d
  Right 32 bytes → master chain code c
```

Validate: `1 ≤ d < n` (secp256k1 order). Retry with another seed if not.

## Child key derivation (CKD)

Two flavours:

### Normal (unhardened) child, index i ∈ [0, 2^31)

```
data = serP(point(d_parent)) || ser32(i)
I    = HMAC-SHA512(c_parent, data)
d_child = (I_left + d_parent) mod n
c_child = I_right
```

`serP(P)` = compressed serialization of P (33 bytes).

**Public-key-only** derivation works without private key:
```
data = serP(P_parent) || ser32(i)
I    = HMAC-SHA512(c_parent, data)
P_child = point(I_left) + P_parent
c_child = I_right
```

This is what makes **xpub-only watch-only wallets** possible.

### Hardened child, index i ∈ [2^31, 2^32)

```
data = 0x00 || ser256(d_parent) || ser32(i)
I    = HMAC-SHA512(c_parent, data)
d_child = (I_left + d_parent) mod n
c_child = I_right
```

**Cannot** be derived from xpub alone. Hardened derivation breaks the
parent-pubkey-leak attack: if both an unhardened child priv key and
the parent xpub leak, an attacker can recover all sibling private keys.

## Path notation

```
m / 84' / 0' / 0' / 0 / 5
```
- `m` = master.
- `84'` = hardened (apostrophe or `h` suffix).
- `0` (no apostrophe) = unhardened.

## Standard derivation paths

| Purpose | Path | Output type |
|---------|------|------------|
| BIP44 | `m/44'/0'/account'/change/index` | P2PKH (legacy) |
| BIP49 | `m/49'/0'/account'/change/index` | P2SH-P2WPKH |
| BIP84 | `m/84'/0'/account'/change/index` | P2WPKH (native segwit) |
| BIP86 | `m/86'/0'/account'/change/index` | P2TR (Taproot) |
| BIP48 | `m/48'/0'/account'/script_type'/change/index` | multisig (P2WSH / P2TR) |
| Liquid | `m/49'/1776'/...` | Liquid network |
| Lightning | `m/9735'/...` | LN node keys (informal) |

`change=0` for receive, `change=1` for change in BIP44/49/84.

## Multipath descriptors (BIP389)

`xpub.../<0;1>/*` — single descriptor covers both receive and change.

## xpub / xprv serialization

113 bytes Base58Check-encoded. Layout:
```
[4 bytes]  version    e.g. 0x0488B21E (xpub mainnet)
[1 byte]   depth      (0 for master)
[4 bytes]  parent fingerprint   = first 4 bytes of HASH160(parent pubkey)
[4 bytes]  child number         (BE; high bit set if hardened)
[32 bytes] chain code
[33 bytes] key                  (0x00 || privkey for xprv, compressed pubkey for xpub)
```

Version bytes signal network and script type:
| Prefix | Hex | Use |
|--------|-----|-----|
| `xpub` | 0x0488B21E | Mainnet, BIP44 P2PKH |
| `ypub` | 0x049D7CB2 | Mainnet, BIP49 P2SH-P2WPKH |
| `zpub` | 0x04B24746 | Mainnet, BIP84 P2WPKH |
| `Ypub` | 0x0295B43F | Mainnet multisig P2SH-P2WSH |
| `Zpub` | 0x02AA7ED3 | Mainnet multisig P2WSH |
| `tpub`/`upub`/`vpub` | various | Testnet variants |

Modern best practice: **always use `xpub`** (the BIP32 default) and
declare script type via descriptor. The y/z/Y/Z variants are legacy
SLIP-132 conventions, frequently a source of bugs.

## Fingerprint

`fingerprint(P) = first_4_bytes(HASH160(P))`. Used in descriptor key
origin paths to identify which master key the xpub came from.

## BIP85 (deterministic entropy)

Sub-derivation that gives deterministic *entropy* (not keys) from a
parent BIP32 path. Used for:
- Generating sub-seeds for separate wallets from one master.
- Deterministic encryption keys.
- HEX/Base85 entropy of arbitrary length.

Path: `m/83696968'/<app_id>'/<index>'`. Different `app_id` for BIP39
words / hex / wif / xprv / etc.

## Common bugs

- Confusing `xpub` and `xprv` boundaries (xpub depth must match
  hardened-or-unhardened nature — last hardened in path is the
  innermost xpub you can export safely).
- Including non-hardened components above the **account** level → key
  derivation collisions / xpub-leak vulnerability.
- Re-using the same seed across BIP44/49/84 simultaneously (privacy
  bleed): different xpubs but same seed leaks heuristics.
- Hard-coding mainnet version bytes when generating testnet xpubs.

## See also

- [secp256k1/SKILL.md](../secp256k1/SKILL.md)
- [../../wallets/hd/SKILL.md](../../wallets/hd/SKILL.md)
- [../../wallets/entropy/SKILL.md](../../wallets/entropy/SKILL.md)
- [../../protocol/descriptors/SKILL.md](../../protocol/descriptors/SKILL.md)
