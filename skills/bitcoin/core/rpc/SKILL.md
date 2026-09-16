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
| `getrawtransaction <txid> [verbose=2]` | Tx by hash (verbose=2 adds fee + prevout info) |
| `decoderawtransaction <hex>` | Parse a hex tx |
| `decodescript <hex>` | Parse a script |
| `sendrawtransaction <hex>` | Broadcast, returns txid |
| `testmempoolaccept '[<hex>,...]'` | Dry-run admit |
| `submitpackage '[<parent>,...,<child>]'` | Package submit: one child plus some/all/none of its unconfirmed parents, topologically sorted, child last |

Package limits (`doc/policy/packages.md`, as of Bitcoin Core 31.1, July 2026):
`MAX_PACKAGE_COUNT=25` transactions and `MAX_PACKAGE_WEIGHT=404000` weight
units. Parents may not depend on each other, and parents already in the mempool
need not be included. The 1-parent-1-child restriction applies only to package
*replacements*, not to submission. Submission is not atomic: each transaction is
validated individually first, so a package can partially succeed.

Since 31.0 (April 2026) a transaction in one-parent-one-child package *relay*
may have a parent whose feerate is below `-minrelaytxfee`, even zero fee; this
extends the 28.0 behaviour from TRUC to non-TRUC transactions (#33892). That is
a relay rule, not a `submitpackage` rule.

BIP 331 ("Ancestor Package Relay", Gloria Zhao, Peer Services layer, Status:
Draft as of September 2026) is the *P2P relay* proposal for requesting a
transaction's unconfirmed ancestors from a peer. It is unrelated to the
`submitpackage` RPC and to `getrawtransaction` verbosity.

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
| `getmempoolentry <txid>` | Single tx info (incl. `chunkweight`, `fees.chunk` since 31.0) |
| `getmempoolcluster <txid>` | Cluster containing that tx, split into chunks in mining order (31.0+) |
| `getmempoolfeeratediagram` | Cumulative weight/fee feerate diagram of the whole mempool (31.0+, hidden RPC) |
| `prioritisetransaction` | Mine-priority bump |

#### Cluster mempool (31.0+)

Bitcoin Core 31.0 (April 2026) reimplemented the mempool as a "cluster
mempool". Ancestor and descendant size/count limits are no longer enforced.
They are replaced by limits on a *cluster* - the connected component reachable
through any combination of parent/child links in the mempool:

| Limit | Default | Setting |
|-----|-----|-----|
| Transactions per cluster | 64 | `-limitclustercount` |
| Virtual size per cluster | 101 kvB | `-limitclustersize` |

Both are debug-only options (`-help-debug`). `-limitancestorcount` and
`-limitdescendantcount` still exist but no longer gate mempool acceptance; they
now only inform wallet coin selection. `-limitancestorsize` /
`-limitdescendantsize` have no effect and log a startup warning.

Other 31.0 consequences an integration must handle:

- Transactions are ordered by the feerate of the *chunk* they would be mined in
  (a parent and its child, or a larger subset), not by ancestor feerate. That
  ordering drives block template construction, eviction and relay announcement.
- RBF now requires the resulting mempool's feerate diagram to be strictly
  better than before the replacement. For a singleton transaction (a cluster of
  one) it is still sufficient to pay a higher fee *and* a higher feerate.
- The CPFP carveout was removed. Nothing bypasses the cluster count limit. The
  replacement pattern for contracting protocols is TRUC transactions plus
  sibling eviction.
- `getmempoolentry` gained `chunkweight` (sigops-adjusted, BIP 141 weight) and
  `fees.chunk`. `ancestorcount` / `ancestorsize` / `fees.ancestor` are still
  reported - they are just no longer limits.
- `getmempoolcluster <txid>` returns `clusterweight`, `txcount` and a `chunks`
  array, each chunk carrying `chunkfee`, `chunkweight` and its `txs` in mining
  order. `getmempoolfeeratediagram` returns an array of cumulative
  `{weight, fee}` points; it is registered in the `hidden` RPC table, so it
  works but does not show up in `help` output.

See `doc/policy/mempool-terminology.md` and
`doc/policy/mempool-replacements.md` in bitcoin/bitcoin.

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

## Operational hardening

`-rpcmaxconnections=<n>` caps the number of simultaneously connected HTTP
clients (default 16). Merged 2026-08-24 (#35730); it is not in any released
version as of September 2026 - the latest release is 31.1 (July 2026) - and is
expected in 32.0 (32.0rc1 was tagged 14 September 2026). Until then the only
levers are `-rpcthreads`, `-rpcworkqueue`, `-rpcallowip` and a reverse proxy.

The libevent-based HTTP server was replaced with an in-tree implementation on
master in June 2026 (merged 2026-06-22), after the 31.x branch was cut - so
31.1 (July 2026) still ships the libevent server and the replacement first
appears in 32.0. Two issues found while auditing it were fixed before 32.0rc1
and are worth knowing when operating an exposed endpoint:

- #36123 (merged 2026-09-05): the server kept reading and buffering a client's
  next request while still handling the current one, with no size limit. A
  client could block its own queue with a long call such as `waitforblock` and
  then flood the socket. The fix stops reading from the socket while a request
  is in flight so kernel TCP backpressure applies. The PR notes the vector is
  limited to authenticated clients - unauthenticated REST requests do not block
  for long enough to stop the server draining its receive buffer. A reviewer
  measured sixteen unauthenticated REST connections moving node RSS by 3 MB
  over 90 s after the fix, against 3.2 GB before.
- #36169 (merged 2026-09-06): on Windows the RPC listener set `SO_REUSEADDR`
  unconditionally, so another local process could bind the same port, receive a
  connection and capture the HTTP Basic `Authorization` header - i.e. the
  cookie credential. Fixed by using `SO_EXCLUSIVEADDRUSE` on Windows.

`-walletnotify` is a shell-injection surface. On non-Windows builds the `%w`
wallet-name placeholder was substituted with `std::regex_replace`, so a wallet
name containing `$'` broke the shell escaping and let an authenticated caller
who is allowed to `createwallet` run additional commands as the node's account.
Introduced in 24.0 (#25803) and fixed on master by #36048 (merged 2026-09-02);
the 31.x branch still carries the vulnerable substitution as of September 2026.
It is not reachable over P2P or by an unauthenticated peer. Treat
`createwallet` as a privileged RPC on any node that sets `-walletnotify`.

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
