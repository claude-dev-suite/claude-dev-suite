---
name: bitcoin-mining-stratum-v2
description: |
  Stratum V2: encrypted, miner-driven mining protocol. Job Declaration,
  Template Provider, allows miners to choose their own tx set. Defeats
  pool-level censorship.
  USE WHEN: deploying SV2-capable mining infrastructure, evaluating
  V1 vs V2, integrating with Braiins Pool / Datum.
allowed-tools: Read, Grep, Glob
---

# Stratum V2

Modern protocol replacing Stratum V1. Designed by Braiins (Slush
Pool maintainers).

Spec: <https://stratumprotocol.org/specification/>.

## Key improvements over V1

| Aspect | V1 | V2 |
|--------|----|----|
| Encryption | None | Noise XK (per-message AEAD) |
| Authentication | Username string | Cryptographic identity |
| Coinbase control | Pool only | Miner choice (Job Declarator) |
| Tx selection | Pool only | Miner can construct own block |
| Bandwidth | Verbose JSON | Binary (compact) |
| Multiple sub-protocols | No | Mining + Job Declaration + Template Provider + Job Negotiation |

## Architecture

Multi-role:
- **Mining Protocol**: ASIC ↔ pool/proxy.
- **Job Declaration**: miner declares their preferred block content.
- **Template Provider**: external service builds block templates
  from mempool (e.g., user's own bitcoind).
- **Job Negotiation**: pool and miner negotiate work assignment.

A miner running a Template Provider locally can:
1. Build their own block template from their own bitcoind mempool.
2. Submit hash work for that template via Job Declaration to pool.
3. Pool verifies + accepts.
4. Miner finds block, gets reward.

This **decentralizes** tx selection: miners — not pools — choose
which txs to mine.

## Encryption

Noise XK handshake → ChaCha20-Poly1305 per message. Modern crypto;
defeats MITM and on-path analysis.

## Channels

- **Standard channel**: per-miner, simple.
- **Extended channel**: pool-controlled, used for proxies.
- **Group channel**: bundled connections.
- **Job Negotiator channel**: separate negotiation.

## Status (late 2025)

- **Reference impl**: SRI (Stratum Reference Implementation), Rust.
- **Production**: Braiins Pool runs SV2.
- **Adoption**: limited — most pools still on V1.
- **ASIC support**: growing; firmware updates needed.
- **Datum** by Ocean Mining: SV2-compatible, decentralized template
  provider.

## Use cases

- **Censorship-resistant mining**: miners choose own tx set.
- **Independent miners**: solo or small farms running their own
  bitcoind.
- **Pool diversity**: more easily switching pools.

## Limitations

- **Adoption lag** — pool + ASIC + firmware all need to support.
- **Complexity** — multi-role architecture vs V1's simplicity.
- **Backwards compat** — many ASICs don't support yet.

## Implementations

- **Stratum Reference Implementation (SRI)** — `github.com/stratum-mining/`.
- **Braiins OS+** — firmware with V2 support for some Antminer models.
- **Ocean Mining Datum** — V2-style decentralized template.

## See also

- [stratum-v1/SKILL.md](../stratum-v1/SKILL.md)
- [decentralized-pools/SKILL.md](../decentralized-pools/SKILL.md)
- [firmware/SKILL.md](../firmware/SKILL.md)
