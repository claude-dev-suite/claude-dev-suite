---
name: bitcoin-wallets-hd
description: |
  HD wallet implementation: BIP32 derivation, BIP39 mnemonic seed
  (with passphrase), BIP44/49/84/86 derivation paths, account
  structure, gap limit, watch-only via xpub, BIP352 silent payment
  scan/spend derivation and BIP392 sp() descriptors.
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
| BIP352 | `m/352'/0'/account'/{0',1'}/0` | P2TR (silent payment) | `sp1q...` |

BIP352 is the odd one out: it derives two hardened branches (`1'` scan,
`0'` spend) instead of a change/index leaf, and `sp1q...` is a static
address string, not an output script. See below.

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

## Silent payments (BIP352 / BIP392)

Silent payments live in their own purpose tree. Two hardened branches,
not one account xpub:

```
scan_private_key:  m/352'/coin_type'/account'/1'/0
spend_private_key: m/352'/coin_type'/account'/0'/0
```

BIP352 requires hardened derivation for both: that is what makes it safe
to hand the scan private key to a scanning service without exposing the
master key or the spend key. The address is bech32m with HRP `sp`
(`sp1q...`, 116 chars on mainnet) or `tsp` on test networks, and never
appears on-chain — the outputs paid to it are ordinary BIP341 P2TR.

BIP392 (Draft; merged to the BIPs repo 2026-03-05, authored by Sparrow's
Craig Raw) puts this key material on the normal descriptor backup path
with a new top-level `sp()` expression:

```
sp([d34db33f/352h/0h/0h]spscan1q...)   # watch-only: scan privkey + spend pubkey
sp([d34db33f/352h/0h/0h]spspend1q...)  # full wallet: both private keys
sp(<WIF or xprv scan key>,<BIP380 spend key>)  # two-key form
```

- `spscan` and `spspend` are new bech32m key expressions (HRPs `spscan`
  / `spspend`, `tspscan` / `tspspend` on testnets), data part `q` for
  silent payments v0 followed by `ser256(b_scan) || serP(B_spend)` and
  `ser256(b_scan) || ser256(b_spend)` respectively.
- `sp()` is **top level only** — `sh(sp(...))` and `wsh(sp(...))` are
  invalid.
- Key origin on the single-key form points at the depth the two child
  paths (`1h/0` scan, `0h/0` spend) are derived from.
- In the two-key form the scan key must be private (scanning needs it);
  the spend key may be any BIP380 key expression resolving to a single
  key, including `musig()` from BIP390.
- Uncompressed keys are rejected anywhere under `sp()` — BIP352 permits
  only compressed pubkeys.

Status as of September 2026: BIP392 is still Draft, with reference
implementation and test vectors both marked TBD. Sparrow ships the
protocol itself — sending in 2.3.0 (October 2025), BIP375 PSBT fields
and DLEQ proof verification for hardware signers in 2.4.0 (February
2026), receiving wallets in 2.5.0 (May 2026). Bitcoin Core has no
`sp()` descriptor: libsecp256k1 0.8.0 (August 2026) added an optional
`silentpayments` module, but the wallet-level PRs (#35301, #35302,
#32966) were all still open as of September 2026.

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

Silent payments (BIP352) are a separate tree rather than a column here,
and support is uneven — check per wallet. Two fixed points as of
September 2026: Sparrow does SP send and receive (2.5.x), Bitcoin Core
implements neither the BIP392 `sp()` descriptor nor wallet-level silent
payments.

## See also

- [../../cryptography/bip32/SKILL.md](../../cryptography/bip32/SKILL.md)
- [../entropy/SKILL.md](../entropy/SKILL.md)
- [../backup/SKILL.md](../backup/SKILL.md)
- [../../protocol/descriptors/SKILL.md](../../protocol/descriptors/SKILL.md)
