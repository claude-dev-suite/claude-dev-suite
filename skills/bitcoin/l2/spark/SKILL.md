---
name: bitcoin-l2-spark
description: |
  Spark by Lightspark: statechain-derived L2 with FROST threshold
  signatures, leaf architecture, Lightning compatibility. Beta
  launched April 2025; managed by Spark Operators (SOs).
  USE WHEN: integrating with Spark, evaluating Spark vs Ark vs
  Lightning, designing leaf-based UTXO trees.
allowed-tools: Read, Grep, Glob
---

# Spark (Lightspark)

Spark is an open-source L2 by Lightspark (David Marcus, ex-PayPal /
ex-Facebook) launched April 2025. Builds on statechain concepts with
**FROST threshold signing** and a **leaf-based** structure for
partial transfers.

## Architecture

Core components:
- **Spark Operators (SOs)**: collective threshold signers, FROST
  k-of-n.
- **Leaves**: terminal off-chain UTXOs owned by users; each has a
  relative-timelock exit transaction.
- **Trees**: hierarchical structure supporting partial-balance
  transfers.

## Leaves

Each Spark leaf is:
- An off-chain UTXO with FROST-aggregated multisig.
- A **relative-timelock unilateral exit tx** that anyone can broadcast
  after CSV expiry to extract the leaf on chain.
- Transferable off-chain via SO-coordinated protocol.

## Security model

**1-of-n trust on Spark Operator collective**:
- As long as one operator behaves honestly, user funds remain secure.
- FROST threshold signing means no single SO controls the keys.
- Exit guarantee: even if all SOs collude/disappear, user can always
  exit via timelocked path.

Currently launched with 2 operators (Lightspark + Flashnet); planned
expansion to diverse jurisdictions.

## Lightning compatibility

Spark integrates with Lightning:
- Spark balance can be used to pay Lightning invoices.
- Lightning balance can flow into Spark.
- Bridges via Lightspark's Lightning infrastructure.

## API

Lightspark provides SDKs:
- TypeScript / JavaScript.
- Go.
- Python.
- iOS / Android (Swift / Kotlin).

```typescript
const wallet = new SparkWallet({ apiKey });
await wallet.deposit({ amount: 10000 });
await wallet.send({ to: "user@spark.money", amount: 5000 });
await wallet.payLightningInvoice("lnbc100u...");
```

## Compared to Ark

| Aspect | Spark | Ark |
|--------|-------|-----|
| Operator | k-of-n FROST | 1 ASP per round |
| Architecture | Leaf trees | VTXO trees |
| Round-based | Continuous | Periodic rounds |
| Status | Live beta | ARKADE live beta |
| Lightning integration | Native | Optional / future |
| Stablecoins / tokens | Yes (planned) | Yes (Arkade Assets) |

## Use cases

- **Stablecoin / token payments** on Bitcoin (multi-asset).
- **Mobile-first wallets** with no channel-management UX.
- **Enterprise**: integrated with Lightspark's existing LN
  infrastructure.

## Status & roadmap (2026 Q2)

- Beta active with 2 operators.
- Q2 2026 roadmap: expanded operator set, more jurisdictions, deeper
  Lightning integration, asset support.
- UMA (Universal Money Address) integration alongside Spark for
  cross-currency payments.

## Limitations

- **k-of-n trust**: although FROST minimizes single-operator
  compromise, you still trust the operator collective.
- **Lightning bridging**: requires LSP-like layer; integration costs
  apply.
- **Newer**: less battle-tested than Lightning.

## See also

- [statechains/SKILL.md](../statechains/SKILL.md)
- [ark/SKILL.md](../ark/SKILL.md)
- [../../cryptography/frost/SKILL.md](../../cryptography/frost/SKILL.md)
- [../../lightning/uma/SKILL.md](../../lightning/uma/SKILL.md)
