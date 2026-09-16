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
- The user is a *required* signer on every transfer: the SO set alone
  cannot move a leaf at any threshold.
- Exit guarantee: even if all SOs collude/disappear, user can always
  exit via timelocked path.

Mainnet beta runs three founding operators -- Lightspark, Flashnet and
Breez (docs.spark.money FAQ, as of September 2026). The SDK's mainnet
wallet config signs at a FROST threshold of 2 over those three, i.e.
2-of-3. Spark states additional SOs will join as the network scales; no
target set size or jurisdictional split has been published.

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
| Stablecoins / tokens | Yes (USDB live Jan 2026) | Yes (Arkade Assets) |

## Use cases

- **Stablecoin / token payments** on Bitcoin (multi-asset).
- **Mobile-first wallets** with no channel-management UX.
- **Enterprise**: integrated with Lightspark's existing LN
  infrastructure.

## Status (as of September 2026)

- Mainnet beta active with 3 operators (Lightspark, Flashnet, Breez).
  Spark's own FAQ still calls it "highly experimental".
- USDB -- a USD stablecoin issued by Brale, backed 1:1 by US Treasury
  bills and cash equivalents -- went live on Spark 21 January 2026.
- Spark's public ecosystem directory lists dozens of wallets,
  infrastructure providers and investors, among them Polymarket and
  Wallet of Satoshi (spark.money/ecosystem, September 2026).
- History: a Q2 2026 roadmap listed an expanded operator set, more
  jurisdictions, deeper Lightning integration and asset support. Treat
  it as superseded -- the dated items above are the current record, and
  the operator and asset milestones both predate that roadmap: Breez was
  announced as a Spark Service Provider on 22 May 2025 and USDB shipped
  21 January 2026. Spark has published no date for the BTKN token
  standard.
- UMA (Universal Money Address) integration alongside Spark for
  cross-currency payments came from that same roadmap and is still
  undocumented as of September 2026: the Spark docs reference UMA only
  as an LNURL/UMA invoice description-hash field. The cross-currency
  path that *is* documented is Lightspark Grid (announced 16 October
  2025): the Spark docs carry a Grid integration page for fiat
  on/off-ramp, and Grid lists Spark among its supported networks.

## Limitations

- **1-of-n honesty**: after a transfer, at least one SO must delete its
  old key share. The FROST k-of-n threshold is a separate liveness
  parameter, not the honesty assumption.
- **Lightning bridging**: requires LSP-like layer; integration costs
  apply.
- **Newer**: less battle-tested than Lightning.

## See also

- [statechains/SKILL.md](../statechains/SKILL.md)
- [ark/SKILL.md](../ark/SKILL.md)
- [../../cryptography/frost/SKILL.md](../../cryptography/frost/SKILL.md)
- [../../lightning/uma/SKILL.md](../../lightning/uma/SKILL.md)
