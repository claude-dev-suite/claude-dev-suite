---
name: lightning-eclair
description: |
  Eclair Lightning implementation by ACINQ: Scala/Akka, eclair-cli,
  plugin system, primarily backend service. Powers Phoenix wallet's
  server side and ACINQ's main routing node.
  USE WHEN: deploying Eclair as backend, integrating with ACINQ's
  Phoenix backend, evaluating Scala/JVM Lightning options.
allowed-tools: Read, Grep, Glob
---

# Eclair (ACINQ)

Eclair is ACINQ's Lightning implementation. Scala-based, runs on JVM,
designed primarily as a **routing/payment infrastructure** node rather
than personal wallet.

## Versions and upgrade path

Release line as of September 2026 (dates from the ACINQ/eclair GitHub
releases page):

| Version | Released | Notes |
|---------|----------|-------|
| v0.14.3 | 2026-09-14 | Security hardening (most fixes from project Loupe); adds `on-chain-fees.max-funding-feerate`. |
| v0.14.2 | 2026-08-26 | Gossip-query and pre-auth connection rate limits; `tor.auth` defaults to `safecookie`; adds `channel.max-funding-satoshis`. |
| v0.14.1 | 2026-07-29 | Raises the Bitcoin Core floor to 31.x; disables the BOLT 12 blinded-path fee discount. |
| v0.14.0 | 2026-05-21 | Final splicing / taproot channels / zero-fee commitments; drops non-anchor channels. |
| v0.13.1 | 2025-10-27 | Last release supporting channels without anchor outputs. |

- **Bitcoin Core floor**: v0.14.0 raised the dependency to Core 30.x to
  get v3/TRUC transactions and ephemeral dust; v0.14.1 raised it again
  to 31.x. The v0.14.3 README states "Eclair requires Bitcoin Core 31
  or higher". The node must still be synchronized, wallet-enabled,
  non-pruning, tx-indexing and ZMQ-enabled.
- **Java**: Eclair targets Java 21 (Adoptium OpenJDK 21) as of v0.14.3.
- **Non-anchor channels are gone** in v0.14.0. Legacy channels must be
  closed *before* upgrading — v0.13.1 is the last release that can
  operate them. List them while still on v0.13.1 with
  `eclair-cli channels` and select commitments whose
  `commitmentFormat` is `legacy`, then `close` (or `forceclose` if the
  peer is offline).
- **Channel splicing, taproot channels (unannounced) and zero-fee
  commitments** shipped their final form in v0.14.0; zero-fee
  commitments remain flagged experimental there.
- **Experimental peer scoring** was added in v0.14.0 to optimize
  routing. Off by default (`eclair.peer-scoring.enabled = false`); it
  first only recommends liquidity and relay-fee actions, and must be
  explicitly configured before it acts on its own.
- Upgrades within the v0.14.x line need no channel closes: stop,
  upgrade, restart.

## Components

- `eclair-node` — main daemon.
- `eclair-cli` — CLI tool wrapping HTTP API.
- HTTP/JSON-RPC API (no gRPC by default).
- Phoenix (mobile wallet) talks to ACINQ's Eclair backend via custom
  protocol.

## Configuration

`eclair.conf`:
```hocon
eclair {
  chain = "mainnet"
  bitcoind {
    host = "127.0.0.1"
    rpcport = 8332
    rpcuser = "..."
    rpcpassword = "..."
    zmqblock = "tcp://127.0.0.1:28332"
    zmqtx = "tcp://127.0.0.1:28333"
  }
  api {
    enabled = true
    port = 8080
    binding-ip = "127.0.0.1"
    password = "..."
  }
  node-alias = "eclair-node"
  channel {
    min-public-funding-satoshis = 100000
    min-private-funding-satoshis = 100000
    // 50 BTC; added in v0.14.2, channels above this are rejected
    max-funding-satoshis = 5000000000
  }
  on-chain-fees {
    feerate-tolerance.ratio-low = 0.5
    feerate-tolerance.ratio-high = 10.0
    // sat/byte cap on funding and splice feerates; added in v0.14.3
    max-funding-feerate = 50
  }
  router.sync {
    // per-peer gossip-query limits added in v0.14.2
    max-queries-per-second = 5
    max-queries-per-sync = 2000
  }
}
```

HOCON syntax (superset of JSON).

## API

HTTP basic auth with single password (set in conf). Calls:
```bash
curl -u :password -X POST http://localhost:8080/getinfo
curl -u :password -d "uri=03abc...@host:9735" \
  http://localhost:8080/connect
curl -u :password -d "nodeId=03abc..." -d "fundingSatoshis=1000000" \
  http://localhost:8080/open
curl -u :password -d "invoice=lnbc..." \
  http://localhost:8080/payinvoice
```

## Plugin architecture

Eclair plugins are JVM JAR files dropped into the `plugins/` directory.
Implement `Plugin` interface in Scala/Java. Hooks into:
- Channel events.
- Payment events.
- Routing decisions.

## Watchtower

Eclair has **no watchtower**, client or server. As of September 2026
there is no watchtower code in `ACINQ/eclair` (checked at tag v0.14.3)
and no `eclair.conf` setting for one — breach protection depends on the
node itself being online to see a revoked commitment and publish the
penalty transaction.

- Penalty material lives in the node's own database. Eclair keeps
  per-HTLC revocation info for the lifetime of each channel and prunes
  it in batches once a close or splice confirms
  (`eclair.db.revoked-htlc-info-cleaner`).
- `eclair.blockchain-watchdog` is **not** a watchtower. It cross-checks
  the local chain tip against external header sources
  (`bitcoinheaders.net`, `blockcypher.com`, `blockstream.info`,
  `mempool.space` by default) and warns when the node falls behind
  (`missing-blocks-threshold = 7`). It detects eclipse/desync, not
  channel breaches.
- Budget for downtime accordingly:
  `eclair.channel.unhandled-exception-strategy` defaults to
  `local-close`, and `reference.conf` explicitly warns that an
  unmonitored node gives peers a window to publish a revoked
  commitment.

See [watchtowers/SKILL.md](../watchtowers/SKILL.md) for the third-party
options.

## Implementation strengths

- **Liquidity advertisement**: Eclair pioneered "liquidity ads" for
  selling channel inbound to peers.
- **PathFinding**: variant of Dijkstra with sophisticated probability
  tracking.
- **Backend / server-grade**: designed for high-throughput routing
  nodes.
- **Phoenix backend**: ACINQ's hosted infrastructure for Phoenix users.

## Phoenix integration

Phoenix mobile wallet uses a hybrid model:
- Mobile holds keys (self-custodial).
- ACINQ-hosted Eclair server is "trusted intermediary" for
  channel-on-pay and routing.
- "Splice-on-demand" — Phoenix can request capacity changes.

## Memory / resource

JVM-based: ~500 MB - 1 GB RAM typical. Heavier than LND/CLN/LDK but
not unreasonable for a backend.

## Common issues

- JVM tuning: heap too small → OOM under load.
- HTTP API password leak via process listing — use env var or file
  reference instead.
- Backup: SQLite database in `~/.eclair/eclair.sqlite.db`. Standard
  warnings about not restoring old DB.
- Plugin compatibility breaks across Eclair versions; verify before
  upgrading.
- Remote `bitcoind`: since v0.14.2 ACINQ documents that `bitcoind` must
  run on the same machine as Eclair, or behind a tunnel providing both
  encryption and authentication. A plain RPC connection over the
  network is treated as a broken setup.
- Tor: `eclair.tor.auth` defaults to `safecookie` from v0.14.2 onward,
  and password auth is rejected when `eclair.tor.host` is not a local
  address (v0.14.3 re-allows it on private networks). The onion private
  key is sent to the control port at every startup, so a remote control
  port leaks it regardless of auth method.
- Upgrading past v0.13.1 with non-anchor channels still open leaves no
  code path to operate them — close them first (see *Versions and
  upgrade path*).

## See also

- [bolts/SKILL.md](../bolts/SKILL.md)
- [channels/SKILL.md](../channels/SKILL.md)
- [consumer-wallets/SKILL.md](../consumer-wallets/SKILL.md)
