---
name: bitcoin-libraries-btcsuite
description: |
  btcsuite: collection of Go Bitcoin libraries. btcec (secp256k1),
  btcutil (helpers), txscript (Script engine), wire (P2P).
  USE WHEN: building Bitcoin Go apps, integrating with LND / btcd.
allowed-tools: Read, Grep, Glob
---

# btcsuite Libraries

Collection of Go libraries powering btcd and LND.

GitHub org: `github.com/btcsuite`.

## Major libraries

### btcec
secp256k1 wrapper. ECDSA, Schnorr, ECDH.
```go
import "github.com/btcsuite/btcd/btcec/v2"

priv, _ := btcec.NewPrivateKey()
pub := priv.PubKey()
sig := ecdsa.Sign(priv, msgHash[:])
```

### btcutil
Helpers: addresses, networks, base58, bech32.
```go
import "github.com/btcsuite/btcd/btcutil"

addr, _ := btcutil.DecodeAddress("bc1q...", &chaincfg.MainNetParams)
```

### txscript
Bitcoin Script engine and helpers.
```go
import "github.com/btcsuite/btcd/txscript"

builder := txscript.NewScriptBuilder()
builder.AddOp(txscript.OP_DUP).AddOp(txscript.OP_HASH160)
builder.AddData(hashBytes)
builder.AddOp(txscript.OP_EQUALVERIFY).AddOp(txscript.OP_CHECKSIG)
script, _ := builder.Script()
```

### wire
P2P message types, serialization.
```go
import "github.com/btcsuite/btcd/wire"

msg := &wire.MsgVersion{...}
buf := bytes.NewBuffer(nil)
wire.WriteMessage(buf, msg, wire.ProtocolVersion, wire.MainNet)
```

### chaincfg
Network parameters.

## Use cases

- Backend services in Go consuming Bitcoin data.
- LND ecosystem integrations (LND uses btcsuite extensively).
- Tools like `chantools`, `loopd`, `poold`.

## Common pitfalls

- API stability mostly OK; minor breaking changes between major
  versions.
- v2 of btcec is API-different from v1.

## See also

- [btcd/SKILL.md](../btcd/SKILL.md)
- [lnd-go/SKILL.md](../lnd-go/SKILL.md)
