---
name: bitcoin-libraries-bitcoin-kernel
description: |
  libbitcoinkernel: Bitcoin Core's experimental C library exposing the
  validation engine (block/header validation, block index traversal,
  block + undo reads, script verification), and the `bitcoinkernel`
  Rust bindings over `libbitcoinkernel-sys`.
  USE WHEN: embedding Core's exact consensus semantics in a non-C++
  process - indexers, explorers, validation tooling, fuzzing harnesses.
allowed-tools: Read, Grep, Glob
---

# libbitcoinkernel / rust-bitcoinkernel

Core's validation engine, factored out as a C-ABI library. Two layers:

- **`libbitcoinkernel`** - the C header `src/kernel/bitcoinkernel.h` in
  the Bitcoin Core tree, plus the `bitcoinkernel` CMake target.
- **`bitcoinkernel`** - safe Rust bindings, over the `libbitcoinkernel-sys`
  FFI/build crate. Repo: `github.com/sedited/rust-bitcoinkernel`
  (the `TheCharlatan/rust-bitcoinkernel` URL still redirects there).

## Status: experimental (as of September 2026)

The header's own Remarks section in Bitcoin Core v31.1 (July 2026)
states the API "is unversioned and not stable yet. Users should expect
breaking changes. It is also not yet included in releases of Bitcoin
Core." Upstream tracking is bitcoin/bitcoin#27587, "Bitcoin Kernel
Library Project Tracking" (open, last updated 31 July 2026).

It is not built by default. `BUILD_KERNEL_LIB` ("Build experimental
bitcoinkernel library") defaults to the value of `BUILD_UTIL_CHAINSTATE`,
which is `OFF` in v31.1, so you must opt in:

```bash
cmake -B build -DBUILD_KERNEL_LIB=ON       # BUILD_KERNEL_TEST follows it
cmake --build build
```

Treat the library as a moving target and pin an exact commit or crate
version.

## Why it exists

Core's old `libbitcoinconsensus` was deprecated in v27.0 and removed
entirely in v28.0 (release notes, PR #29648) - `src/script/bitcoinconsensus.h`
is present at tag v27.0 and gone at v28.0. It only ever did isolated
script verification. The kernel library is the replacement and is
stateful: it owns a chainstate, so it can validate whole blocks against
real chain context, not just scripts.

## Scope

Per the v31.1 header's Purpose section, the C API covers:

- Block and block-header validation against consensus rules.
- Iterating the block index / traversing the chain.
- Reading block and undo data from disk.
- Script verification.

No P2P, no wallet, no RPC server, no mempool acceptance. A context is
passed to state-rich calls; a built-in static context covers the
"context-free" operations (SHA256 implementation self-check, RNG init,
secp256k1 static context self-check), so no explicit init is required
for those.

## Install (Rust)

```toml
# latest on crates.io as of September 2026
[dependencies]
bitcoinkernel = "0.3"        # 0.3.0, 26 August 2026; MSRV 1.71.0
```

`libbitcoinkernel-sys` (0.4.0, 26 August 2026) is pulled in
transitively - depend on it directly only for raw FFI. All-time
downloads as of September 2026: ~44.6k for `bitcoinkernel`, ~47.6k for
`libbitcoinkernel-sys`.

## Build requirements

`libbitcoinkernel-sys` vendors Bitcoin Core as a **git subtree** at
`libbitcoinkernel-sys/bitcoin` and statically compiles the kernel
library as part of `cargo build`. That means the host needs Core's own
build dependencies - `cmake`, a working C and C++ toolchain, and an
installation of Boost. First builds are slow; budget for them in CI.

Since `bitcoinkernel` 0.2.1 / `libbitcoinkernel-sys` 0.3.0 (both
20 May 2026) the sys crate ships checked-in bindings instead of
generating them with `bindgen`, which upstream notes removes some
build-time dependencies.

Users on rustc older than 1.77 should build with `--locked`
(`Cargo-minimal.lock` / `Cargo-recent.lock` pin the two extremes).
Android cross-compilation is available through the repo's Nix flake
(`nix build .#libbitcoinkernel-android-aarch64`), targeting API 24+.

## Quick examples

### Validate a block

```rust
use bitcoinkernel::{
    Block, ChainType, ChainstateManager, ContextBuilder, ProcessBlockResult,
};

let context = ContextBuilder::new()
    .chain_type(ChainType::Mainnet)
    .build()?;

let chainman = ChainstateManager::new(&context, "/path/to/data", "/path/to/blocks")?;

let block = Block::new(&block_bytes)?;
match chainman.process_block(&block) {
    ProcessBlockResult::NewBlock => println!("validated and written to disk"),
    ProcessBlockResult::Duplicate => println!("already known (valid)"),
    ProcessBlockResult::Rejected => println!("validation failed"),
}
```

### Verify a script

```rust
use bitcoinkernel::{prelude::*, verify, PrecomputedTransactionData, Transaction, VERIFY_ALL};

let spending_tx = Transaction::new(&spending_tx_bytes)?;
let prev_tx = Transaction::new(&prev_tx_bytes)?;
let prev_output = prev_tx.output(0)?;
let tx_data = PrecomputedTransactionData::new(&spending_tx, &[prev_output])?;

let result = verify(
    &prev_output.script_pubkey(),
    Some(prev_output.value()),
    &spending_tx,
    0,                      // input index
    Some(VERIFY_ALL),
    &tx_data,
);
```

Passing the spent outputs is what enables taproot verification; without
them the precomputed data cannot produce a BIP341 sighash.

## Crate layout

| Module | Holds |
|--------|-------|
| `core` | Blocks, transactions, scripts |
| `state` | `ChainstateManager`, `Context`, `ChainParams` |
| `notifications` | Validation / tip-update / warning callbacks |
| `log` | Bridge to Core's logging |
| `prelude` | Extension traits (`ScriptPubkeyExt`, `TxInExt`, ...) |

0.3.0 (August 2026) added context-free `Block::check` and
`Transaction::check`, witness-stack accessors (`TxInExt::witness_stack`),
a typed `ScriptVerificationFlags` in place of a bare `u32`, and
`ChainParams::new_signet` / `ContextBuilder::signet` for custom signets.

## Use cases

- **Indexers and explorers in Rust** that must agree with Core byte for
  byte on what is valid.
- **Validation tooling** - reorg simulators, chain-scanning utilities.
  The repo's `examples/` ships a bare-bones silent payments scanner.
- **Fuzzing** consensus code from Rust: the repo has `block_roundtrip`,
  `chainman_process_block` and `script_verify` cargo-fuzz targets.

## Common pitfalls

- **The API is not stable.** The C header is unversioned and Core makes
  no compatibility promise; the Rust crate has had renames and signature
  changes at every minor (e.g. 0.3.0 renamed
  `ProcessBlockHeaderResult::Success`/`Failed` to `Valid`/`Invalid` and
  made `process_block_header` return a `Result`). Pin exact versions.
- **The vendored Core subtree is the real dependency.** Two builds of
  the same crate version against different subtree commits are different
  consensus engines. Check subtree movement with
  `./contrib/check_subtree_kernel_commits.sh` after a
  `git subtree pull`.
- **Not a node.** No P2P, so nothing feeds the chainstate for you; you
  supply blocks. No mempool acceptance and no policy RPCs.
- Upgrade past 0.3.0 if you use `ChainstateManager::get_block_tree_entry`
  - before that release it passed the wrong pointer to the kernel and
  returned `None` for every input.
- Bitcoin Core release binaries do not ship the library, so there is no
  system package to link against; you build it.

## See also

- [rust-bitcoin/SKILL.md](../rust-bitcoin/SKILL.md)
- [corepc/SKILL.md](../corepc/SKILL.md)
- [secp256k1-c/SKILL.md](../secp256k1-c/SKILL.md)
- [../../core/indexes/SKILL.md](../../core/indexes/SKILL.md)
