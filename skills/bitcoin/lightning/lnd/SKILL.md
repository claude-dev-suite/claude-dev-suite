---
name: lightning-lnd
description: |
  LND (Lightning Network Daemon) by Lightning Labs: gRPC + REST API,
  macaroons, lncli, autopilot, channel backups (SCB), Tor support,
  watchtowers, integration with bitcoind/btcd/Neutrino backend.
  USE WHEN: integrating with LND, scripting lncli, debugging LND-specific
  issues, designing LND-based services.
allowed-tools: Read, Grep, Glob
---

# LND (Lightning Network Daemon)

LND is the most widely deployed Lightning implementation. Written in
Go, primary backend for many services, exchanges, and apps.

## Release lines (as of September 2026)

- `v0.21.3-beta` (2026-09-02) — current release, reproducibly built
  with `go1.26.6`.
- `v0.20.4-beta` (2026-09-02) — maintenance branch, still receiving
  backports, but see the reorg bug below.
- `v0.21.0-beta` (2026-06-05) opened the 0.21 line.

New in `v0.21.0-beta`:
- Reorg protection for channel closes (see below).
- Production (final) simple taproot channels, feature bits 80/81.
  Request with `lncli openchannel --channel_type=taproot`;
  `taproot-staging` still opens the legacy staging variant. Must stay
  private until announced taproot channels are supported.
- Taproot channel support for the RBF cooperative close protocol
  (`--protocol.rbf-coop-close`, the protocol itself added in
  `v0.19.0`).
- Basic onion message forwarding, feature bits 38/39, on by default —
  disable with `protocol.no-onion-messages=true`. Ingress is rate
  limited per peer (~0.5 Mbps default) and globally (~5 Mbps), and
  messages from peers with no fully open channel are dropped unless
  `protocol.onion-msg-relay-all=true`.
- The KV-to-SQL payments migration is promoted out of the
  `test_native_sql` build tag into mainline builds, for users running
  with the `native-sql` setting enabled.

## Security: coop-close reorg bug (fixed in v0.21.0-beta)

Disclosed publicly by Bastien Teinturier on 2026-08-13 (discovered
February 2025; no known victims). Before the fix, `lnd` forgot a
collaboratively closed channel immediately after the **first** on-chain
confirmation. After a 1-block reorg an attacker could publish any
revoked commitment for that channel; because `lnd` had already
forgotten it, no penalty transaction was published and the attacker
could take up to the entire channel balance.

Fixed by [#10331](https://github.com/lightningnetwork/lnd/pull/10331):
`peer.WaitForChanToClose` now registers for a capacity-scaled number of
confirmations instead of a hardcoded `1`.
`lnwallet.CloseConfsForCapacity` scales linearly up to 6 confirmations
at the maximum non-wumbo channel size (`MaxBtcFundingAmount`,
0.16777215 BTC), with a floor of 3 confirmations even for tiny
channels; wumbo channels always require 6. This follows the BOLT 5
recommendation to wait for confirmations before discarding channel
state.

Mind the fixed version. The disclosure post and Bitcoin Optech both
say "v0.20.0, February 2026", but the fix is **not** in the 0.20 line:
`peer/brontide.go` at `v0.20.4-beta` still registers for 1
confirmation, and `lnwallet/confscale.go` first appears at
`v0.21.0-beta`. Treat `v0.21.0-beta` (2026-06-05) as the minimum safe
version.

Operational consequences:
- A coop close is no longer final on the first confirmation.
  `SubscribeChannelEvents` still emits `CLOSED_CHANNEL` early
  ([#10794](https://github.com/lightningnetwork/lnd/pull/10794)
  restored that in `v0.21.0`), but `MarkChannelClosed` only fires at
  full depth.
- `PendingChannels` gained `blocks_til_close_confirmed` and
  `close_height` on `WaitingCloseChannel` (#10509) so callers can
  track remaining confirmations.
- Breaking: `MinCLTVDelta` rose from 18 to 24. Invoices created with a
  custom `cltv_expiry_delta` of 18-23 are now rejected; the default of
  80 is unaffected.

## Components

- `lnd` — daemon process.
- `lncli` — CLI client.
- `tlsCert` — auto-generated TLS for gRPC/REST.
- `macaroons` — capability tokens for API auth.
- Backend options: `bitcoind` (RPC + ZMQ), `btcd` (similar),
  `Neutrino` (BIP157/158 SPV).

## Configuration

`~/.lnd/lnd.conf`:
```ini
[Application Options]
alias=mynode
listen=0.0.0.0:9735
externalip=mynode.onion:9735
tor.active=true
tor.v3=true
maxpendingchannels=10
debuglevel=info

[Bitcoin]
bitcoin.active=true
bitcoin.mainnet=true
bitcoin.node=bitcoind

[Bitcoind]
bitcoind.rpchost=127.0.0.1:8332
bitcoind.rpcuser=...
bitcoind.rpcpass=...
bitcoind.zmqpubrawblock=tcp://127.0.0.1:28332
bitcoind.zmqpubrawtx=tcp://127.0.0.1:28333

[Wtclient]
wtclient.active=true
```

## Macaroons

Per-action capability tokens.
- `admin.macaroon` — full access.
- `readonly.macaroon` — read-only.
- `invoice.macaroon` — generate invoices only.
- Custom: bake via `lncli bakemacaroon` with specific permissions.

```bash
lncli bakemacaroon \
  --save_to=/path/to/custom.macaroon \
  uri:/lnrpc.Lightning/AddInvoice \
  uri:/lnrpc.Lightning/LookupInvoice
```

API calls send macaroon as gRPC metadata `macaroon: <hex>` or HTTP
header `Grpc-Metadata-macaroon: <hex>`.

### Treat macaroon files as hot keys

A macaroon file is bearer authority; `admin.macaroon` is enough to move
funds. Never let a front-end serve the `.lnd` directory.

BTCPay Server 2.4.2 (2026-08-07) fixed exactly this: all prior
versions, including the 2.4.2 release candidates, let an
unauthenticated remote attacker fetch `.macaroon` credential files for
the bundled LND node. BTCPay confirmed the bug was actively exploited
and that funds were stolen. The 2.4.2 update also bumps LND to
`v0.21.1-beta`, regenerates macaroons automatically, and temporarily
removes public LND API access on Docker deployments (so external
wallets such as Zeus cannot connect through the BTCPay domain or onion
address for now). Only LND deployments were exposed; BTCPay's own
on-chain wallets were not.

If you expose LND through your own reverse proxy, Tor service or
forwarded port rather than through BTCPay, rotate credentials
yourself — updating BTCPay does not close access paths you manage.

## gRPC API

Proto: `lnrpc/lightning.proto`. Subservers:
- `lnrpc` — main API.
- `walletrpc` — wallet operations.
- `routerrpc` — payment routing.
- `chainrpc` — chain notifications.
- `signrpc` — message signing, scriptbuilding.
- `invoicesrpc` — invoice subscription.
- `wtclientrpc` — watchtower client.
- `verrpc` — version info.

```python
import grpc, lightning_pb2, lightning_pb2_grpc
cred = grpc.ssl_channel_credentials(open("tls.cert","rb").read())
chan = grpc.secure_channel("localhost:10009", cred)
stub = lightning_pb2_grpc.LightningStub(chan)
mac = open("admin.macaroon","rb").read().hex()
stub.GetInfo(lightning_pb2.GetInfoRequest(),
             metadata=[("macaroon", mac)])
```

## REST API

Same as gRPC but `https://localhost:8080/v1/getinfo`. Macaroon in
header `Grpc-Metadata-macaroon: <hex>`.

## lncli quickstart

```bash
lncli getinfo
lncli newaddress p2tr
lncli connect <pubkey>@<addr>:9735
lncli openchannel <pubkey> --local_amt=1000000 --sat_per_vbyte=10
lncli pendingchannels
lncli listchannels
lncli sendpayment --amt 1000 --dest <pubkey> --keysend
lncli closechannel <funding_txid>:<output_index>
lncli closeallchannels --inactive_only
```

## Channel backups (SCB)

Static Channel Backup:
- Snapshot of channel state metadata (not the on-chain commitment).
- Recovery flow: import SCB on a new lnd instance → SCB triggers
  force-close request from peer (via DLP), peer broadcasts, you sweep
  on chain.

Auto-backup:
```ini
[Application Options]
backupfilepath=/safe/place/channel.backup
```

Restore:
```bash
lncli restorechanbackup --multi_file=channel.backup
```

## Autopilot

Auto-open channels based on heuristic. Generally not recommended for
serious nodes; prefer manual + analytics.

## Integration patterns

### Custodial wallet
- Use `invoicesrpc.SubscribeSingleInvoice` for incoming.
- Use `routerrpc.SendPaymentV2` for outgoing.
- Track state externally (DB).

### Lightning Address server
- Generate invoices on-demand for HTTP requests.
- Use `lnrpc.AddInvoice` with `value_msat`.

### LSP (channel-on-pay)
- Use `funder.OpenChannel` with `private=true` and `zero_conf=true`.
- Pre-handshake with customer's BOLT11 invoice routing hints.

## Common issues

- **wallet-locked**: lnd starts locked, requires `lncli unlock` (or
  password file via `wallet-unlock-password-file=`).
- **macaroon mismatch** after node reset: regenerate, redistribute.
- **bitcoind ZMQ not connected**: check `zmqpubrawtx` matches.
- **autopilot opening too many small channels** → disable.
- **Force-close fee too low** → use `bumpforceclosefee` / anchor CPFP.
- **Close looks stuck after 1 confirmation** (v0.21.0+): expected — a
  close is only final after 3-6 confirmations. Poll
  `blocks_til_close_confirmed` in `pendingchannels` rather than
  treating the first confirmation as done.

## See also

- [bolts/SKILL.md](../bolts/SKILL.md)
- [channels/SKILL.md](../channels/SKILL.md)
- [../../libraries/lnd-go/SKILL.md](../../libraries/lnd-go/SKILL.md)
