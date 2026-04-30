---
name: bitcoin-wallet-labels
description: |
  BIP329 wallet labels portability: standard JSON Lines format for
  exporting/importing labels (addresses, txs, UTXOs, xpubs, inputs,
  outputs) across wallet software.
  USE WHEN: importing/exporting label sets, integrating with multiple
  wallets that should share annotations.
allowed-tools: Read, Grep, Glob
---

# BIP329 — Wallet Labels

Wallets maintain user-supplied labels: "Coffee shop", "Friend Alice",
"Cold storage 1". Pre-BIP329, labels were proprietary per wallet and
lost on migration. BIP329 standardizes a portable JSON Lines format.

## Format

One JSON object per line (NDJSON / JSONL):

```json
{"type":"tx","ref":"f91d0a8a78462bc59398f2c5d7a84fcff491c26ba54c4833478b202796c8aafd","label":"Coffee shop"}
{"type":"addr","ref":"bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh","label":"Friend Alice"}
{"type":"output","ref":"f91d0a8a...:0","label":"Sent to Alice"}
{"type":"input","ref":"a32f...:1","label":"Spent from cold storage"}
{"type":"xpub","ref":"xpub6CV2...","label":"Account 1"}
{"type":"pubkey","ref":"02f7e2...","label":"Cosigner Bob"}
```

## Type field values

| Type | `ref` semantics |
|------|----------------|
| `tx` | txid |
| `addr` | address |
| `pubkey` | hex-encoded pubkey |
| `xpub` | xpub serialization |
| `input` | `<txid>:<vin>` |
| `output` | `<txid>:<vout>` |

## Optional fields

```json
{
  "type":"addr",
  "ref":"bc1q...",
  "label":"Customer 123",
  "origin":"vendor-X",       // optional source identifier
  "spendable":true            // for output: still spendable hint
}
```

## Spendability hint

For UTXOs that are part of a multi-step protocol (vault unvault, LN
HTLC, frozen for CoinJoin), the wallet may mark them `"spendable":false`.
Importing wallet sees this and excludes them from coin selection by
default.

## Filename convention

`<wallet_name>-labels.jsonl` typical extension.

## Import flow

```
for line in file:
    obj = json.loads(line)
    if obj.type == "tx":   wallet.set_tx_label(obj.ref, obj.label)
    if obj.type == "addr": wallet.set_addr_label(obj.ref, obj.label)
    ...
```

Conflict resolution: import options:
- **Replace**: overwrite existing labels.
- **Merge**: keep existing if conflict, add new ones.
- **Skip duplicates**: do nothing for conflicts.

## Encryption

BIP329 doesn't define encryption. Common practice:
- Encrypt the JSONL file with age, GPG, or wallet-derived key.
- Some wallets export `.aes` or `.gpg` versions natively.

## Implementations

- **Sparrow** — full BIP329 import/export.
- **Specter Desktop** — supports import/export.
- **BlueWallet** — partial support (tx labels only).
- **Bitcoin Core** — labels stored internally; export via JSON RPC
  (`listlabels`, `getaddressesbylabel`) but not BIP329-formatted yet.

## Use cases

- **Migration** — moving from one wallet to another without losing
  the human-readable annotations.
- **Multi-wallet** — same UTXO set viewed in two wallets, both see
  the same labels.
- **Audit / compliance** — exchanges export labels for accounting.
- **Backup** — labels alongside seed backup for full wallet restore.

## Common bugs

- Mixing **address labels** with **xpub labels** semantically — an
  xpub's label applies to the account, not individual addresses.
- Stripping non-ASCII chars on import → labels with emojis / non-Latin
  scripts truncated.
- Exporting **internal change addresses** as labeled-by-default → noise
  in import.
- Unicode normalization (NFC vs NFD) inconsistency between
  exporter / importer.

## See also

- [hd/SKILL.md](../hd/SKILL.md)
- [backup/SKILL.md](../backup/SKILL.md)
