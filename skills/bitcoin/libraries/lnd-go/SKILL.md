---
name: bitcoin-libraries-lnd-go
description: |
  lnd Go libraries: lnrpc (gRPC client), chantools (channel utilities),
  loopd (Loop client), poold (Pool client), neutrino (BIP157/158 SPV).
  USE WHEN: building Go apps integrating with LND, Loop, or running
  Neutrino light clients.
allowed-tools: Read, Grep, Glob
---

# LND Go Libraries

LND ecosystem provides several Go modules.

GitHub: `github.com/lightningnetwork/lnd` and `github.com/lightninglabs/`.

## lnrpc (LND gRPC client)

```go
import "github.com/lightningnetwork/lnd/lnrpc"
import "google.golang.org/grpc"

conn, _ := grpc.Dial("localhost:10009",
    grpc.WithTransportCredentials(creds),
    grpc.WithPerRPCCredentials(macaroon))
client := lnrpc.NewLightningClient(conn)
info, _ := client.GetInfo(ctx, &lnrpc.GetInfoRequest{})
```

## Subservers

- `walletrpc` — wallet ops.
- `routerrpc` — payments.
- `chainrpc` — chain notifications.
- `signrpc` — message signing, scripts.
- `invoicesrpc` — invoice subscriptions.
- `wtclientrpc` — watchtower client.

## neutrino

BIP157/158 light client:
```go
import "github.com/lightninglabs/neutrino"

cfg := neutrino.Config{
    DataDir:      "/path",
    Database:     db,
    ChainParams:  chaincfg.MainNetParams,
    ConnectPeers: []string{"node1:8333"},
}
chainSvc, _ := neutrino.NewChainService(cfg)
```

## chantools

CLI for LND channel recovery:
```bash
chantools recoverloop \
    --rootkey <xprv> \
    --frominactive
```

## loop / pool clients

For Lightning Loop and Pool:
```go
import "github.com/lightninglabs/loop/looprpc"
```

## Use cases

- Backend services that integrate with LND.
- Custom monitoring / analytics tooling.
- Light-client-based apps (Neutrino).

## See also

- [../../lightning/lnd/SKILL.md](../../lightning/lnd/SKILL.md)
- [../../lightning/loop-pool-lit/SKILL.md](../../lightning/loop-pool-lit/SKILL.md)
- [btcd/SKILL.md](../btcd/SKILL.md)
- [btcsuite/SKILL.md](../btcsuite/SKILL.md)
