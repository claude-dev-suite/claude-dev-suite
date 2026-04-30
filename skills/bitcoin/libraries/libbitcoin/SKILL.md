---
name: bitcoin-libraries-libbitcoin
description: |
  libbitcoin: comprehensive C++ Bitcoin library. Multiple toolkits
  (libbitcoin-system, libbitcoin-server, libbitcoin-explorer).
  Alternative implementation focused on cleanliness.
  USE WHEN: studying alternative Bitcoin codebases, building C++
  Bitcoin services.
allowed-tools: Read, Grep, Glob
---

# libbitcoin

Comprehensive C++ Bitcoin library suite. Older alternative
implementation; more academic style.

Repo: `github.com/libbitcoin/`.

## Components

- **libbitcoin-system** — primitives (tx, script, blocks, keys).
- **libbitcoin-server** — full server.
- **libbitcoin-explorer (bx)** — CLI tool.
- **libbitcoin-network** — networking.
- **libbitcoin-blockchain** — chain validation.
- **libbitcoin-database** — storage.
- **libbitcoin-protocol** — wire protocol.

## bx CLI

Useful tool for ad-hoc Bitcoin operations:
```bash
bx seed                  # generate random seed
bx mnemonic-new <hex>    # mnemonic from entropy
bx hd-new <seed>         # master xprv
bx hd-to-address <xpub>  # address from xpub
```

## Use cases

- C++ apps preferring libbitcoin's API style.
- Educational — clean, readable C++ code.
- `bx` for command-line Bitcoin operations.

## Compared

| Aspect | libbitcoin | bitcoind | rust-bitcoin |
|--------|------------|----------|--------------|
| Language | C++ | C++ | Rust |
| Maturity | 10+ years | reference | 7+ years |
| Adoption | Niche | Universal | Wide |
| Active maintenance | Sparse | Active | Active |

## Status

- Maintained but less actively than 2014-2017.
- Bitcoin Core is the primary reference.

## See also

- [secp256k1-c/SKILL.md](../secp256k1-c/SKILL.md)
- [libwally/SKILL.md](../libwally/SKILL.md)
- [../../core/operations/SKILL.md](../../core/operations/SKILL.md)
