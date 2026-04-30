---
name: bitcoin-testing-regtest
description: |
  Regtest mode: instant block generation, deterministic fork, multi-node
  setup, generatetoaddress, fallbackfee config.
  USE WHEN: building Bitcoin tests, simulating network conditions,
  scaffolding integration tests.
allowed-tools: Read, Grep, Glob
---

# regtest

Bitcoin's "regression test" mode. Local-only chain, instant block
generation, no PoW difficulty. The default for Bitcoin testing.

## Setup

```bash
bitcoind -regtest -daemon -fallbackfee=0.00001
bitcoin-cli -regtest createwallet test
bitcoin-cli -regtest -rpcwallet=test getnewaddress
# bcrt1q...

# Mine 101 blocks (subsidy matures after 100)
bitcoin-cli -regtest -rpcwallet=test generatetoaddress 101 <addr>

# Now wallet has 50 BTC mature
bitcoin-cli -regtest -rpcwallet=test getbalance
```

`-fallbackfee` is **required** because the empty regtest mempool has
no fee estimates.

## Multi-node setup

```bash
# Node 1
bitcoind -regtest -datadir=/tmp/n1 -port=18444 -rpcport=18443 -daemon

# Node 2
bitcoind -regtest -datadir=/tmp/n2 -port=18445 -rpcport=18446 \
  -connect=127.0.0.1:18444 -daemon

# Node 3
bitcoind -regtest -datadir=/tmp/n3 -port=18447 -rpcport=18448 \
  -connect=127.0.0.1:18444 -daemon
```

## Useful commands

```bash
# Mine blocks (deterministic; instant)
bitcoin-cli -regtest generatetoaddress 1 <addr>

# Reset chain (start fresh)
rm -rf ~/.bitcoin/regtest
bitcoind -regtest -daemon

# Specific block at specific time
bitcoin-cli -regtest setmocktime <unix_ts>
bitcoin-cli -regtest generatetoaddress 1 <addr>
```

## Address prefixes

- P2PKH: `m...` or `n...`.
- P2SH: `2...`.
- Bech32: `bcrt1q...`.
- Bech32m: `bcrt1p...`.

## Use cases

- **Unit tests** that need a real bitcoind.
- **Integration tests** for wallet / Lightning logic.
- **Demos / tutorials** with deterministic state.
- **Reproducing bugs** with controlled chain history.

## Common bugs

- Forgetting `-fallbackfee` → `sendtoaddress` errors.
- Forgetting to mine 100+ blocks before spending coinbase → "input
  immature".
- Mixing regtest output with mainnet RPC by accident → use distinct
  `-datadir` and explicit `-regtest` arg.

## See also

- [signet/SKILL.md](../signet/SKILL.md)
- [polar/SKILL.md](../polar/SKILL.md)
- [nigiri/SKILL.md](../nigiri/SKILL.md)
- [../core/operations/SKILL.md](../../core/operations/SKILL.md)
