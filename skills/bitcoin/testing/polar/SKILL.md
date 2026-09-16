---
name: bitcoin-testing-polar
description: |
  Polar: GUI for spinning up Lightning regtest networks. Supports
  LND, Core Lightning, Eclair, plus Lightning Terminal (litd) and
  Taproot Assets. Per-node config, payment simulation, channel
  topology editor, sim-ln activity, MCP server for AI agents.
  USE WHEN: building / testing Lightning apps, designing regtest
  channel topologies, demoing LN flows.
allowed-tools: Read, Grep, Glob
---

# Polar

Lightning Network regtest GUI. One-click setup of multi-node LN
networks for testing.

Repo: `github.com/jamaljsr/polar`.

## Features

- **Multi-node**: bitcoind + LND / Core Lightning / Eclair, plus
  Lightning Terminal (litd) and Tap (Taproot Assets). Polar ships no
  LDK / LDK Node image (checked against Polar v4.0.0, January 2026).
- **GUI**: drag-and-drop network builder.
- **Channel topology editor**: open / close channels visually.
- **Payment simulator**: send/receive between nodes.
- **Balance** + **fee** customization.
- **Persisted networks**: save/restore.
- **Tor optional** for testing onion-only setups.
- **sim-ln activity** (Polar 4.0.0, 6 January 2026): activity rules
  of source / destination / amount / interval drive continuous
  payments across the network, via bitcoin-dev-project/sim-ln.
- **MCP server** (Polar 4.0.0, 6 January 2026): 48 tools exposed to
  Claude Code / Cursor / Codex over the `@lightningpolar/mcp` stdio
  server, which talks to Polar's HTTP bridge on `localhost:37373`.

## Supported images

Version ranges as shipped in Polar 4.0.0 (`docker/nodes.json`,
read September 2026):

| Node | Versions |
|------|----------|
| LND | 0.16.4 - 0.20.0 (beta tags) |
| Core Lightning | 24.08.1 - 25.12 |
| Eclair | 0.9.0 - 0.13.1 |
| Bitcoin Core | 26.0 - 30.0 |
| Taproot Assets | 0.3.3 - 0.7.0 (alpha tags) |
| Terminal (litd) | 0.14.1 - 0.16.0 (alpha tags) |

`nodes.json` also carries a compatibility map: LND 0.18.4+ pairs with
bitcoind 30.0, LND 0.18.3 and older with 27.0. Custom images (master
branch, local fork) are added via Polar's custom-nodes flow.

## Setup

Download installer (Mac/Win/Linux). Requires Docker.

Create network:
1. New network → name + chain (regtest).
2. Drag node icons (LND, CLN, etc.) onto canvas.
3. Add bitcoind backend.
4. Start network.
5. Open channels via UI.
6. Send payments.

## Use cases

- **Lightning app development**: test against real LND/CLN APIs.
- **Multisig coordinator** testing across LN-aware impls.
- **Demos** for tutorials, presentations.
- **Education**: visualize LN flows.

## Compared

| Aspect | Polar | Nigiri | Manual regtest |
|--------|-------|--------|----------------|
| GUI | yes | no | no |
| Multi-LN-impl | LND / CLN / Eclair (+ litd, tapd) | LND + CLN (+ tapd) | yes |
| Esplora explorer | no | yes | manual |
| Use case | LN focus | Bitcoin focus | Custom |

Nigiri column as of Nigiri v0.5.17 (May 2026): `nigiri start --ln`
brings up Core Lightning, LND *and* the Taproot Assets daemon
together, not LND alone. It ships no Eclair image.

## Common issues

- Docker required and runs containers; resource-heavy on small
  machines.
- Port conflicts with existing services.
- Old saved networks may break across Polar versions; export node
  configs separately for portability.

## See also

- [regtest/SKILL.md](../regtest/SKILL.md)
- [nigiri/SKILL.md](../nigiri/SKILL.md)
- [signet/SKILL.md](../signet/SKILL.md)
- [../lightning/lnd/SKILL.md](../../lightning/lnd/SKILL.md)
- [../lightning/cln/SKILL.md](../../lightning/cln/SKILL.md)
