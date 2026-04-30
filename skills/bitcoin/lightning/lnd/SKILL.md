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

## See also

- [bolts/SKILL.md](../bolts/SKILL.md)
- [channels/SKILL.md](../channels/SKILL.md)
- [../../libraries/lnd-go/SKILL.md](../../libraries/lnd-go/SKILL.md)
