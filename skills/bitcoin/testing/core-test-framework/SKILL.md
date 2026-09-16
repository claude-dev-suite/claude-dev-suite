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
        # Mining goes through the framework helper, generator node first;
        # it syncs all nodes afterwards.
        self.generatetoaddress(node0, 101, addr)
        # ...

if __name__ == "__main__":
    MyTest().main()
```

Run. Since the CMake migration in Bitcoin Core 29.0 (April 2025) the
runnable tests are configured into the build directory:
```bash
build/test/functional/feature_my_test.py
build/test/functional/test_runner.py --jobs=8 feature_my_test.py
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

Unless noted, these are methods on the framework, not on `TestNode`.

- `generate(generator, n, sync_fun=None)` — mine n blocks with the
  `generator` node, then `sync_fun()` if a callable was passed, else
  `sync_all()`. Any callable substitutes for the sync;
  `sync_fun=self.no_op` is the idiom for skipping it.
- `generatetoaddress(generator, n, address)`,
  `generateblock(generator, ...)`,
  `generatetodescriptor(generator, ...)` — same generator-first shape.
- `sync_blocks(nodes=None, wait=1, timeout=60)` — wait for tips to match.
- `sync_mempools(nodes=None, wait=1, timeout=60)` — wait for mempool sync.
- `sync_all(nodes=None)` — both of the above.
- `connect_nodes(a, b)` / `disconnect_nodes(a, b)` — manage peers.
- `restart_node(i, extra_args=)` — restart with new args.
- `wait_until(test_function, timeout=60, check_interval=0.05)` — poll
  until True. `TestNode` carries a method of the same name and
  signature, scoped to that one node.

Do not call the mining RPCs on a node directly. Since Bitcoin Core 23.0
(April 2022) `node.generatetoaddress()`, `node.generateblock()` and
`node.generatetodescriptor()` have been guarded by a keyword-only
argument that only the framework helpers pass; Bitcoin Core 29.0
(April 2025) renamed that guard from `invalid_call` to
`called_by_framework` and attached the message "Direct call of this
mining RPC is discouraged". `node.generate()` has no guard of its own —
it dispatches to `generatetoaddress`, so a direct call fails with
`TypeError` for the missing keyword-only argument instead.

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

- **Sync issues** when nodes have very different chain state — there is
  no force flag; the `self.generate*` helpers already `sync_all()`. If a
  sync still times out, raise `sync_blocks(timeout=...)` (default 60s,
  multiplied by `--timeout-factor`) or pass `sync_fun=self.no_op` and
  sync explicitly at a point where the tips can actually converge.
- **Mocktime** confusing if not set explicitly — chain time can lag
  real time during long runs.
- **Subprocess port conflicts** if multiple test runs overlap.

## See also

- [regtest/SKILL.md](../regtest/SKILL.md)
- [fuzz/SKILL.md](../fuzz/SKILL.md)
- [property-based/SKILL.md](../property-based/SKILL.md)
