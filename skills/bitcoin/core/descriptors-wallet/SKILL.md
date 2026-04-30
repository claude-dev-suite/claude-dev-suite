---
name: bitcoin-core-descriptors-wallet
description: |
  Bitcoin Core descriptors wallet: createwallet, importdescriptors,
  multipath, ranges, watch-only, signing wallets, multisig coordination.
  Replaces legacy BDB wallet.
  USE WHEN: setting up Bitcoin Core wallet, watching xpubs, building
  signing pipelines via Core.
allowed-tools: Read, Grep, Glob
---

# Descriptors Wallet (Bitcoin Core)

Since Bitcoin Core 23.0, descriptor wallets are the default. Legacy
BDB wallets are deprecated and cannot be created in 27.0+.

## Create

```bash
bitcoin-cli createwallet "hot" \
  disable_private_keys=false \
  blank=false \
  passphrase="" \
  avoid_reuse=false \
  descriptors=true \
  load_on_startup=true
```

Options:
- `disable_private_keys=true` for watch-only.
- `blank=true` to create without auto-generated descriptors (you'll
  import yours).
- `passphrase` (SQLite-level encryption).

## Default descriptors

When created with `blank=false`, Core auto-generates:
- `pkh()` (legacy) — receive + change.
- `sh(wpkh())` (P2SH-segwit) — receive + change.
- `wpkh()` (native segwit) — receive + change.
- `tr()` (Taproot) — receive + change.

Each at standard BIP44/49/84/86 paths under a fresh internal master.

## Import descriptors

For watch-only wallet importing an xpub:
```json
[
  {
    "desc": "wpkh([d34db33f/84h/0h/0h]xpub6CV2.../<0;1>/*)#chk",
    "active": true,
    "internal": false,
    "range": [0, 999],
    "next_index": 0,
    "timestamp": "now"
  }
]
```

`active`: marks the receiving descriptor.
`internal`: change chain (alternate path).
`range`: scan window.
`timestamp`: `now` (no rescan) or unix timestamp (rescan from then).

For a signing wallet, use the privkey form:
```
{"desc": "wpkh([fp/84h/0h/0h]xprv.../<0;1>/*)#chk", ...}
```

## Inspecting

```bash
bitcoin-cli -rpcwallet=hot listdescriptors
bitcoin-cli -rpcwallet=hot listdescriptors true   # show private keys
bitcoin-cli -rpcwallet=hot getdescriptorinfo "<desc>"
```

## Multipath descriptors (BIP389)

```
wpkh([fp/84h/0h/0h]xpub.../<0;1>/*)#chk
```

`<0;1>` = receive (0) and change (1). One descriptor handles both
chains. Modern wallets prefer this over two separate descriptors.

## Multisig

```bash
bitcoin-cli -rpcwallet=ms createwallet "ms" \
  disable_private_keys=true descriptors=true blank=true

bitcoin-cli -rpcwallet=ms importdescriptors '[
  {"desc":"wsh(sortedmulti(2,[fp1/48h/0h/0h/2h]xpub1.../<0;1>/*,[fp2/48h/0h/0h/2h]xpub2.../<0;1>/*,[fp3/48h/0h/0h/2h]xpub3.../<0;1>/*))#chk",
   "active":true,"internal":false,"range":[0,999],"timestamp":"now"},
  {"desc":"wsh(sortedmulti(2,[fp1/48h/0h/0h/2h]xpub1.../<0;1>/*,[fp2/48h/0h/0h/2h]xpub2.../<0;1>/*,[fp3/48h/0h/0h/2h]xpub3.../<0;1>/*))#chk",
   "active":true,"internal":true,"range":[0,999],"timestamp":"now"}
]'
```

Or use `<0;1>/*` and only one entry.

## Receiving addresses

```bash
bitcoin-cli -rpcwallet=hot getnewaddress         # next external
bitcoin-cli -rpcwallet=hot getrawchangeaddress   # next internal
bitcoin-cli -rpcwallet=hot deriveaddresses "<desc>" '[0,9]'   # range
```

## Building / signing PSBT

```bash
# Build PSBT funded with appropriate inputs and change
bitcoin-cli -rpcwallet=hot walletcreatefundedpsbt \
  '[]'  '[{"bc1q...": 0.001}]'  0  '{"feeRate": 0.00001}'

# Sign
bitcoin-cli -rpcwallet=hot walletprocesspsbt "<psbt>"

# Or fully build and broadcast in one go (signing wallet only)
bitcoin-cli -rpcwallet=hot sendtoaddress bc1q... 0.001
```

For multisig coordination across separate wallets:
```bash
# Wallet A signs partial
psbt_a=$(bitcoin-cli -rpcwallet=signA walletprocesspsbt "$psbt" | jq -r .psbt)
# Wallet B signs partial
psbt_ab=$(bitcoin-cli -rpcwallet=signB walletprocesspsbt "$psbt_a" | jq -r .psbt)
# Combine + finalize
final=$(bitcoin-cli combinepsbt "[\"$psbt_ab\"]")
hex=$(bitcoin-cli finalizepsbt "$final" | jq -r .hex)
bitcoin-cli sendrawtransaction "$hex"
```

## Migrating legacy → descriptors

```bash
bitcoin-cli -rpcwallet=legacywallet migratewallet
```

Creates a fresh descriptor wallet derived from the legacy keys. Old
legacy wallet remains in `wallets/legacywallet.legacy/`.

## Common bugs

- Forgetting `range` on import → only address index 0 generated.
- `timestamp: 0` → triggers full chain rescan (slow).
- Mixing `[fp/path]` formatting (e.g., missing `]`) → checksum
  mismatch on import.
- Importing both `wpkh` and `sh(wpkh)` for same xpub but treating as
  separate accounts → in fact same key, different script type.
- Multisig with `multi` (unsorted) but signers in different order
  across wallets → completely different addresses.

## See also

- [../../protocol/descriptors/SKILL.md](../../protocol/descriptors/SKILL.md)
- [../../protocol/psbt/SKILL.md](../../protocol/psbt/SKILL.md)
- [../../wallets/hd/SKILL.md](../../wallets/hd/SKILL.md)
