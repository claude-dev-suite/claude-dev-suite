---
name: bitcoin-infrastructure-node-distros
description: |
  Self-hosted Bitcoin node distros: Umbrel, Start9 StartOS, RaspiBlitz,
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
- App store ecosystem (Lightning, BTCPay, mempool.space, Specter,
  Jam, ~390 apps in `getumbrel/umbrel-apps` as of September 2026).
- Runs on Raspberry Pi 5, x86, mini PC, VM. Standalone OS only:
  since umbrelOS 1.0 it cannot be installed on top of an existing
  Linux distro, and `curl -L https://umbrel.sh | bash` now just
  prints a pointer to the ISO downloads (September 2026).
- Tor is **off** by default: Settings -> Advanced -> "Remote Tor
  access" is opt-in, and umbreld stores `torEnabled: false` on
  first start (umbrelOS 1.7.4, July 2026).
- Open-source, easy onboarding.
- Default Bitcoin Core + LND.
- umbrelOS 1.7.4 (July 2026) is the current stable line.
- umbrelOS 2.0.0-beta.1 (September 2026) adds Machines (Windows,
  Ubuntu, Debian, Android), multiple user accounts, Storage Manager
  with FailSafe (RAID), GPU acceleration, automatic HTTPS and an MCP
  server for AI agents.

### Start9 StartOS
- Privacy-first, sovereignty-focused.
- Named **StartOS**; the Embassy / EmbassyOS branding is retired.
- App marketplace with curated services shipped as signed S9PK
  packages.
- StartOS 0.4.0 (July 2026) is a full rewrite: LXC replaces
  Docker/Podman, new clearnet-capable networking stack, **Tor demoted
  to an optional plugin**.
- Hardware: Server One (store.start9.com, September 2026) or DIY;
  0.4.0 images cover x86_64, aarch64 (incl. Pi) and RISC-V.

### RaspiBlitz
- Raspberry Pi-focused.
- Ecosystem of plugins (BTCPay, RTL, ThunderHub, JoinMarket, etc.).
- Active community; v1.12.1 (March 2026) is the latest tagged release
  and the repo is still receiving commits as of September 2026.
- Tor is **on** out of the box: a fresh setup writes
  `runBehindTor='on'` into `raspiblitz.conf` and provisioning then
  runs `tor.network.sh on` (v1.12.1 and `dev`, September 2026).
- Boot from microSD or external SSD.

### MyNode
- Premium product (closed-source for paid features) + free tier.
- App library similar to Umbrel.
- Tor is **on** out of the box: the installer runs `systemctl enable
  tor` and the stock `/etc/tor/torrc` carries an active
  `HiddenServiceDir /var/lib/tor/mynode/` (v3) for the web UI, plus
  separate onions for bitcoind and LND (mynodebtc/mynode `master`,
  September 2026).
- Mac/Linux installer.

### Citadel (historical)
- Fork of Umbrel; community-driven, FOSS-exclusive.
- Dormant as of September 2026: `runcitadel/core` archived on GitHub
  (last commit October 2023), no public GitLab project touched since
  June 2024, `runcitadel.space` no longer resolves.
- Context for Umbrel-fork design, not a deployment target.

## Common features

- Bitcoin Core auto-configured.
- LND (or CLN) integrated.
- Tor v3 hidden service for remote access - available everywhere, but
  the out-of-box default splits the field as of September 2026: on
  StartOS 0.4.0+ (July 2026) Tor is an optional plugin on a
  clearnet-first stack and on umbrelOS it is an opt-in Settings switch
  ("Remote Tor access"), while RaspiBlitz and MyNode both turn it on
  during setup.
- Web UI for monitoring + app management.
- Backups and updates managed.

## Hardware requirements

- **CPU**: Raspberry Pi 4/5 minimum; better with x86.
- **RAM**: 4 GB minimum, 8+ GB recommended.
- **Disk**: 1+ TB SSD for an unpruned node - block data alone was
  ~769 GB (716 GiB) on 15 September 2026 and grows ~88 GB/year at
  the current rate (blockchain.com Blockchain Size chart), before
  chainstate, `txindex` or an Electrum index.
- **Network**: stable, decent bandwidth (~770 GB to download for a
  full IBD as of September 2026).

## App ecosystem

Common apps across distros (checked 16 September 2026 against the
Umbrel, Start9 and Start9-Community package repos and the RaspiBlitz
services menu):
- Bitcoin Core, LND, Core Lightning.
- BTCPay Server.
- mempool.space.
- electrs / Fulcrum (Electrum server).
- Ride The Lightning (RTL).
- ThunderHub (LND web UI) - community-packaged on Start9.
- Specter Desktop - community-packaged on Start9.
- Jam / JoinMarket.

Not common, despite frequently being listed as such:
- Eclair - Start9 only (`Start9Labs/eclair-startos`).
- BitFeed - Umbrel only.
- Sphinx Relay - Umbrel only, and legacy: upstream
  `stakwork/sphinx-relay` has had no push since July 2024 and the
  Umbrel package has not been version-bumped since October 2024.

## Use cases

- **Personal Bitcoin sovereignty**.
- **Self-hosted Lightning routing node**.
- **Family / small business** with shared infrastructure.
- **Privacy-conscious users** doing Tor-only - check the distro's
  default first. As of September 2026 StartOS 0.4.0+ (July 2026) ships
  Tor as a plugin and umbrelOS ships it behind the "Remote Tor access"
  switch, both off out of the box; RaspiBlitz and MyNode enable it
  during setup.

## Compared

| Aspect | Umbrel | Start9 | RaspiBlitz | MyNode | Citadel |
|--------|--------|--------|------------|--------|---------|
| Open-source | yes | yes | yes | partial | yes |
| App store | rich | curated | many | rich | frozen |
| Tor default | off (opt-in) | plugin (0.4.0+) | on | on | unverified |
| Hardware | Pi 5 + x86 | Server One + DIY | Pi only | x86 | Pi + x86 |
| Maturity | high | high | high | high | dormant |

Row data as of September 2026: umbrelOS 1.7.4 stable / 2.0.0-beta.1,
StartOS 0.4.0.1, RaspiBlitz v1.12.1. "Tor default" is about what a
fresh install does, not about what is available, and was read from
each project's source: umbreld's `torEnabled: false`, the StartOS
0.4.0 plugin model, `runBehindTor='on'` in RaspiBlitz `_bootstrap.sh`,
and MyNode's stock `/etc/tor/torrc` plus `systemctl enable tor` in its
installer. Citadel is dormant and was not re-checked.

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
