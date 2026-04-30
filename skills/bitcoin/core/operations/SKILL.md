---
name: bitcoin-core-operations
description: |
  Running Bitcoin Core in production: bitcoin.conf reference, sections,
  pruning, signet, dbcache, mempool tuning, network bind, Tor, IBD
  considerations, debug.log analysis.
  USE WHEN: deploying a node, tuning performance, debugging IBD issues,
  configuring multi-network nodes.
allowed-tools: Read, Grep, Glob
---

# Running Bitcoin Core

## Configuration file

`~/.bitcoin/bitcoin.conf` (Linux/macOS) or
`%APPDATA%\Bitcoin\bitcoin.conf` (Windows). Optional `-conf=` flag.

### Section markers

```ini
# Top-level: applied to all networks
dbcache=4096

[main]
# Mainnet-only
prune=550

[test]
# Testnet
[signet]
# Signet
[regtest]
# Regtest
```

The `chain=test/signet/regtest` cmdline flag selects active network.
Without `[section]`, top-level options apply universally.

### Key options

| Option | Effect |
|--------|--------|
| `dbcache=4096` | UTXO cache MB. Default 450. Larger = faster IBD; 4-8 GB ideal during sync, can drop to 450 after. |
| `prune=550` | Min disk MB. 550 keeps last ~3 days. After IBD, reduces from ~600 GB to ~5 GB. Mutually exclusive with `txindex`. |
| `txindex=1` | Maintains full tx index. Required for `getrawtransaction` of arbitrary txs. ~80 GB extra disk. |
| `blockfilterindex=1` | BIP157/158 filters; needed for Electrs/Neutrino. ~6 GB extra. |
| `coinstatsindex=1` | Pre-computed UTXO set stats. ~1 GB. |
| `assumevalid=<hash>` | Skip script validation up to this block. Default in source. |
| `assumeutxo=...` | Fast IBD via committed UTXO snapshot. |
| `maxmempool=1000` | Mempool MB. Default 300. |
| `mempoolfullrbf=0` | Default in 28.0+ is 1 (true). |
| `permitbaremultisig=0` | Reject bare multisig outputs (default). |
| `rpcbind=127.0.0.1:8332` | RPC interface bind. |
| `rpcallowip=192.168.1.0/24` | Subnets allowed to call RPC. |
| `bind=0.0.0.0:8333` | P2P listen interface. |
| `listen=1`, `listenonion=1` | Listen for inbound. |
| `whitelist=download@127.0.0.1` | Privileged peer (disable rate limits, etc.) |
| `proxy=127.0.0.1:9050` | SOCKS5 proxy (Tor). |
| `onlynet=onion` | Tor-only (no clearnet peers). |
| `i2psam=127.0.0.1:7656` | I2P SAM bridge. |
| `cjdnsreachable=1` | Treat fc00::/7 IPv6 as reachable via CJDNS. |

## Initial Block Download (IBD)

Phases:
1. **Header sync** — fast, all headers from a single peer.
2. **Block download** — parallel download from multiple peers.
3. **Block validation** — script verify, UTXO set update.

Tips:
- Use a fast SSD; HDD adds days.
- `dbcache=4096` (or higher with RAM) speeds up phase 3 dramatically.
- Bandwidth: ~600 GB. Restrict via `maxuploadtarget=` if metered.
- After IBD, you can shrink dbcache to 450.

## Pruning vs txindex

- **Pruned (550-15000 MB)**:
  - Fast disk usage; minimal historical access.
  - Cannot serve old blocks to peers (becomes `NODE_NETWORK_LIMITED`).
  - Cannot run Electrs / serve historical `getrawtransaction`.
- **Full (no prune)**:
  - ~700 GB disk + growing.
  - Can serve any block to peers.
  - Required for indexers.
- **txindex=1**:
  - Adds ~80 GB.
  - Required for arbitrary `getrawtransaction`.
  - Cannot combine with prune.

For a Lightning node: full + `blockfilterindex=1` is typical (no
txindex needed; LDK/CLN use filter scan).

## Tor configuration

```ini
proxy=127.0.0.1:9050
onlynet=onion
listenonion=1
bind=127.0.0.1
```

`bitcoind` auto-creates a Tor v3 hidden service via `torcontrol`
(needs `controlport=9051` + cookie auth or password in torrc).

## debug.log

Located at `~/.bitcoin/debug.log` (or `~/.bitcoin/<chain>/debug.log`).

Categories: `getrawtransaction`, `mempool`, `net`, `prune`, `validation`,
`zmq`. Enable verbosity:
```ini
debug=mempool
debug=validation
```

Or all: `debug=1`. Performance impact moderate.

Key patterns:
- `UpdateTip:` — new block.
- `received block` — block arrival.
- `txn-already-known` — duplicate broadcast.
- `bad-txns-inputs-missingorspent` — invalid input.
- `Pre-allocating up to ...` — file allocation messages.

## systemd unit

```ini
[Unit]
Description=Bitcoin Core
After=network-online.target

[Service]
ExecStart=/usr/local/bin/bitcoind -daemon -conf=/etc/bitcoin/bitcoin.conf
ExecStop=/usr/local/bin/bitcoin-cli stop
Type=forking
PIDFile=/var/lib/bitcoind/bitcoind.pid
User=bitcoin
Group=bitcoin
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

## Backup considerations

- `wallet.dat` (legacy) or `wallets/<name>/wallet.dat` (descriptor).
- For descriptor wallets: backup is just the descriptors + private
  keys (`listdescriptors true`).
- Stop bitcoind before file copy or use `backupwallet` RPC for
  consistent snapshot.

## Common bugs

- Setting `dbcache=8000` on a system with 4 GB RAM → OOM.
- Using `txindex=1` and `prune=N>0` simultaneously → bitcoind exits
  on startup.
- Multi-wallet without explicit `rpcwallet` parameter → RPC fails
  with "Wallet file not specified".
- `rpcbind=0.0.0.0` without firewall → exposes RPC to internet.
  Always pair with `rpcallowip=` or use SSH tunnel.
- Insufficient `dbcache` during IBD → 4x slower sync.

## See also

- [rpc/SKILL.md](../rpc/SKILL.md)
- [indexes/SKILL.md](../indexes/SKILL.md)
- [zmq/SKILL.md](../zmq/SKILL.md)
- [../../infrastructure/node-distros/SKILL.md](../../infrastructure/node-distros/SKILL.md)
