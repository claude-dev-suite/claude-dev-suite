---
name: bitcoin-infrastructure-fulcrum
description: |
  Fulcrum: cppbtc-team Electrum-protocol indexer in C++. Faster than
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

Indexes ~1-2 days; ~10-15 GB additional disk.

## When to choose Fulcrum

- High-traffic public Electrum server.
- Power users with multiple wallets connecting.
- BTCPay backend with many invoices.

## When to choose electrs

- Personal use, low traffic.
- Resource-constrained devices.
- Simpler config preferred.

## Compatibility

Same as electrs — Sparrow, Electrum, BTCPay, etc.

## Common bugs

- High RAM usage (8+ GB) → tune `db_max_open_files`, `cache_size`.
- TLS cert mismatch on SSL endpoint → wallets fail to connect.
- Bitcoin Core RPC connection drops → Fulcrum reconnects but may
  miss blocks; restart in extreme cases.

## See also

- [electrs/SKILL.md](../electrs/SKILL.md)
- [esplora/SKILL.md](../esplora/SKILL.md)
- [btcpay/SKILL.md](../btcpay/SKILL.md)
