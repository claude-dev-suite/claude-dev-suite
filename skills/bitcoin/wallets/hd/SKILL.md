---
name: bitcoin-wallets-hd
description: |
  HD wallet implementation: BIP32 derivation, BIP39 mnemonic seed
  (with passphrase), BIP44/49/84/86 derivation paths, account
  structure, gap limit, watch-only via xpub.
  USE WHEN: building/restoring an HD wallet, choosing derivation
  paths, debugging address generation, importing mnemonics.
allowed-tools: Read, Grep, Glob
---

# HD Wallets

The standard architecture for Bitcoin wallets since 2014. One mnemonic
+ optional passphrase generates an unlimited tree of addresses.

## Mnemonic seed (BIP39)

```
1. Generate 128/160/192/224/256 bits of entropy.
2. Append checksum: first ENT/32 bits of SHA256(entropy).
3. Split into 11-bit groups → indices into BIP39 wordlist.
4. Word count: 12 (128-bit), 15, 18, 21, 24 (256-bit).
```

Recommended: 12 words for general use, 24 words for high-value.

### Passphrase

```
PBKDF2(password=mnemonic, salt="mnemonic" || passphrase,
       iter=2048, hash=SHA512, len=64) → 64-byte seed
```

Without passphrase, salt is just `"mnemonic"`. The passphrase
generates a **completely different** seed — even one character
difference = different wallet.

**Critical**: passphrase has no on-chain or wallet-level marker.
Lose it = funds gone. Recover only if you remember exact passphrase.

## BIP32 master key

```
HMAC-SHA512(key="Bitcoin seed", msg=seed) → 64 bytes
  Left 32  → master private key
  Right 32 → master chain code
```

See [../../cryptography/bip32/SKILL.md](../../cryptography/bip32/SKILL.md).

## Standard derivation paths

| BIP | Path | Output | Address prefix |
|-----|------|--------|---------------|
| BIP44 | `m/44'/0'/account'/change/index` | P2PKH | `1...` |
| BIP49 | `m/49'/0'/account'/change/index` | P2SH-P2WPKH | `3...` |
| BIP84 | `m/84'/0'/account'/change/index` | P2WPKH | `bc1q...` |
| BIP86 | `m/86'/0'/account'/change/index` | P2TR | `bc1p...` |
| BIP48 | `m/48'/0'/account'/script_type'/change/index` | multisig | `bc1q...`/`bc1p...` |

Coin types: 0 = mainnet, 1 = testnet, 1776 = Liquid.

`change=0` for receive, `change=1` for change.

`account'` is hardened — separates wallets logically. `account=0`
for primary.

## Gap limit

When recovering from mnemonic, scan addresses sequentially until you
hit `N` consecutive empty addresses. Default `N=20`. Some wallets use
1000 for paranoid recovery.

## Account structure

Modern wallets use **descriptors** for the watch-only metadata:
```
wpkh([d34db33f/84h/0h/0h]xpub.../<0;1>/*)#chk
```

This single descriptor produces:
- Receive: `wpkh(.../<0;1>/0)`, `wpkh(.../<0;1>/1)`, ...
- Change:  `wpkh(.../<0;1>/0)` with index 1 instead of 0.

Or two separate descriptors with `;0/*` and `;1/*`.

## Multi-account wallets

Most users have one account. Multi-account wallets:
- Each account has its own xpub.
- Wallet UI lets user switch.
- Useful for bookkeeping (personal vs business) or privacy
  (no chain-analysis link between accounts).

## Watch-only via xpub

Export the **account-level xpub** (e.g., `m/84'/0'/0'`):
```
account_xpub = xpub6CV2... (with [d34db33f/84h/0h/0h] origin)
```

Import to a wallet that knows derivation paths but never holds the
seed:
```bash
bitcoin-cli importdescriptors '[
  {"desc":"wpkh([d34db33f/84h/0h/0h]xpub6CV2.../<0;1>/*)#chk",
   "active":true,"range":[0,999],"timestamp":"now"}
]'
```

This wallet can:
- Generate addresses, watch incoming.
- Build PSBT for spending (Updater role).
- Send PSBT to a hot/cold signer.
Never sees private keys, can't accidentally sign.

## Common bugs and pitfalls

- **BIP39 wordlist confusion** — most wallets use English; some
  support multiple. The wordlist used must match the passphrase
  derivation salt language too.
- **Wrong derivation path** — Ledger defaults to BIP44 even for
  segwit accounts; force BIP84/BIP86 explicitly.
- **Reusing the same seed across BIP44/49/84** — privacy bleed.
  Different addresses but observers can correlate via xpubs.
- **No passphrase backup** — passphrase loss = funds lost.
- **Truncated entropy** — using `Math.random()` or `time-based`
  RNG for entropy → catastrophic.
- **Address reuse** — same address used multiple times: privacy
  loss + exposes the public key after first spend.

## Compatibility matrix

| Wallet | BIP44 | BIP49 | BIP84 | BIP86 | Multisig (BIP48) |
|--------|-------|-------|-------|-------|------------------|
| Bitcoin Core (descriptor) | yes | yes | yes | yes | yes |
| Sparrow | yes | yes | yes | yes | yes |
| Specter | yes | yes | yes | yes | yes |
| Electrum | yes | yes | yes | partial | yes |
| BlueWallet | yes | yes | yes | yes | yes |
| Trezor (Suite) | yes | yes | yes | yes | yes |
| Ledger (Live) | yes | yes | yes | yes | manual |
| Coldcard (Mk4 / Q) | yes | yes | yes | yes | yes |

## See also

- [../../cryptography/bip32/SKILL.md](../../cryptography/bip32/SKILL.md)
- [../entropy/SKILL.md](../entropy/SKILL.md)
- [../backup/SKILL.md](../backup/SKILL.md)
- [../../protocol/descriptors/SKILL.md](../../protocol/descriptors/SKILL.md)
