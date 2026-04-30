---
name: bitcoin-l2-statechains
description: |
  Statechains: off-chain UTXO ownership transfer via Statechain
  Operator (SO) signing. Mercury Layer (CommerceBlock) is the main
  implementation. 1-of-N security model.
  USE WHEN: evaluating off-chain UTXO transfer, comparing with Spark/
  Ark, designing 1-of-N security models.
allowed-tools: Read, Grep, Glob
---

# Statechains

A statechain transfers ownership of a UTXO **off-chain** without
moving funds on chain. Each transfer is signed by the current owner
+ a Statechain Operator (SO).

Original concept: Ruben Somsen, 2018. Production impl: **Mercury
Layer** by CommerceBlock.

## Mechanism

A statechain UTXO is locked in 2-of-2 multisig with:
- The current owner.
- The Statechain Operator.

To transfer:
1. Owner A reveals their key share to recipient B.
2. SO signs a new transfer message: "this UTXO now belongs to B".
3. SO publishes signed proof.
4. B confirms receipt; SO can no longer sign for A.

Result: UTXO ownership has moved from A to B without on-chain tx.

## Security model

- **Trust the SO not to collude with prior owners**.
- Worst case: SO + A collude to spend the UTXO, defrauding B.
- Mitigation: SO publishes a "proof of statechain" log; if
  detected, slashing / reputation loss.

## Mercury Layer

CommerceBlock's implementation:
- Open source (MIT).
- SO runs a server, users a client.
- Atomic swaps between statechains supported.
- Liquidity offered for trading without on-chain settlement.

## Compared to Spark / Ark

| Aspect | Statechains | Spark | Ark |
|--------|-------------|-------|-----|
| Operator type | Single (or 1-of-n) | FROST k-of-n threshold | k-of-n cosigners + ASP |
| Key sharing | Per transfer | Aggregate via FROST | VTXO-based |
| On-chain unilateral exit | yes | yes (via leaves) | yes (after CSV) |
| Status | Live (Mercury) | Live beta (Spark) | Live (ARKADE) |

Spark and Ark are statechain-derived but with stronger security
(threshold operators, no single point of failure for SO).

## Use cases

- **Off-chain instant settlement** between participants.
- **Atomic swaps** across statechains (e.g., BTC ↔ LBTC).
- **DEX-like UTXO trading**.

## Limitations

- 1-of-N trust on SO.
- Single SO availability = single point of failure.
- Not as scalable as Lightning for high-frequency micropayments.

## See also

- [spark/SKILL.md](../spark/SKILL.md)
- [ark/SKILL.md](../ark/SKILL.md)
- [../../cryptography/musig2/SKILL.md](../../cryptography/musig2/SKILL.md)
