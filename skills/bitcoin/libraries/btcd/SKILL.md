---
name: bitcoin-libraries-btcd
description: |
  btcd: full-node Bitcoin implementation in Go by btcsuite. Server,
  RPC, wallet (btcwallet), Lightning (LND-derived).
  USE WHEN: building Go-native Bitcoin services, alternative to
  bitcoind, integrating with btcsuite ecosystem.
allowed-tools: Read, Grep, Glob
---

# btcd

Full-node Bitcoin implementation in Go. Maintained by btcsuite team.

Repo: `github.com/btcsuite/btcd`.

## Components

- **btcd** — full node.
- **btcwallet** — wallet daemon.
- **btcctl** — CLI client.
- **btcec** — secp256k1 binding.
- **btcutil** — utilities.
- **txscript** — Script engine.

## Install

```bash
go install github.com/btcsuite/btcd@latest
go install github.com/btcsuite/btcd/cmd/btcctl@latest
```

## Run

```bash
btcd --datadir=/var/lib/btcd
btcctl --rpcuser=... --rpcpass=... getblockchaininfo
```

## Compared to bitcoind

| Aspect | bitcoind | btcd |
|--------|----------|------|
| Language | C++ | Go |
| Consensus | Reference | Compatible |
| Mempool policy | Reference | Differs slightly |
| Adoption | ~95% | <5% |
| LN | Via separate impl | LND derived from btcd codebase |
| Performance | Best | Acceptable |

## Use cases

- Go-native Bitcoin services.
- LND historically uses btcd as backend (also supports bitcoind).
- Educational — Go is more readable than C++.

## Common pitfalls

- Soft fork support sometimes lags Bitcoin Core.
- Mempool standardness differences cause some txs to relay
  differently.
- For production exchanges / services, bitcoind preferred.

## See also

- [btcsuite/SKILL.md](../btcsuite/SKILL.md)
- [lnd-go/SKILL.md](../lnd-go/SKILL.md)
- [../../core/operations/SKILL.md](../../core/operations/SKILL.md)
