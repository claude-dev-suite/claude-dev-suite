---
name: bitcoin-libraries-nbitcoin
description: |
  NBitcoin: comprehensive .NET / C# Bitcoin library. Used by BTCPay
  Server, NBXplorer, many .NET tools. Tx, Script, PSBT, BIP32, HW
  wallet integration.
  USE WHEN: building .NET Bitcoin apps, integrating with BTCPay
  ecosystem.
allowed-tools: Read, Grep, Glob
---

# NBitcoin

The .NET / C# Bitcoin library by Nicolas Dorier. Powers BTCPay
Server, NBXplorer, and many enterprise .NET integrations.

Repo: `github.com/MetacoSA/NBitcoin`.

## Install

```bash
dotnet add package NBitcoin
```

## Quick example

```csharp
using NBitcoin;

var network = Network.Main;
var key = new Key();   // random
var addr = key.PubKey.GetAddress(ScriptPubKeyType.Segwit, network);
Console.WriteLine(addr);   // bc1q...

// Tx
var tx = network.CreateTransaction();
tx.Inputs.Add(new TxIn(new OutPoint(...), null));
tx.Outputs.Add(new TxOut(Money.Coins(0.001m), addr));

// PSBT
var psbt = PSBT.FromTransaction(tx, network);
psbt.AddCoins(prevOuts);
psbt.SignAll(ScriptPubKeyType.Segwit, key);
var finalTx = psbt.Finalize().ExtractTransaction();
```

## Features

- Full tx + script support, all output types.
- BIP32/39 HD wallets.
- PSBT (BIP174).
- Taproot, miniscript, descriptors.
- HW wallet integration via HWI subprocess.
- Lightning (BOLT11) decode.
- RPC client.
- Custom networks (Bitcoin Cash, Liquid, etc.).

## Companion projects

- **NBXplorer** — wallet management on top of NBitcoin.
- **BTCPay Server** — uses NBitcoin extensively.

## Use cases

- .NET enterprise Bitcoin integration.
- BTCPay plugin development.
- Windows-native Bitcoin tools.

## Common pitfalls

- API surface large; some patterns vary across versions.
- Cross-platform: .NET Core for Linux/Mac; otherwise Windows.

## See also

- [../../infrastructure/btcpay/SKILL.md](../../infrastructure/btcpay/SKILL.md)
- [../../protocol/psbt/SKILL.md](../../protocol/psbt/SKILL.md)
