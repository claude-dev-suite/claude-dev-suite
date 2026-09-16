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

Descriptor wallets have been the default since Bitcoin Core 23.0.
Since Bitcoin Core 30.0 (October 2025) BDB legacy wallets can no longer
be created *or loaded* — they must be migrated. Current as of Bitcoin
Core 31.1 (July 2026).

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
- `descriptors` has defaulted to `true` since 23.0; since 30.0 it must
  also *be* `true` — `false` errors with `descriptors argument must be
  set to "true"; it is no longer possible to create a legacy wallet.`

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

## MuSig2 descriptors (BIP390)

```
tr(musig([fp1/...]xpub1.../<0;1>/*,[fp2/...]xpub2.../<0;1>/*))
tr(musig([fp1/...]xpub1...,[fp2/...]xpub2...)/<0;1>/*)
```

`musig(KEY,...)` aggregates the participants into one BIP327 key, so
both the output and the spend look like ordinary single-sig Taproot.
Core allows `musig()` only inside `tr()` and `rawtr()`, never nested in
another `musig()`, and sorts the participant keys after derivation and
before aggregating, so the order they are written in does not change
the address — but the descriptor *string* keeps the written order, so
participants who write the keys in different orders hold descriptors
with different `#chk` checksums. Derivation steps written *after*
`musig(...)` run on the BIP328 synthetic xpub, must be unhardened, and
are only legal when no participant key is itself ranged. Multipath is
the same either/or: `<0;1>` may sit on the participant keys or after
`musig(...)`, never on both.

Never auto-generated: import it, each participant importing the same
descriptor with only their own key in private form.

Support, as of Bitcoin Core 31.1 (July 2026):
- 30.0 (October 2025): descriptor parsing and address derivation
  (`getdescriptorinfo`, `deriveaddresses`), plus the BIP373 PSBT fields
  `PSBT_IN_MUSIG2_PARTICIPANT_PUBKEYS` (`0x1a`),
  `PSBT_IN_MUSIG2_PUB_NONCE` (`0x1b`),
  `PSBT_IN_MUSIG2_PARTIAL_SIG` (`0x1c`) and
  `PSBT_OUT_MUSIG2_PARTICIPANT_PUBKEYS` (`0x08`).
- 31.0 (April 2026): the wallet can receive *and spend* — nonce
  generation and partial signing inside `walletprocesspsbt`
  (PR #29675, merged 2025-10-14).

Neither the 30.0 nor the 31.0 release notes mention MuSig2 at all, so
check `doc/descriptors.md` and `test/functional/wallet_musig.py` in the
tag you actually run rather than the notes.

Signing takes two `walletprocesspsbt` passes per participant, one per
MuSig2 round:
```bash
# Round 1 - every participant wallet adds its public nonce
n1=$(bitcoin-cli -rpcwallet=p1 walletprocesspsbt "$psbt" | jq -r .psbt)
n2=$(bitcoin-cli -rpcwallet=p2 walletprocesspsbt "$psbt" | jq -r .psbt)
nonces=$(bitcoin-cli combinepsbt "[\"$n1\",\"$n2\"]")

# Round 2 - every participant adds its partial signature
s1=$(bitcoin-cli -rpcwallet=p1 walletprocesspsbt "$nonces" | jq -r .psbt)
s2=$(bitcoin-cli -rpcwallet=p2 walletprocesspsbt "$nonces" | jq -r .psbt)
sigs=$(bitcoin-cli combinepsbt "[\"$s1\",\"$s2\"]")
bitcoin-cli finalizepsbt "$sigs"
```

`decodepsbt` reports `musig2_participant_pubkeys`, `musig2_pubnonces`
and `musig2_partial_sigs`, which is how you tell which round is short.
Secnonces are held in memory only and never serialized to the wallet
file.

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

Pass the wallet name (or address it through the `-rpcwallet=` endpoint);
the wallet does not need to be loaded — since 30.0 it cannot be:

```bash
bitcoin-cli migratewallet "legacywallet"
bitcoin-cli migratewallet "legacywallet" "<passphrase>"   # if encrypted
```

Core opens the BDB file read-only inside the call, writes a backup named
`<wallet name>-<timestamp>.legacy.bak` into that wallet's directory, and
replaces the wallet with a descriptor one. Restore that backup with
`restorewallet` if the migration went wrong.

Result fields: `wallet_name`, `backup_path`, plus `watchonly_name` and
`solvables_name` when the legacy wallet held watch-only or
solvable-but-unwatched scripts that get split into their own wallets.

## Legacy RPCs removed in 30.0

Gone, with no descriptor-wallet equivalent under the same name:
`addmultisigaddress`, `dumpprivkey`, `dumpwallet`, `importaddress`,
`importmulti`, `importprivkey`, `importpubkey`, `importwallet`,
`newkeypool`, `sethdseed`, `upgradewallet`. The `bitcoin-wallet` tool
also dropped its `-legacy`, `-descriptors` and `-withinternalbdb`
options.

Port old scripts to `importdescriptors` (import), `listdescriptors`
(export, `true` for private keys) and `createwalletdescriptor` (add a
script type to an existing wallet).

## Common bugs

- Forgetting `range` on import → only address index 0 generated.
- `timestamp: 0` → triggers full chain rescan (slow).
- Mixing `[fp/path]` formatting (e.g., missing `]`) → checksum
  mismatch on import.
- Importing both `wpkh` and `sh(wpkh)` for same xpub but treating as
  separate accounts → in fact same key, different script type.
- Multisig with `multi` (unsorted) but signers in different order
  across wallets → completely different addresses.
- Restarting bitcoind between the two MuSig2 rounds → the in-memory
  secnonces are gone and every participant must re-nonce.

## See also

- [../../protocol/descriptors/SKILL.md](../../protocol/descriptors/SKILL.md)
- [../../protocol/psbt/SKILL.md](../../protocol/psbt/SKILL.md)
- [../../wallets/hd/SKILL.md](../../wallets/hd/SKILL.md)
- [../../cryptography/musig2/SKILL.md](../../cryptography/musig2/SKILL.md)
