---
name: bitcoin-infrastructure-fulcrum
description: |
  Fulcrum: Calin Culianu's Electrum-protocol indexer in C++. Faster than
  electrs for high-volume queries. Serves Electrum clients + LN nodes.
  USE WHEN: deploying high-load Electrum server, comparing with
  electrs.
allowed-tools: Read, Grep, Glob
---

# Fulcrum

C++ Electrum-protocol server. Faster than electrs for query
throughput, at higher RAM cost.

Repo: `github.com/cculianu/Fulcrum`.

## Setup

Bitcoin Core with `txindex=1`. Then Fulcrum:
```ini
[options]
datadir = /var/lib/fulcrum
bitcoind = 127.0.0.1:8332
rpcuser = ...
rpcpassword = ...
tcp = 0.0.0.0:50001
ssl = 0.0.0.0:50002
```

Indexes in 4 to 20+ hours on SSD, per the upstream README (a figure
carried unchanged there since v1.0, January 2020). Budget a lot of
disk: the same README recommends ~133 GB for the BTC mainnet database
"as of Aug 2023" - still the figure quoted in September 2026 - on top
of the node's own blocks.

Current release 2.1.2 (August 2026). Fulcrum 2.0.0 (September 2025)
rewrote the database format: the datadir is crash-safe and
platform-neutral, `fast-sync` / `utxo_cache` are gone (use `db_mem`),
and a 1.x datadir needs a one-time `--db-upgrade` run to convert.

## When to choose Fulcrum

- High-traffic public Electrum server.
- Power users with multiple wallets connecting.
- BTCPay backend with many invoices.

## When to choose electrs

- Personal use, low traffic.
- Resource-constrained devices.
- Simpler config preferred.

Note the node-side prerequisites differ: electrs v0.12.0 (13 September
2026) indexes over bitcoind's REST interface and needs Bitcoin Core
31.0+ with `rest=1`, while Fulcrum works against Core v0.17.0+ over
JSON-RPC with `txindex=1`.

## Compatibility

Same as electrs — Sparrow, Electrum, BTCPay, etc.

## Common bugs

- High RAM usage (8+ GB) → tune `db_mem`, `db_max_open_files`.
- TLS cert mismatch on SSL endpoint → wallets fail to connect.
- Bitcoin Core RPC connection drops → Fulcrum reconnects but may
  miss blocks; restart in extreme cases.

## See also

- [electrs/SKILL.md](../electrs/SKILL.md)
- [esplora/SKILL.md](../esplora/SKILL.md)
- [btcpay/SKILL.md](../btcpay/SKILL.md)
