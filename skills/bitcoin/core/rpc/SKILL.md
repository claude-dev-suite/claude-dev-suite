---
name: bitcoin-core-rpc
description: |
  Bitcoin Core JSON-RPC interface: authentication (cookie, rpcauth),
  wallet vs node RPCs, common verbs (getblockchaininfo, getrawtransaction,
  scantxoutset, importdescriptors, walletprocesspsbt, submitpackage,
  testmempoolaccept), error handling.
  USE WHEN: scripting bitcoind, integrating a service, debugging RPC
  errors.
allowed-tools: Read, Grep, Glob
---

# Bitcoin Core JSON-RPC

## Authentication

### Cookie auth (recommended for local)
- File `~/.bitcoin/.cookie` is auto-generated; format `__cookie__:<random>`.
- `bitcoin-cli` uses cookie automatically.
- HTTP: `Authorization: Basic base64(cookie_contents)`.

### `rpcauth` (recommended for remote)
Generated via `share/rpcauth/rpcauth.py user`:
```
rpcauth=user:<salt>$<hmac_sha256>
```
Add to `bitcoin.conf`. Works without storing plaintext password.

### `rpcuser`/`rpcpassword` (legacy, avoid)
Plaintext in conf; risk of leaking via process listings.

## Wallet vs node RPCs

- **Node RPCs**: per-node, no wallet context (`getblockchaininfo`,
  `getrawtransaction`, `scantxoutset`).
- **Wallet RPCs**: bound to a specific wallet (`getbalance`,
  `walletprocesspsbt`, `listunspent`).

Multi-wallet: use `rpcwallet=` URL parameter or `bitcoin-cli
-rpcwallet=<name>`:
```bash
bitcoin-cli -rpcwallet=hot getbalance
curl -u user:pass --data '{"jsonrpc":"2.0","id":1,"method":"getbalance"}' \
  http://127.0.0.1:8332/wallet/hot
```

## Common verbs (selected)

### Chain & block
| RPC | Use |
|-----|-----|
| `getblockchaininfo` | Sync state, network, deployments |
| `getbestblockhash` | Tip hash |
| `getblock <hash> [verbosity 0-3]` | Block data, increasing detail |
| `getblockstats <hash> [stats]` | Block-level stats (fees, sigops) |
| `gettxoutsetinfo` | UTXO set statistics |
| `verifychain` | Background reverification |

### Transactions
| RPC | Use |
|-----|-----|
| `getrawtransaction <txid> [verbose=2]` | Tx by hash (verbose=2 includes prevout values, BIP331) |
| `decoderawtransaction <hex>` | Parse a hex tx |
| `decodescript <hex>` | Parse a script |
| `sendrawtransaction <hex>` | Broadcast, returns txid |
| `testmempoolaccept '[<hex>,...]'` | Dry-run admit |
| `submitpackage '[<parent>,<child>]'` | Atomic package submit (BIP331) |

### Wallet
| RPC | Use |
|-----|-----|
| `createwallet <name> [...]` | Create wallet (default: descriptors=true since 23.0) |
| `loadwallet <name>` / `unloadwallet` | Load/unload from disk |
| `listunspent [minconf] [maxconf] [addrs]` | UTXOs, with desc info |
| `getbalances` | Mine/trusted/untrusted, immature, frozen |
| `walletprocesspsbt <psbt>` | Sign + finalize where possible |
| `walletcreatefundedpsbt` | Build PSBT, fund inputs, add change |
| `combinepsbt`, `finalizepsbt`, `decodepsbt`, `analyzepsbt` | PSBT roles |
| `importdescriptors '[<obj>,...]'` | Add descriptors to wallet |
| `listdescriptors [private]` | Inspect wallet descriptors |
| `bumpfee <txid>`, `psbtbumpfee` | RBF helpers |

### Mempool
| RPC | Use |
|-----|-----|
| `getmempoolinfo` | Counts, size, fee floor |
| `getrawmempool [verbose]` | Tx list (verbose: full info incl. ancestor counts) |
| `getmempoolentry <txid>` | Single tx info |
| `prioritisetransaction` | Mine-priority bump |

### Scanning (no wallet needed)
| RPC | Use |
|-----|-----|
| `scantxoutset start '[<descriptors>]'` | Scan UTXO set for descriptor matches |
| `scanblocks` | Scan blocks for descriptor matches (needs blockfilterindex) |

### Network
| RPC | Use |
|-----|-----|
| `getpeerinfo` | All peer connections + stats |
| `getnetworkinfo` | Local node net info |
| `getnodeaddresses` | Known addr database |
| `addnode <ip> <command>` | Manual peer mgmt |
| `disconnectnode <addr|nodeid>` | Drop a peer |

## Curl examples

```bash
# Single call
curl -u "$(cat ~/.bitcoin/.cookie)" \
  --data '{"jsonrpc":"2.0","id":"x","method":"getblockchaininfo","params":[]}' \
  -H 'Content-Type: application/json' \
  http://127.0.0.1:8332/

# Wallet call
curl -u "$(cat ~/.bitcoin/.cookie)" \
  --data '{"jsonrpc":"2.0","id":"x","method":"getbalance","params":[]}' \
  http://127.0.0.1:8332/wallet/hot

# Batch
curl -u "$(cat ~/.bitcoin/.cookie)" \
  --data '[
    {"jsonrpc":"2.0","id":1,"method":"getblockcount"},
    {"jsonrpc":"2.0","id":2,"method":"getbestblockhash"}
  ]' http://127.0.0.1:8332/
```

## Error codes

```
-1   Misc / internal
-3   Type mismatch
-5   Object not found (e.g., tx not in mempool/chain)
-8   Invalid parameter
-22  Invalid address / encoding
-25  Validation rejected (e.g., min relay fee not met)
-26  Tx rejected (txn-mempool-conflict, missing-inputs, etc.)
-27  Tx already in chain
```

## RPC whitelisting

`bitcoin.conf`:
```
rpcwhitelist=ro:getblockcount,getblockhash,getrawtransaction
rpcauth=ro:...
```

Restricts which RPCs a given user can call.

## Common bugs

- Calling wallet RPCs against a node with no wallet loaded → "Wallet
  file not specified" error. Specify `-rpcwallet=` or load default.
- Forgetting `verbose=2` for `getrawtransaction` to get spent prevout
  amounts (essential for fee computation post-pruning).
- Treating `getrawtransaction` for a pruned tx without `txindex` →
  fails with -5 if tx is old.
- Race conditions: tx in mempool when you check, gone (mined or
  evicted) when you act. Always handle "not found" gracefully.

## See also

- [operations/SKILL.md](../operations/SKILL.md)
- [descriptors-wallet/SKILL.md](../descriptors-wallet/SKILL.md)
- [indexes/SKILL.md](../indexes/SKILL.md)
- [rest-api/SKILL.md](../rest-api/SKILL.md)
