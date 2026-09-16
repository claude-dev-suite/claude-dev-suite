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

## Binaries

`bitcoind` (node), `bitcoin-cli` (RPC client), `bitcoin-qt` (GUI). Since 30.0
(October 2025) a `bitcoin` wrapper dispatches to them: `bitcoin node` is
`bitcoind`, `bitcoin gui` is `bitcoin-qt`, `bitcoin rpc` is `bitcoin-cli
-named`, and `bitcoin help` lists the rest. It implements nothing itself and
the existing commands are not deprecated, but upstream docs increasingly use
it, so recognise both spellings.

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
# Testnet3
[testnet4]
# Testnet4 (BIP94, added in 28.0)
[signet]
# Signet
[regtest]
# Regtest
```

The `chain=test/testnet4/signet/regtest` cmdline flag selects active network.
Without `[section]`, top-level options apply universally.

Which public test network to point at - testnet3 (deprecated in Core's own
`-testnet` help text), testnet4, signet - and the status of the testnet5
draft (BIP 95, still Draft as of September 2026) are covered in
[../../testing/testnet/SKILL.md](../../testing/testnet/SKILL.md).

### Key options

| Option | Effect |
|--------|--------|
| `dbcache=4096` | UTXO cache MiB. Default 1024 since 31.0 (April 2026), 450 before. Larger = faster IBD; 4-8 GB ideal during sync. |
| `prune=550` | Min disk MB. 550 keeps last ~3 days. After IBD, reduces from ~875 GB (September 2026) to ~5 GB. Mutually exclusive with `txindex`. |
| `txindex=1` | Maintains full tx index. Required for `getrawtransaction` of arbitrary txs. ~80 GB extra disk. |
| `blockfilterindex=1` | BIP157/158 filters; needed for Electrs/Neutrino. ~6 GB extra. |
| `coinstatsindex=1` | Pre-computed UTXO set stats. ~1 GB. |
| `assumevalid=<hash>` | Skip script validation up to this block. Default in source. |
| `assumeutxo=...` | Fast IBD via committed UTXO snapshot. |
| `maxmempool=1000` | Mempool MB. Default 300. |
| `permitbaremultisig=0` | Refuse to relay bare multisig outputs. Core's default is 1 (permit); Knots ships 0. |
| `datacarrier=0` | Refuse to relay OP_RETURN outputs. Default 1. |
| `datacarriersize=83` | Max aggregate OP_RETURN scriptPubKey bytes per tx. Default 100000 since 30.0; `=83` restores the old limit. |
| `minrelaytxfee=0.00000100` | Relay floor, BTC/kvB. Default 0.1 sat/vB since 30.0; was 1 sat/vB. |
| `incrementalrelayfee=0.00000100` | RBF bump increment, BTC/kvB. Default 0.1 sat/vB since 30.0; change together with `minrelaytxfee`. |
| `blockmintxfee=0.00000001` | Block-template floor, BTC/kvB. Default 0.001 sat/vB since 30.0; was 1 sat/vB. |
| `rpcbind=127.0.0.1:8332` | RPC interface bind. |
| `rpcallowip=192.168.1.0/24` | Subnets allowed to call RPC. |
| `bind=0.0.0.0:8333` | P2P listen interface. |
| `listen=1`, `listenonion=1` | Listen for inbound. |
| `whitelist=download@127.0.0.1` | Privileged peer (disable rate limits, etc.) |
| `proxy=127.0.0.1:9050` | SOCKS5 proxy (Tor). |
| `onlynet=onion` | Tor-only (no clearnet peers). |
| `i2psam=127.0.0.1:7656` | I2P SAM bridge. |
| `cjdnsreachable=1` | Treat fc00::/7 IPv6 as reachable via CJDNS. |
| `privatebroadcast=1` | 31.0+: `sendrawtransaction` broadcasts only over Tor/I2P, one fresh connection per tx. Introspect with `getprivatebroadcastinfo` / `abortprivatebroadcast`. Needs 31.1 - see the advisory note under Tor. |

## Relay policy since 30.0

Bitcoin Core 30.0 (October 2025) moved the default standardness policy, and
this delta is what the Core/Knots divergence is actually about:

- `-datacarriersize` default raised from 83 to 100,000, "which effectively
  uncaps the limit (as the maximum transaction size limit will be hit first)".
  `MAX_OP_RETURN_RELAY` in `src/policy/policy.h` is now
  `MAX_STANDARD_TX_WEIGHT / WITNESS_SCALE_FACTOR`, against a hardcoded `83` in
  v28.0 (#32406).
- Multiple OP_RETURN outputs per transaction are relayed and mined; the limit
  applies to the aggregate scriptPubKey size across all of them (#32406).
- `-minrelaytxfee` and `-incrementalrelayfee` defaults cut to 0.1 sat/vB and
  `-blockmintxfee` to 0.001 sat/vB (#33106). Dust feerate, fee-estimator output
  and wallet feerates are unchanged. Upstream's own caveat: unless the lower
  defaults are widely adopted across the network, transactions built at those
  feerates are not guaranteed to propagate or confirm.
- `getmempoolinfo` gained `permitbaremultisig` and `maxdatacarriersize` fields,
  so effective policy is checkable at runtime (#29954).

`-permitbaremultisig` did not change: `DEFAULT_PERMIT_BAREMULTISIG` is `true` in
`src/policy/policy.h` at v28.0 and in current master alike, so Core has always
permitted bare multisig by default. Knots is the implementation that ships 0.
Read the running value from `getmempoolinfo.permitbaremultisig` (30.0+) rather
than inferring it from the binary's name.

Full RBF is unconditional since 29.0 (April 2025). `-mempoolfullrbf` was
defaulted to 1 in 28.0 and then removed outright - "users no longer benefit
from disabling it, so the option has been removed, making full replace-by-fee
the standard behavior" (#30592). Passing it to 29.0+ is an unknown-setting
startup error.

31.0 (April 2026) replaced the mempool implementation with "cluster mempool":
ancestor/descendant limits are gone in favour of cluster limits (64
transactions, 101 kB vsize), RBF now requires a strictly better mempool feerate
diagram, the CPFP carveout is removed, and `getmempoolcluster` /
`getmempoolfeeratediagram` are new.

## Initial Block Download (IBD)

Phases:
1. **Header sync** — fast, all headers from a single peer.
2. **Block download** — parallel download from multiple peers.
3. **Block validation** — script verify, UTXO set update.

Tips:
- Use a fast SSD; HDD adds days.
- `dbcache=4096` (or higher with RAM) speeds up phase 3 dramatically. 31.0
  (April 2026) raised the default from 450 to 1024 MiB on hosts where at least
  4096 MiB of RAM is detected (#34692); 29.0 (April 2025) dropped the old upper
  cap, which had silently clamped large values to 16 GiB (1 GiB on 32-bit), and
  30.0 (October 2025) re-capped 32-bit hosts at 1 GiB.
- Bandwidth: ~770 GB of block data at height ~967,000 (15 September 2026),
  growing roughly 7 GB/month. Restrict via `maxuploadtarget=` if metered.
- After IBD you can shrink dbcache, but the 31.0+ default is already 1024 MiB;
  only go below it on memory-constrained hosts.

## Pruning vs txindex

- **Pruned (550-15000 MB)**:
  - Fast disk usage; minimal historical access.
  - Cannot serve old blocks to peers (becomes `NODE_NETWORK_LIMITED`).
  - Cannot run Electrs / serve historical `getrawtransaction`.
- **Full (no prune)**:
  - ~875 GB in `blocks/` at height ~967,000 (15 September 2026), growing
    roughly 7 GB/month, plus ~11 GB of chainstate.
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

`-privatebroadcast` (31.0+) is a separate, narrower privacy lever: it makes
`sendrawtransaction` announce only over Tor or I2P, on a separate connection
per transaction, so the originator's IP is never known to the recipients and
two unrelated transactions are not linkable through a shared connection
(#29415). 31.0 shipped a bug where, under some circumstances, those connections
were still made over clearnet; 31.1 (July 2026) "fixes an ip address leak when
using the -privatebroadcast feature". Do not rely on it below 31.1.

## debug.log

Located at `~/.bitcoin/debug.log` (or `~/.bitcoin/<chain>/debug.log`).

Categories, from `LOG_CATEGORIES_BY_STR` in `src/logging.cpp` at v31.1 (July
2026): `net`, `tor`, `mempool`, `http`, `bench`, `zmq`, `walletdb`, `rpc`,
`estimatefee`, `addrman`, `selectcoins`, `reindex`, `cmpctblock`, `rand`,
`prune`, `proxy`, `mempoolrej`, `libevent`, `coindb`, `qt`, `leveldb`,
`validation`, `i2p`, `ipc`, `blockstorage`, `txreconciliation`, `scan`,
`txpackages`, `kernel`, `privatebroadcast`, plus `lock` in
`DEBUG_LOCKCONTENTION` builds. `bitcoin-cli logging` prints the live list.
There is no per-RPC category: an unrecognised name is a startup *error*
("Unsupported logging category -debug=<name>."), not a warning, so a typo
stops the node rather than silently logging nothing. `libevent` is a full
category at v31.1; on master (September 2026) it has been removed from the
map and survives only as a shim in `GetLogCategory` that logs "deprecated,
does nothing, and will be removed in a future version" and enables nothing:
accepted, but inert. Enable verbosity:
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
- Running 31.0+ in a container and inheriting the 1024 MiB `dbcache` default:
  the detected RAM can exceed the memory actually available under the cgroup
  limit, so the node is OOM-killed. Set `-dbcache` explicitly; `450` restores
  pre-31.0 behaviour.
- Using `txindex=1` and `prune=N>0` simultaneously → bitcoind exits
  on startup.
- Multi-wallet without explicit `rpcwallet` parameter → RPC fails
  with "Wallet file not specified".
- `rpcbind=0.0.0.0` without firewall → exposes RPC to internet.
  Always pair with `rpcallowip=` or use SSH tunnel.
- Insufficient `dbcache` during IBD → 4x slower sync.

## Security advisories and minimum safe version

Upstream maintains the latest three majors; the oldest drops out when a new
major ships. As of September 2026 that is 31.x, 30.x and 29.x - 28.x reached
EOL on 2026-04-19, the day 31.0 was released. Treat "oldest still-maintained
major" as the version floor and run the newest maintenance release of it you
can: 31.1 (July 2026) at time of writing.

28.x and every release back to 0.14.0 carry **CVE-2024-52911**, a high-severity
use-after-free in script validation, disclosed 2026-05-05 and fixed in 29.0.
Precomputed transaction data was destroyed before the object controlling the
background script-check threads, so an early return from validating an invalid
block could leave those threads reading freed memory; an attacker with
sufficient proof-of-work could crash victim nodes with crafted invalid blocks.
Found by Cory Fields (MIT DCI), who also supplied the proof of concept and the
mitigation. Advisories are only published once the affected versions are EOL,
so "no advisory yet" is not evidence that an old major is safe.

Tracking practice:
- `bitcoincore.org/en/security-advisories/` - per-CVE disclosure pages.
- `bitcoincore.org/en/lifecycle/` - the supported-major and EOL table.
- The bitcoincore.org announcements mailing list for release/security mail.
- Bitcoin Optech newsletters, which surface merged security fixes before the
  release that carries them.

Fixes merged to master in September 2026 and therefore not in any release yet:
`-walletnotify`'s `%w` substitution no longer goes through
`std::regex_replace`, so an RPC-authenticated caller can no longer smuggle
shell metacharacters through a wallet name (#36048, behaviour introduced in
24.0, not reachable from P2P); the HTTP server throttles per-connection reads
while a request is in flight (#36123); and on Windows the RPC listener uses
`SO_EXCLUSIVEADDRUSE` (#36169).

## See also

- [rpc/SKILL.md](../rpc/SKILL.md)
- [indexes/SKILL.md](../indexes/SKILL.md)
- [zmq/SKILL.md](../zmq/SKILL.md)
- [../../infrastructure/node-distros/SKILL.md](../../infrastructure/node-distros/SKILL.md)
