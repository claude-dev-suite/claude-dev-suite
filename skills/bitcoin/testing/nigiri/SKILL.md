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
nigiri logs
nigiri stop
```

## Features

- **All in one**: `nigiri start` runs bitcoind, electrs, Esplora
  frontend, Chopsticks (mock signatures).
- **Esplora available** at `localhost:5000` for explorer + REST API.
- **Faucet** for instant BTC.
- **Liquid support** via `nigiri start --liquid`.
- **Lightning** via `nigiri start --ln`.

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
- Port conflicts: bitcoind uses 18443, electrs 50001, Esplora 5000.
- Liquid stack adds significant resource use.

## See also

- [regtest/SKILL.md](../regtest/SKILL.md)
- [polar/SKILL.md](../polar/SKILL.md)
- [../infrastructure/esplora/SKILL.md](../../infrastructure/esplora/SKILL.md)
- [../l2/liquid/SKILL.md](../../l2/liquid/SKILL.md)
