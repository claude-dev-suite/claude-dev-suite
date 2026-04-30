---
name: bitcoin-testing-core-test-framework
description: |
  Bitcoin Core's Python functional test framework: BitcoinTestFramework,
  TestNode, setup_network, sync_blocks, descriptors helpers, miniscript
  helpers.
  USE WHEN: writing tests against bitcoind, contributing to Bitcoin
  Core, testing custom mempool policies.
allowed-tools: Read, Grep, Glob
---

# Bitcoin Core Test Framework

Python framework used by Bitcoin Core's own test suite. Located in
`test/functional/` of the bitcoin/bitcoin repo.

## Architecture

```python
from test_framework.test_framework import BitcoinTestFramework

class MyTest(BitcoinTestFramework):
    def set_test_params(self):
        self.num_nodes = 2
        self.extra_args = [["-fallbackfee=0.00001"], []]

    def run_test(self):
        node0 = self.nodes[0]
        node1 = self.nodes[1]
        addr = node0.getnewaddress()
        node0.generatetoaddress(101, addr)
        self.sync_blocks()
        # ...

if __name__ == "__main__":
    MyTest().main()
```

Run:
```bash
test/functional/feature_my_test.py
```

## Components

- `BitcoinTestFramework` — base class.
- `TestNode` — wraps bitcoind + RPC.
- `MiniWallet` — minimal in-test wallet (no full descriptor wallet).
- `messages.py` — wire format (CTxIn, CTxOut, CTransaction).
- `script.py` — Script construction (CScript, opcodes).
- `descriptors.py` — descriptor parsing helpers.
- `key.py` — secp256k1 helpers.
- `wallet_util.py` — wallet helpers.
- `psbt.py` — PSBT utilities.

## Key methods

- `generate(n, address)` — mine n blocks.
- `sync_blocks(timeout=)` — wait for nodes to converge.
- `sync_mempools()` — wait for mempool sync.
- `connect_nodes(a, b)` / `disconnect_nodes(a, b)` — manage peers.
- `restart_node(i, extra_args=)` — restart with new args.
- `wait_until(predicate, timeout=)` — poll until True.

## Use cases

- **Bitcoin Core PR contributions**: each new feature needs a
  functional test.
- **Custom mempool policy testing**.
- **Reproducing bugs** with full bitcoind behaviour.
- **Soft fork testing** on signet.

## Compared

| Aspect | Core Test Framework | Polar | Nigiri |
|--------|---------------------|-------|--------|
| Granularity | finest (per-node, per-msg) | coarser (UI-driven) | medium |
| Speed | fast (in-process) | slow (Docker) | medium |
| LN testing | via add-ons | primary | optional |
| Use case | Core development | Lightning dev | Stack dev |

## Common issues

- **Sync issues** when nodes have very different chain state — use
  `sync_blocks(force_sync=True)`.
- **Mocktime** confusing if not set explicitly — chain time can lag
  real time during long runs.
- **Subprocess port conflicts** if multiple test runs overlap.

## See also

- [regtest/SKILL.md](../regtest/SKILL.md)
- [fuzz/SKILL.md](../fuzz/SKILL.md)
- [property-based/SKILL.md](../property-based/SKILL.md)
