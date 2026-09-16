---
name: bitcoin-libraries-corepc
description: |
  corepc: the rust-bitcoin org's Bitcoin Core JSON-RPC stack.
  `corepc-types` (per-Core-version response types + version-agnostic
  `model` types), `corepc-client` (blocking/async test client),
  `bitcoind` (spin up regtest nodes for integration tests).
  USE WHEN: talking to bitcoind from Rust, or integration-testing Rust
  code against a real Bitcoin Core binary.
allowed-tools: Read, Grep, Glob
---

# corepc

Bitcoin Core JSON-RPC support for Rust. Replaces the archived
`rust-bitcoincore-rpc`.

Repo: `github.com/rust-bitcoin/corepc`. As of September 2026 the GitHub
README carries a "This repository has moved" banner pointing at the
org's own Forgejo instance, `git.rust-bitcoin.org/rust-bitcoin/corepc`;
issues and PRs belong there, crates still publish to crates.io as
normal.

## Read the upstream guidance first

The README is explicit and unusual, so do not skip it:

> If you require a JSON RPC client in production software it is expected
> you write your own and only use the `corepc-types` crate in your
> dependency graph.
>
> **Please do not use `corepc-client` in production and raise bugs,
> issues, or feature requests.**

So the supported split is: **`corepc-types` is the production
dependency**; `corepc-client` exists to exercise those types and to
drive nodes in tests. Meanwhile the archived `rust-bitcoincore-rpc`
README (archived 25 November 2025) tells its users to switch to
`corepc-client`. Both statements are upstream; reconcile them by taking
the types crate plus a thin client of your own for a service, and
`corepc-client` for tests and tooling.

## Crates (versions as of September 2026)

| Crate | Version | Released | Role |
|-------|---------|----------|------|
| `corepc-types` | 0.15.0 | 18 June 2026 | RPC response types |
| `corepc-client` | 0.16.0 | 18 June 2026 | Blocking / async client |
| `bitcoind` | 0.41.0 | 18 June 2026 | Regtest node harness |
| `jsonrpc` | 0.20.1 | 27 May 2026 | JSON-RPC 2.0 plumbing |
| `bitreq` | 0.3.7 | 28 May 2026 | Minimal HTTP client |
| `electrsd` | 0.41.0 | 18 June 2026 | Regtest electrs harness |

MSRV across the workspace is **Rust 1.75.0**; the crates build against
`bitcoin = "0.32.0"`. Releases came roughly fortnightly from April to
June 2026 (client 0.11.0 → 0.16.0); nothing has been tagged since the
18 June 2026 wave.

## Version-aware design

The whole point of the repo is that a Core RPC response shape depends on
which Core you are talking to. `corepc-types` therefore has one module
per Core major - `v17` through `v31` - holding the literal JSON shape
that version returns, plus a `model` module of version-agnostic types.
Convert with `into_model()`:

```rust
use corepc_client::client_sync::v31::Client;
use corepc_client::client_sync::Auth;

// cargo add corepc-client --features client-sync
let client = Client::new_with_auth(
    "http://127.0.0.1:8332",
    Auth::UserPass("user".into(), "pass".into()),
)?;

let json = client.get_blockchain_info()?;   // corepc_types::v31 shape
let info = json.into_model()?;              // corepc_types::model shape
println!("{} at height {}", info.chain, info.blocks);
```

`Client::new(url)` exists for unauthenticated endpoints. Features:
`client-sync` (blocking) and `client-async`; neither is on by default.

The v31 client asserts the server version it was built for
(`impl_client_check_expected_server_version!({ [310000] })`), so pointing
a `v31::Client` at a v29 node fails loudly instead of mis-deserialising.
No crate here sniffs the peer's version for you - picking the right
module is the application's job.

## Integration testing with `bitcoind`

```toml
[dev-dependencies]
bitcoind = { version = "0.41", features = ["latest", "download"] }
```

```rust
use bitcoind::BitcoinD;

let node = BitcoinD::from_downloaded()?;    // needs the `download` feature
let info = node.client.get_blockchain_info()?;
assert_eq!(info.chain, "regtest");
// node killed on drop; datadir is a tempfile::TempDir
```

`BitcoinD::new(exe)` / `BitcoinD::with_conf(exe, &conf)` use a binary
already on the host instead. The crate re-exports version-specific types
as `vtype` and the model types as `mtype`.

Version features select which Core the harness expects, and they cascade
downwards:

- `default = ["0_17_2"]`, `latest = ["31_0"]`.
- One pinned Core binary per supported major: `31_0` → 31.0, `30_2` →
  30.2, `29_0` → 29.0, then `28_2`, `27_2`, `26_2`, ... back to
  `0_17_2` (as of `bitcoind` 0.41.0, June 2026). There is **no `30_0`
  or `30_1` feature**, excluded upstream because of a wallet migration
  bug.
- No feature exists for Core 29.1-29.4, 30.3 or 31.1, although all of
  those tags shipped (as of September 2026). Upstream's `Cargo.toml`
  comment about supporting every minor of the latest three majors is
  stale; `bitcoind/src/versions.rs` is the authority.
- Enabling several version features is not an error; the highest wins.

## Migrating from rust-bitcoincore-rpc

`rust-bitcoin/rust-bitcoincore-rpc` was archived on 25 November 2025 with
`bitcoincore-rpc` frozen at 0.19.0 (May 2024) and its README recommending
`corepc-client`. The `bitcoind` crate name is the same crate lineage: it
was renamed to `corepc-node` and then renamed **back** to `bitcoind` in
0.37.0 (16 April 2026, PR #542), with the version number bumped past the
old standalone `bitcoind` releases. `corepc-node` is frozen at 0.12.0
(April 2026) - move to `bitcoind` 0.37.0+.

Shape differences to expect when porting:

- Responses are per-version types, not one universal struct. Add an
  `into_model()` hop, or read the `v3x` fields directly.
- `into_model()` is fallible - Core returns `-1` in fields typed as
  numeric, and amounts have to survive the float round trip.
- Method coverage is deliberately exhaustive - every documented RPC
  since client 0.9.0 (September 2025), plus hidden ones added in client
  0.11.0 (April 2026) - so missing-method workarounds can go.

## Common pitfalls

- Shipping `corepc-client` in a production service. Upstream says not to
  and will not take bug reports for it.
- Mixing crate versions from different release waves. `corepc-client`
  0.16.0 pins `corepc-types` 0.15.0 and `bitcoind` 0.41.0 pins
  `corepc-client` 0.16.0 - take one wave.
- Assuming `bitcoind`'s default feature targets a modern node: the
  default is `0_17_2`. Pass `latest` or an explicit version feature.
- `download` pulls a Core binary over the network at build time, which
  most sealed CI images will refuse. Pre-fetch and use
  `BitcoinD::new(exe)` there.
- Choosing the client module by guesswork. Read `getnetworkinfo` once at
  startup and fail fast if the node is not the major you compiled for.

## See also

- [rust-bitcoin/SKILL.md](../rust-bitcoin/SKILL.md)
- [bdk/SKILL.md](../bdk/SKILL.md)
- [bitcoin-kernel/SKILL.md](../bitcoin-kernel/SKILL.md)
- [../../core/rpc/SKILL.md](../../core/rpc/SKILL.md)
