---
name: lightning-cln
description: |
  Core Lightning (CLN, formerly c-lightning) by Blockstream: lightningd,
  lightning-cli, plugin architecture (Python pyln-client, Rust cln-plugin,
  Go glightning), commando, BOLT12 leadership.
  USE WHEN: integrating with CLN, writing plugins, debugging CLN-specific
  behaviour, leveraging BOLT12 features.
allowed-tools: Read, Grep, Glob
---

# Core Lightning (CLN)

CLN is the second most-deployed Lightning implementation, by Blockstream.
Strong focus on protocol leadership (often first to ship BOLT updates).

## Components

- `lightningd` — daemon.
- `lightning-cli` — CLI client.
- Plugins — extend functionality (Python, Rust, Go, JS, anything that
  speaks JSON-RPC over stdin/stdout).
- `commando` — built-in plugin for HTTP-RPC access (CLN's macaroon
  equivalent).

## Configuration

`~/.lightning/config` or per-network `~/.lightning/<network>/config`:
```ini
network=bitcoin
bitcoin-rpcuser=...
bitcoin-rpcpassword=...
bitcoin-rpcport=8332
alias=mynode
rgb=ff0000
log-level=info
fee-base=1000
fee-per-satoshi=1
log-file=/var/log/lightningd.log
plugin=/path/to/plugin.py
```

Network selection: `--network=bitcoin|testnet|signet|regtest`.

## Plugin architecture

CLN plugins are **executable files** that:
- Read JSON-RPC messages on stdin.
- Write responses on stdout.
- Implement `getmanifest` to declare hooks, methods, options,
  notifications.

Lifecycle:
1. lightningd spawns plugin.
2. Plugin sends `getmanifest` reply.
3. lightningd sends `init` with config.
4. Plugin handles incoming methods, hooks, notifications.

### Python plugin (pyln-client)

```python
from pyln.client import Plugin
plugin = Plugin()

@plugin.method("hello")
def hello(name):
    return {"message": f"Hello {name}"}

@plugin.subscribe("invoice_payment")
def on_payment(invoice_payment, **kwargs):
    print(f"Got payment: {invoice_payment}")

plugin.run()
```

### Hooks (intercept and modify)

- `htlc_accepted` — examine incoming HTLC, decide forward/fail/resolve.
- `peer_connected` — accept/reject incoming connections.
- `db_write` — augment DB writes.
- `commitment_revocation` — capture commitment revocations.

### Notifications (read-only events)

- `channel_opened`, `channel_state_changed`.
- `invoice_payment`, `invoice_creation`.
- `forward_event`, `sendpay_success`, `sendpay_failure`.

## RPC API

`lightning-cli <method> <args>`. JSON-RPC over Unix socket
(`~/.lightning/<network>/lightning-rpc`).

### Common commands

```bash
lightning-cli getinfo
lightning-cli newaddr p2tr
lightning-cli connect <id>@<addr>:9735
lightning-cli fundchannel <id> 1000000 normal
lightning-cli listpeers
lightning-cli listfunds
lightning-cli pay <bolt11>
lightning-cli invoice 100000 inv-id "Coffee"
lightning-cli close <peer-id> 600   # close with 10-min unilateral timeout
```

## BOLT12 (CLN's strength)

CLN was first to ship full BOLT12 offer support:
```bash
lightning-cli offer 100sat "Coffee"
# → returns offer string lno1...

lightning-cli decode lno1...

# Pay an offer
lightning-cli fetchinvoice lno1...
lightning-cli pay <returned_invoice>
```

## Commando (HTTP-RPC)

Built-in plugin for HTTP access:
```bash
lightning-cli commando-rune
# Returns an "rune" — capability token like macaroon

# Remote call
curl -X POST https://node:9736/v1/listfunds \
  -H "rune: <rune>" \
  -d '{}'
```

Runes are restrictable (similar to macaroon caveat system).

## Database

Default SQLite at `~/.lightning/<network>/lightningd.sqlite3`. Optional
PostgreSQL backend:
```ini
wallet=postgres://user:pass@host:5432/cln
```

## Backup

- Periodic `wallet.dat`-equivalent: copy SQLite file with lightningd
  stopped (or use online backup tool).
- Or PostgreSQL backup tools.
- `static_backup` plugin: simulates SCB-like recovery.
- **Critical**: never restore old database while channels still
  active — re-broadcasting an old commitment = funds loss.

## Implementation strengths

- **Protocol leadership**: BOLT12, splice, dual-fund first.
- **Plugin ecosystem**: many community plugins (e.g., `clboss` for
  liquidity, `circular` for rebalancing).
- **Memory-efficient**: typically uses less RAM than LND.
- **Plain SQL backend**: easier to inspect / migrate.

## Common issues

- Plugin crashes can hang lightningd. Use `--important-plugin=` only
  for critical plugins, others as `--plugin=`.
- Plugin manifest mismatch (declared hook not implemented) → init
  fails.
- PostgreSQL backend with wrong locale → SQL errors at startup.
- Restoring SQLite DB without proper "no concurrent writes" → corrupt.

## See also

- [bolts/SKILL.md](../bolts/SKILL.md)
- [bolt12/SKILL.md](../bolt12/SKILL.md)
- [splicing/SKILL.md](../splicing/SKILL.md)
