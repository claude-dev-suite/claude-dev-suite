---
name: bitcoin-testing-nigiri
description: |
  Nigiri: regtest stack with Bitcoin + Esplora + electrs + Liquid +
  optional LN. CLI-based, fast iteration, includes faucet.
  USE WHEN: regtest with explorer dependency, full-stack E2E testing,
  dev environment with Esplora API.
allowed-tools: Read, Grep, Glob
---

# Nigiri

Single-command regtest stack. Includes Bitcoin Core + electrs +
Esplora frontend + optional Liquid + optional LN.

Repo: `github.com/vulpemventures/nigiri`.

## Quickstart

```bash
nigiri start         # spin up bitcoind + electrs + esplora
nigiri faucet bcrt1q...   # send test BTC
nigiri rpc getblockchaininfo
nigiri logs chopsticks     # logs takes a service name
nigiri stop
```

## Features

- **All in one**: `nigiri start` runs bitcoind, electrs, the Esplora
  frontend, and Chopsticks (a JSON HTTP proxy that re-serves the
  Esplora REST API and adds `/faucet` + auto-mining on `POST /tx`).
- **Esplora web explorer** at `localhost:5000`; the Esplora-compatible
  REST API is Chopsticks at `localhost:3000` (as of v0.5.17, May 2026).
- **Faucet** for instant BTC.
- **Liquid support** via `nigiri start --liquid`.
- **Lightning** via `nigiri start --ln` - starts Core Lightning, LND
  *and* the Taproot Assets daemon (`tapd`), not a single impl.
- **Ark** via `nigiri start --ark` (arkd + explorer).
- **Flag memory**: `--remember` persists the chosen flags; `nigiri
  forget` clears them.

## Use cases

- **Wallet integration** that needs Esplora API.
- **End-to-end testing** with realistic explorer queries.
- **Demos** with full Bitcoin + explorer view.

## Compared

| Aspect | Nigiri | Polar | Manual regtest |
|--------|--------|-------|----------------|
| GUI | no | yes | no |
| Explorer | Esplora | none | manual |
| LN support | optional | primary | manual |
| Liquid | yes | no | manual |
| Setup time | <1 min | <1 min | minutes-hours |

## Common issues

- Docker required; resource cost (~2-4 GB RAM).
- Port conflicts: bitcoind uses 18443, electrs 50000 (Electrum) and
  30000 (HTTP), Chopsticks 3000, Esplora UI 5000. On macOS Monterey
  and later, AirPlay Receiver already holds 5000 - disable it or
  remap the port in `docker-compose.yml` under the Nigiri datadir.
- Liquid stack adds significant resource use.

## See also

- [regtest/SKILL.md](../regtest/SKILL.md)
- [polar/SKILL.md](../polar/SKILL.md)
- [../infrastructure/esplora/SKILL.md](../../infrastructure/esplora/SKILL.md)
- [../l2/liquid/SKILL.md](../../l2/liquid/SKILL.md)
