---
name: bitcoin-core-rest-api
description: |
  Bitcoin Core REST interface: read-only HTTP endpoints for blocks,
  txs, UTXOs, headers, mempool. No auth, no rate limit. Useful for
  high-throughput read services.
  USE WHEN: building read-only services that don't need RPC auth,
  fetching tx/block data efficiently, integrating with explorers.
allowed-tools: Read, Grep, Glob
---

# Bitcoin Core REST Interface

A read-only HTTP API exposed when `rest=1` is set. No authentication,
no batching needed, runs on the **same port as RPC** (8332).

## Enable

```ini
rest=1
rpcbind=127.0.0.1:8332
```

Recommended: bind only to localhost (or use a TLS reverse proxy for
public access).

## Endpoints

Format: `/rest/<resource>/<id>.<format>` where format is `json`,
`bin`, or `hex`.

| Path | Description |
|------|-------------|
| `/rest/tx/<txid>.json` | Tx by id (verbose JSON) |
| `/rest/tx/<txid>.bin` | Tx raw bytes |
| `/rest/tx/<txid>.hex` | Tx hex string |
| `/rest/block/<hash>.json` | Block (default verbosity 1, txs as txids) |
| `/rest/block/notxdetails/<hash>.json` | Block without tx details |
| `/rest/block/<hash>.bin` | Block raw bytes |
| `/rest/headers/<count>/<hash>.json` | Up to `count` headers from `hash` |
| `/rest/headers/<count>/<hash>.bin` | Headers as bytes |
| `/rest/blockhashbyheight/<height>.json` | Block hash for given height |
| `/rest/chaininfo.json` | Equivalent to getblockchaininfo |
| `/rest/mempool/info.json` | Mempool stats |
| `/rest/mempool/contents.json` | All mempool tx hashes (with verbose info) |
| `/rest/getutxos[/checkmempool]/<txid>-<vout>/<txid>-<vout>/.../.json` | UTXO existence check, multiple at once |

## Examples

```bash
# Get block hash for height 800000
curl -s 'http://127.0.0.1:8332/rest/blockhashbyheight/800000.json' | jq

# Get the block
curl -s 'http://127.0.0.1:8332/rest/block/<hash>.json' | jq '.tx[:5]'

# Get a tx (requires txindex if it's old)
curl -s 'http://127.0.0.1:8332/rest/tx/<txid>.json' | jq

# Check UTXO existence (multiple at once, with mempool consideration)
curl -s 'http://127.0.0.1:8332/rest/getutxos/checkmempool/<txid>-0/<txid2>-1.json' | jq
```

## When to prefer REST over RPC

| Aspect | RPC | REST |
|--------|-----|------|
| Auth | required | none |
| Output format | JSON only | JSON, bin, hex |
| Batch | yes (JSON-RPC array) | no (multiple HTTP calls) |
| Hot path performance | similar | similar (tiny edge for `.bin`) |
| Subscribe / push | no | no (use ZMQ) |
| Wallet ops | yes | no |
| Modify state | yes | no |
| HTTP-only environments | works | works |

REST is better for:
- High-throughput read services where RPC auth overhead matters.
- Public read APIs (with proxy).
- Tools that prefer raw HTTP / binary fetches.

RPC is better for:
- Anything writing state (broadcast, wallet ops).
- Atomic batch reads.
- Auth-required environments.

## Limits

- `getutxos` checks: max 15 UTXOs per call.
- `headers` endpoint: max 2000 headers per call.
- No built-in pagination for `mempool/contents`.

## Public exposure considerations

Bitcoin Core REST has no built-in TLS, no rate limiting, no auth.
For public exposure:
- TLS reverse proxy (nginx / Caddy).
- Rate limit (nginx `limit_req_zone`).
- Cache at the proxy layer (block data is immutable; tx data is
  immutable once mined).

Esplora / mempool.space build on top of Core's REST + custom indexers.

## Common bugs

- 404 on `/rest/tx/<txid>` for old tx → need `txindex=1`.
- 503 during sync → REST returns errors during IBD. Check
  `/rest/chaininfo.json` first.
- Querying with a `0x`-prefixed txid → no, just hex string.
- Mistaking `.bin` for hex string — `.bin` is raw binary bytes.

## See also

- [rpc/SKILL.md](../rpc/SKILL.md)
- [zmq/SKILL.md](../zmq/SKILL.md)
- [../../infrastructure/esplora/SKILL.md](../../infrastructure/esplora/SKILL.md)
