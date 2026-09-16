---
name: lightning-cln
description: |
  Core Lightning (CLN, formerly c-lightning) by Blockstream: lightningd,
  lightning-cli, plugin architecture (Python pyln-client, Rust cln-plugin,
  Go glightning), commando, BOLT12 leadership, xpay/askrene payments.
  USE WHEN: integrating with CLN, writing plugins, debugging CLN-specific
  behaviour, leveraging BOLT12 features, migrating payments from pay to
  xpay.
allowed-tools: Read, Grep, Glob
---

# Core Lightning (CLN)

CLN is the second most-deployed Lightning implementation, by Blockstream.
Strong focus on protocol leadership (often first to ship BOLT updates).

## Versioning and releases

CalVer since v22.11 (November 2022): `vYY.MM` majors, `vYY.MM.N` point
releases, `vYY.MMrcN` candidates. There is no semver "1.0".

Release line as of September 2026:

- **v26.06 "Quantum-Resistant Lightning Channel"** (2026-06-02) is the
  current major; **v26.06.7** (2026-08-28) is the current point release.
- v26.04 "Negative Routing Fees" (2026-04-20).
- v25.12 "Boltz's Seamless Upgrade Experience" (2025-12-04).
- v25.09 "Hot Wallet Guardian" (2025-09-02).

Pin a release tag, not a branch. `rc` builds are for signet/regtest.

## Security releases and embargoes

CLN will ship **signed binaries before it publishes the source**. v26.06.7
(2026-08-28) was an emergency security release whose source was withheld
under a 14-day embargo; the embargo lifted and the source was published
2026-09-11. Operators were expected to upgrade on the binary, before they
could read the diff.

- Practical consequence: an upgrade process that can only build from source
  cannot patch during an embargo. Keep a binary-install path.
- Verify what you install — every release carries a signed manifest:
  ```bash
  sha256sum -c SHA256SUMS-v26.06.7 --ignore-missing
  gpg --verify SHA256SUMS-v26.06.7.asc SHA256SUMS-v26.06.7
  ```
- Docker tags are not automatically trustworthy across a security release.
  Between 2026-08-28 and 2026-09-01 the `v26.06.7` and `latest` images
  reported the new version but did not contain the fixes — CI had built them
  from a placeholder tag. Pin by digest and re-check:
  ```bash
  docker image inspect elementsproject/lightningd:v26.06.7 \
    --format '{{index .RepoDigests 0}}'
  ```
- The v26.06.7 notes explicitly attribute the rising volume and pace of
  vulnerability reports to increasingly capable AI models being pointed at
  open-source code. Budget for more frequent security point releases.

### `connect` is the trust boundary, not `fundchannel`

Concrete example, disclosed by Erick Cestari (write-up posted to Delving
Bitcoin 2026-08-27) and reported in Bitcoin Optech #421 (2026-09-04): a
peer that merely completed the BOLT8 handshake — no channel, no funds at
stake — could flood `ping` messages asking for the largest legal `pong`
reply (BOLT1 caps `byteslen` at 65531) while never reading its own TCP
socket. `connectd` applied no backpressure to locally-handled messages, so
the outgoing queue grew until the node was OOM-killed — one connection was
enough against a 2GB-RAM test node. `query_channel_range` over a maximal
block range is the same bug by another route, so rate-limiting `ping` alone
was never the fix. Fixed by PR #8525, the last change in v25.09
(2025-09-02); releases before that are vulnerable.

Treat every peer that can complete a handshake as hostile, and rate-limit
or firewall inbound `9735` if the node does not need public inbound.

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
lightning-cli xpay <bolt11>          # `pay` is legacy — see Payments below
lightning-cli invoice 100000 inv-id "Coffee"
lightning-cli close <peer-id> 600   # close with 10-min unilateral timeout
lightning-cli graceful 300          # v26.06+: drain HTLCs before `stop`
```

## Payments: xpay and askrene

CLN's payment stack has been rewritten twice. All three generations still
ship in the tree:

- `pay` — the original plugin, Dijkstra pathfinding. Legacy.
- `renepay` — experimental Pickhardt-Richter payments added in v23.08,
  on a minimum-cost-flow solver.
- `askrene` + `xpay` — the current split. `askrene` landed as an
  experimental plugin in v24.08; `xpay` arrived on top of it in v24.11.

The split is the thing to understand: **`askrene` is routing advice, `xpay`
is execution.** `askrene` keeps channel-liquidity beliefs in named *layers*
and runs the min-cost-flow solver; `xpay` splits the payment, sends the
parts, retries, and reports each attempt's outcome back into `askrene`, so
the beliefs improve over time. Generic pathfinding theory lives in
[routing/SKILL.md](../routing/SKILL.md); this is CLN's implementation of it.

As of v26.06 (2026-06-02) the deprecation cycle for `pay` has started and
`xpay-handle-pay` **defaults to true**, so `lightning-cli pay` is already
served by xpay unless you set `xpay-handle-pay=false`. Invoices fetched from
`invoicerequest` are paid via xpay. Write new integrations against `xpay`.

```bash
lightning-cli xpay <bolt11-or-bolt12-invoice>
lightning-cli xpay -k invstring=<inv> maxfee=5000 retry_for=60
lightning-cli xkeysend <destination> <amount_msat>   # keysend, v26.06+
lightning-cli sendamount <invstring> <amount_msat>   # fix amount SENT, v26.06+
```

`xpay` parameters (v26.06.7): `invstring` (required), `amount_msat`,
`maxfee` (default 5000msat or 1%, whichever is greater), `layers`,
`retry_for` (default 60s), `partial_msat`, `maxdelay`, `payer_note`,
`label`, `localinvreqid`. It returns `payment_preimage`,
`successful_parts`, `failed_parts`, `amount_msat` (received) and
`amount_sent_msat` (sent, including fees) — the difference is the fee
actually paid.

### Steering askrene

Layers are the knob. Create one, bias or disable nodes and channels inside
it, then hand it to a payment through `xpay`'s `layers` array:

```bash
lightning-cli askrene-create-layer mylayer true
lightning-cli -k askrene-bias-channel layer=mylayer \
  short_channel_id_dir=<scid>/<dir> bias=-5 description="flaky peer"
lightning-cli -k askrene-bias-node layer=mylayer node=<node-id> \
  direction=out bias=-3
lightning-cli askrene-disable-node mylayer <node-id>
lightning-cli askrene-listlayers
lightning-cli xpay -k invstring=<inv> layers='["mylayer"]'
```

- Bias is an integer, positive good / negative bad; +/-1 through +/-10 are
  the useful range, +/-100 the limits.
- A negative bias needs keyword form (`-k … bias=-5`): `lightning-cli` runs
  its own option parser over the whole argv before it builds the request, so
  a bare `-5` positional is rejected as an unknown option. Keyword autodetect
  only inspects the *first* parameter, so a `key=value` later in an otherwise
  positional line is sent verbatim as a positional string instead.
- `askrene-bias-node` takes a `direction` of `in` or `out`, and was added in
  v25.12. `relative=true` adds to the existing bias instead of replacing it.
- Other layer RPCs: `askrene-inform-channel`, `askrene-update-channel`,
  `askrene-create-channel`, `askrene-reserve` / `-unreserve`,
  `askrene-remove-layer`, `askrene-age`.

**Gotcha, as of September 2026**: biases on a *persistent* layer have been
crash-prone in two unrelated ways — a startup crash restoring a node bias
that carries a `description` (#9434, fixed on master 2026-09-03), and a null
pointer dereference when a channel or node bias is reset to zero (#9473,
fixed on master 2026-09-04). Both landed after v26.06.7, so no release
carries them yet. Until one does, be careful with persistent layers.

## BOLT12 (CLN's strength)

CLN was first to ship full BOLT12 offer support:
```bash
lightning-cli offer 100sat "Coffee"
# → returns offer string lno1...

lightning-cli decode lno1...

# Pay an offer
lightning-cli fetchinvoice lno1...
lightning-cli xpay <returned_invoice>
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
