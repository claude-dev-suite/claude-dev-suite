---
name: bitcoin-infrastructure-node-distros
description: |
  Self-hosted Bitcoin node distros: Umbrel, Start9 Embassy, RaspiBlitz,
  MyNode, Citadel. Pre-configured Bitcoin + Lightning + apps.
  USE WHEN: deploying personal node infrastructure, choosing between
  distros.
allowed-tools: Read, Grep, Glob
---

# Self-hosted Bitcoin Node Distros

Pre-configured Linux distributions / app frameworks for running a
Bitcoin node + Lightning + apps with minimal setup.

## Major distros

### Umbrel
- Most popular self-host distro.
- App store ecosystem (Lightning, BTCPay, mempool.space, Sphinx,
  many apps).
- Runs on Raspberry Pi, x86, mini PC.
- Open-source, easy onboarding.
- Default Bitcoin Core + LND.

### Start9 Embassy / EmbassyOS
- Privacy-first, Tor-by-default.
- App marketplace with curated services.
- Focus on sovereignty.
- Hardware: Embassy Pro (commercial), DIY (Raspberry Pi).

### RaspiBlitz
- Raspberry Pi-focused.
- Ecosystem of plugins (BTCPay, RTL, ThunderHub, JoinMarket, etc.).
- Active community.
- Boot from microSD or external SSD.

### MyNode
- Premium product (closed-source for paid features) + free tier.
- App library similar to Umbrel.
- Mac/Linux installer.

### Citadel
- Fork of Umbrel; community-driven.
- Focus on FOSS exclusivity.
- Active development.

## Common features

- Bitcoin Core auto-configured.
- LND (or CLN) integrated.
- Tor v3 hidden service for remote access.
- Web UI for monitoring + app management.
- Backups and updates managed.

## Hardware requirements

- **CPU**: Raspberry Pi 4/5 minimum; better with x86.
- **RAM**: 4 GB minimum, 8+ GB recommended.
- **Disk**: 1+ TB SSD (for full node).
- **Network**: stable, decent bandwidth (~600 GB IBD).

## App ecosystem

Common apps across distros:
- BTCPay Server.
- mempool.space.
- Ride The Lightning (RTL).
- ThunderHub (LND web UI).
- Specter Desktop.
- Sphinx Chat (LN messaging).
- Cipher Seed (educational).
- BitFeed.

## Use cases

- **Personal Bitcoin sovereignty**.
- **Self-hosted Lightning routing node**.
- **Family / small business** with shared infrastructure.
- **Privacy-conscious users** doing Tor-only.

## Compared

| Aspect | Umbrel | Start9 | RaspiBlitz | MyNode | Citadel |
|--------|--------|--------|------------|--------|---------|
| Open-source | yes | yes | yes | partial | yes |
| App store | rich | curated | many | rich | growing |
| Tor default | optional | yes | optional | optional | optional |
| Hardware | Pi + x86 | dedicated + Pi | Pi only | x86 | Pi + x86 |
| Maturity | high | high | high | high | medium |

## Common issues

- microSD wear → use SSD when possible.
- ISP NAT preventing inbound P2P → use Tor or port forwarding.
- Resource over-allocation when running too many apps simultaneously.
- Update breaks: take snapshots before major upgrades.

## See also

- [../core/operations/SKILL.md](../../core/operations/SKILL.md)
- [../lightning/lnd/SKILL.md](../../lightning/lnd/SKILL.md)
- [btcpay/SKILL.md](../btcpay/SKILL.md)
- [mempool-space/SKILL.md](../mempool-space/SKILL.md)
