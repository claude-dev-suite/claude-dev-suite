---
name: bitcoin-libraries-tapd-go
description: |
  taproot-assets daemon (tapd): Go implementation of Taproot Assets
  Protocol by Lightning Labs. Companion to LND.
  USE WHEN: integrating with tapd, building Taproot Assets apps in
  Go.
allowed-tools: Read, Grep, Glob
---

# tapd (Taproot Assets Daemon)

Go implementation of Taproot Assets Protocol. Runs alongside LND.

Repo: `github.com/lightninglabs/taproot-assets`.

## Install

```bash
go install github.com/lightninglabs/taproot-assets/cmd/tapd@latest
go install github.com/lightninglabs/taproot-assets/cmd/tapcli@latest
```

## Run

```bash
tapd --network=mainnet \
    --lnd.host=localhost:10009 \
    --lnd.macaroonpath=admin.macaroon \
    --lnd.tlspath=tls.cert
```

## CLI

```bash
tapcli assets mint --type normal --name USDC-Test --supply 1000000 --meta ...
tapcli addrs new --asset_id <id> --amt 1000
tapcli assets send --addrs <addr>
```

## API

gRPC API:
```go
import "github.com/lightninglabs/taproot-assets/taprpc"

client := taprpc.NewTaprootAssetsClient(conn)
info, _ := client.GetInfo(ctx, &taprpc.GetInfoRequest{})
```

## Lightning integration

For Taproot Assets channels:
```bash
tapcli ln ...   # asset-aware Lightning subcommands
```

Combined with `litcli` (Lightning Terminal) for unified UI.

## Use cases

- Stablecoin / token issuance on Bitcoin.
- Token-aware Lightning channels.
- Asset-based payments via LN routing.

## See also

- [../../l2/taproot-assets/SKILL.md](../../l2/taproot-assets/SKILL.md)
- [lnd-go/SKILL.md](../lnd-go/SKILL.md)
- [../../lightning/lnd/SKILL.md](../../lightning/lnd/SKILL.md)
