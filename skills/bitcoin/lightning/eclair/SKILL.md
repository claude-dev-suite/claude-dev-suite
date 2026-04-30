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
    fund-min = 100000 sat
    fund-max = 500000000 sat
  }
  on-chain-fees {
    feerate-tolerance.ratio-low = 0.5
    feerate-tolerance.ratio-high = 10.0
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

Eclair has built-in watchtower for outbound channels:
```hocon
eclair.watchtowers {
  client.enabled = true
}
```

Sends encrypted breach blobs to configured tower nodes.

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

## See also

- [bolts/SKILL.md](../bolts/SKILL.md)
- [channels/SKILL.md](../channels/SKILL.md)
- [consumer-wallets/SKILL.md](../consumer-wallets/SKILL.md)
