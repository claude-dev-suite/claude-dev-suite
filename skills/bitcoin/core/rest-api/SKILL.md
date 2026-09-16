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
| `/rest/blockpart/<hash>.bin?offset=<o>&size=<n>` | Byte range inside a block (added in 31.0, April 2026) |
| `/rest/headers/<hash>.json?count=<n>` | `count` headers upward from `hash` (**default 5**) |
| `/rest/headers/<hash>.bin?count=<n>` | Headers as bytes |
| `/rest/blockfilterheaders/<type>/<hash>.json?count=<n>` | BIP157 filter headers upward (**default 5**) |
| `/rest/blockfilter/<type>/<hash>.json` | BIP158 filter for one block |
| `/rest/blockhashbyheight/<height>.json` | Block hash for given height |
| `/rest/spenttxouts/<hash>.json` | Block's spent outputs from undo data (added in 30.0, October 2025) |
| `/rest/chaininfo.json` | Equivalent to getblockchaininfo |
| `/rest/deploymentinfo[/<hash>].json` | Equivalent to getdeploymentinfo |
| `/rest/mempool/info.json` | Mempool stats |
| `/rest/mempool/contents.json` | All mempool tx hashes (with verbose info) |
| `/rest/getutxos[/checkmempool]/<txid>-<vout>/<txid>-<vout>/.../.json` | UTXO existence check, multiple at once |

The only `<type>` for the filter endpoints is `basic`, and both require
`blockfilterindex=1` (otherwise 400 "Index is not enabled for filtertype").

`GET /rest/headers/<count>/<hash>.<fmt>` and
`GET /rest/blockfilterheaders/<type>/<count>/<hash>.<fmt>` are the old path
forms. Both have been **deprecated since 24.0** and still work as of 31.1
(July 2026), but new code should use the `?count=` query form. Note the trap:
omit `count` and you silently get 5 headers, not an error.

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

# Headers: ask for the count explicitly, or you get 5
curl -s 'http://127.0.0.1:8332/rest/headers/<hash>.json?count=2000' | jq length

# A block's spent prevouts, straight from undo data (no txindex needed).
# Index 0 is the coinbase placeholder (always []), so tx n is at index n.
curl -s 'http://127.0.0.1:8332/rest/spenttxouts/<hash>.json' | jq '.[1][0]'

# First 80 bytes of a block = its header, without pulling the whole block
curl -s 'http://127.0.0.1:8332/rest/blockpart/<hash>.hex?offset=0&size=80'
```

## When to prefer REST over RPC

| Aspect | RPC | REST |
|--------|-----|------|
| Auth | required | none |
| Output format | JSON only | JSON, bin, hex |
| Batch | yes (JSON-RPC array) | no (multiple HTTP calls) |
| Response encoding | hex + JSON per response | `.bin` returns raw bytes, no hex/JSON step |
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

- `getutxos` checks: max 15 UTXOs per call (`MAX_GETUTXOS_OUTPOINTS`).
- `headers` / `blockfilterheaders`: `count` must be 1..2000
  (`MAX_REST_HEADERS_RESULTS`); out of range is a 400, not a clamp. Default 5.
- No built-in pagination for `mempool/contents`.

## Public exposure considerations

Bitcoin Core REST has no built-in TLS, no rate limiting, no auth.
For public exposure:
- TLS reverse proxy (nginx / Caddy).
- Rate limit (nginx `limit_req_zone`).
- Cache at the proxy layer (block data is immutable; tx data is
  immutable once mined).

Through 31.1 (July 2026) Core sets no `Cache-Control` itself, so the proxy is
the whole cache policy. Master and `v32.0rc1` (tagged 14 September 2026; 32.0
unreleased as of 15 September 2026) add defaults: `public, immutable,
max-age=86400` on `/block` and `/block/notxdetails` bin/hex, `/blockpart`,
`/blockfilter`, `/spenttxouts` and `/deploymentinfo/<hash>.json`; `no-store` on
everything else, errors included. No `ETag`/`Last-Modified` either way.

Esplora / mempool.space build on top of Core's REST + custom indexers.

## Hardening

REST is served by the **same HTTP server, on the same port, as RPC**, so the
HTTP-server limits gate REST traffic too - and the two share one pool:

- `-rpcmaxconnections=<n>` - simultaneously connected HTTP clients, RPC and
  REST together, **default 16**. New in 32.0, which rewrote the HTTP server
  from scratch to replace libevent (#35182); there is no connection cap
  through 31.1 (July 2026).
- `-rpcworkqueue=<n>` (default 64) and `-rpcthreads=<n>` (default 16) bound
  queued and in-flight requests. Both exist in 31.1 as well.
- `-rpcallowip` applies to REST. From 32.0 a client from a disallowed address
  is disconnected immediately.

Why the connection cap is worth setting deliberately: on master, between the
HTTP-server rewrite and PR #36123 (merged 5 September 2026), a client could
pipeline requests into a connection whose previous request was still in flight
and grow server memory without bound. A reviewer measured sixteen
unauthenticated REST connections - exactly the default cap - moving RSS by
3.2 GB over 90 seconds before the fix, against 3 MB after. #36123 is an
ancestor of the `v32.0rc1` tag (14 September 2026), so the regression never
reached a release, but the cap bounds rather than removes per-connection
buffering.

A browser on the same host is its own risk: a hostile page can read tx/block
data off your node with `<script src="http://127.0.0.1:8332/rest/tx/...json">`.

## Common bugs

- 404 on `/rest/tx/<txid>` for old tx → need `txindex=1`.
- 503 during sync → REST returns errors during IBD. Check
  `/rest/chaininfo.json` first.
- Querying with a `0x`-prefixed txid → no, just hex string.
- `/rest/headers/<hash>.json` with no `count` → 5 headers silently, not the
  whole range. Always pass `?count=`.
- Mistaking `.bin` for hex string — `.bin` is raw binary bytes.

## See also

- [rpc/SKILL.md](../rpc/SKILL.md)
- [zmq/SKILL.md](../zmq/SKILL.md)
- [../../infrastructure/esplora/SKILL.md](../../infrastructure/esplora/SKILL.md)
