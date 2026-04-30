---
name: bitcoin-descriptors
description: |
  Output descriptors: BIP380-385 family. Descriptor language for
  declaring scriptPubKey templates with key origin info, ranges,
  checksums. Functions: pkh, wpkh, sh, wsh, tr, multi, sortedmulti,
  multi_a, addr, raw, combo, rawtr.
  USE WHEN: importing watch-only wallets, defining multisig,
  declaring scan ranges, exchanging key info between wallets.
allowed-tools: Read, Grep, Glob
---

# Output Descriptors

Descriptor language: a way to describe a **set of scriptPubKey templates**
(addresses) with all metadata needed to derive, scan, and sign them.

## Why descriptors

Pre-descriptors, "import this xpub at BIP44 paths" required convention.
Different wallets used different paths, making coordination fragile.
Descriptors make the script type, derivation, and key origin **explicit**.

## Core syntax

```
function(args)#checksum
```

Functions:
| Func | Output type |
|------|------------|
| `pk(KEY)` | P2PK |
| `pkh(KEY)` | P2PKH |
| `wpkh(KEY)` | P2WPKH (native segwit single-sig) |
| `sh(SCRIPT)` | P2SH wrapper |
| `wsh(SCRIPT)` | P2WSH wrapper (segwit script) |
| `tr(KEY)` or `tr(KEY, TREE)` | P2TR (Taproot) |
| `rawtr(KEY)` | P2TR with raw output key (no tweak) — **rare**, only when key already includes a commitment |
| `multi(k, KEY1, KEY2, ...)` | unsorted k-of-n multisig (legacy ordering) |
| `sortedmulti(k, KEY1, KEY2, ...)` | k-of-n with keys lexicographically sorted at runtime |
| `multi_a(k, KEY1, KEY2, ...)` | k-of-n multisig in **Tapscript** (uses CHECKSIGADD) |
| `addr(ADDRESS)` | hard-coded address |
| `raw(HEX)` | hard-coded scriptPubKey (advanced/debug) |
| `combo(KEY)` | shorthand for pk + pkh + wpkh + sh-wpkh (legacy compat) |

## Keys

A KEY is one of:
- Hex pubkey (66 char compressed or 130 uncompressed).
- WIF privkey (signing-capable descriptor).
- xpub / xprv (extended key).
- xpub with derivation: `xpub.../84h/0h/0h/0/*` or `xpub.../<0;1>/*`
  (multipath BIP389).

### Key origin

Prefix `[fingerprint/path]` declares where this key came from in a
master tree:
```
[d34db33f/84h/0h/0h]xpub.../<0;1>/*
```
- `d34db33f` = fingerprint of master key (4-byte hex).
- `84h/0h/0h` = path used to reach this xpub from master.
- `<0;1>/*` = multipath: receive (0) and change (1) derivation chains.

Key origin is **mandatory** for any cross-wallet coordination
(multisig, hardware signing). Without it, signers can't tell which
device should sign.

## Checksums

Every descriptor ends with `#XXXXXXXX` (8 chars, BCH code over the
character set). Wallet APIs typically auto-compute via
`getdescriptorinfo`.

## Ranges

A descriptor with `*` in derivation is a **ranged descriptor**. Import
specifies a range:
```json
{
  "desc": "wpkh([d34db33f/84h/0h/0h]xpub.../<0;1>/*)#abcd1234",
  "active": true,
  "range": [0, 999],
  "next_index": 0,
  "timestamp": "now"
}
```
Range = inclusive integer range of indices to scan.

## Examples

### Single-sig watch-only
```
wpkh([d34db33f/84h/0h/0h]xpub.../<0;1>/*)#chk
```

### 2-of-3 multisig (P2WSH)
```
wsh(sortedmulti(2,
  [d34db33f/48h/0h/0h/2h]xpub.../<0;1>/*,
  [b15ec0de/48h/0h/0h/2h]xpub.../<0;1>/*,
  [c0ffee00/48h/0h/0h/2h]xpub.../<0;1>/*
))#chk
```

### Taproot single-sig with key-only
```
tr([d34db33f/86h/0h/0h]xpub.../<0;1>/*)#chk
```

### Taproot key-path + 2-of-3 script-path (Tapscript multisig)
```
tr([fp/86h/0h/0h]xpub.../<0;1>/*,
   multi_a(2,
     [a/86h/0h/0h]xpub1.../<0;1>/*,
     [b/86h/0h/0h]xpub2.../<0;1>/*,
     [c/86h/0h/0h]xpub3.../<0;1>/*))#chk
```

## RPC integration

| RPC | Purpose |
|-----|---------|
| `getdescriptorinfo "desc"` | Compute checksum, validate syntax |
| `deriveaddresses "desc" range` | Generate addresses for a range |
| `importdescriptors` | Add to descriptors wallet (watch-only or signing) |
| `listdescriptors` | List descriptors in current wallet |

## Common bugs

- Missing key-origin → can't be used in multisig coordination.
- Hardened path component without an xprv → derivation fails (you
  can't derive hardened from xpub).
- Forgetting checksum on import in some implementations → rejection.
- Mixing `multi` (unsorted, key order matters for multisig signing)
  vs `sortedmulti` — multi requires same exact order on every signer.

## See also

- [psbt/SKILL.md](../psbt/SKILL.md)
- [miniscript/SKILL.md](../miniscript/SKILL.md)
- [../../wallets/hd/SKILL.md](../../wallets/hd/SKILL.md)
