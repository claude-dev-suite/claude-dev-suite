---
name: bitcoin-testing-polar
description: |
  Polar: GUI for spinning up Lightning regtest networks. Supports
  LND, CLN, Eclair, LDK Node. Per-node config, payment simulation,
  channel topology editor.
  USE WHEN: building / testing Lightning apps, designing regtest
  channel topologies, demoing LN flows.
allowed-tools: Read, Grep, Glob
---

# Polar

Lightning Network regtest GUI. One-click setup of multi-node LN
networks for testing.

Repo: `github.com/jamaljsr/polar`.

## Features

- **Multi-node**: bitcoind + LND/CLN/Eclair/LDK Node + Tap (Taproot
  Assets).
- **GUI**: drag-and-drop network builder.
- **Channel topology editor**: open / close channels visually.
- **Payment simulator**: send/receive between nodes.
- **Balance** + **fee** customization.
- **Persisted networks**: save/restore.
- **Tor optional** for testing onion-only setups.

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
| Multi-LN-impl | yes | LND only | yes |
| Esplora explorer | no | yes | manual |
| Use case | LN focus | Bitcoin focus | Custom |

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
