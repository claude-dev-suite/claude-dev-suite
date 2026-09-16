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

Original concept: Ruben Somsen, 2018. The reference implementation
is **Mercury Layer**, built by CommerceBlock and redesigned around
blinded MuSig2 in January 2024; whether it is still running is
unverified as of September 2026 (below).

## Mechanism

A statechain UTXO is locked in 2-of-2 multisig with:
- The current owner.
- The Statechain Operator.

In Somsen's 2018 design the transfer is unblinded: A reveals its
key share to recipient B, the SO signs a transfer message naming B
as the new owner, and once B confirms receipt the SO will no longer
sign for A. Mercury Layer replaces that with a *blinded* key
update (per its protocol spec; repo last updated January 2025,
read September 2026):
1. Owner A sends B, encrypted, the chain of signed backup txs plus
   a *blinded* transfer value `t1 = o1 + x1`, where `x1` is a
   random the SO supplied. B never learns A's raw share `o1`.
2. B validates that chain client-side, then sends the SO
   `t2 = t1 - o2`.
3. The SO updates its own share to `s2 = s1 + t2 - x1` and deletes
   `s1`. The aggregate key `P` is unchanged.
4. The SO publishes its new *public key share* and the number of
   times it has signed for that statechain. It does not publish a
   transfer log: it is blind to what it signed.

Result: UTXO ownership has moved from A to B without on-chain tx.

## Security model

- **Trust the SO not to collude with prior owners**.
- Worst case: SO + A collude to spend the UTXO, defrauding B.
- Mitigation (Mercury Layer): the SO publishes only its own
  public key share and a count of how many times it has signed
  for that statechain. The receiver checks that count against the
  number of backup txs the sender handed over and re-verifies
  every signature and timelock decrement itself. Equivocation is
  caught by the *receiver before accepting*, not by auditors
  reading a public log — and the check is worthless if a receiver
  skips it.

## Mercury Layer

Built by CommerceBlock. Provenance is murky as of September 2026:
`commerceblock/mercurylayer` — still the only GitHub link on
mercurylayer.com — 404s, as does the `commerceblock` org. A copy
of the tree survives at `mercury-layer/mercurylayer`, but that is
a fork (of the likewise-404ing `22388o/mercurylayer`) with no
stars and no push since January 2025; treat mercurylayer.com as
the source of record.

Liveness is unconfirmed too. The project does publish operator
endpoints: mercurylayer.com's "Status" button points at
`https://api.mercurylayer.com`, and docs.mercurylayer.com
documents a signet key server at `http://test.mercurylayer.com:8500`
(`statechain_entity = "https://test.mercurylayer.com"`). Both
hosts still resolve in DNS — 192.248.157.233 and 45.76.136.11 —
but answer nothing on any port tried (443, 80, 8500), while a
control fetch of mutinynet.com, the electrum server those same
docs configure, returns 200. mercurywallet.com, the earlier
Mercury client's domain, no longer resolves at all (DNS
SERVFAIL). All checked 16 September 2026. Do not tell a reader
Mercury is running; tell them to reach an operator themselves
first.

The implementation:
- Open source (GPL-3.0, per the repo README).
- **Blinded**: since the January 2024 redesign the SO co-signs via
  blinded MuSig2 and learns nothing about what it signs — not the
  TXID, not the aggregate public key, not the final signature. It
  cannot tell a cooperative withdrawal from an onward transfer.
- SO runs a server (key shares held in an Intel SGX enclave),
  users a client.
- Atomic swaps between statechains supported.
- Liquidity offered for trading without on-chain settlement.

## Compared to Spark / Ark

| Aspect | Statechains | Spark | Ark |
|--------|-------------|-------|-----|
| Operator type | Single (or 1-of-n) | FROST k-of-n threshold | k-of-n cosigners + ASP |
| Key sharing | Per transfer | Aggregate via FROST | VTXO-based |
| On-chain unilateral exit | yes | yes (via leaves) | yes (after CSV) |
| Status | Unverified (Mercury, September 2026) | Live beta (Spark) | Live (ARKADE) |

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

## Covenant proposals that affect statechains

BIP448 "Taproot-native (Re)bindable Transactions" (Draft; BIP
number assigned 2026-03-11; Sanders, Poinsot, Roose) bundles three
tapscript opcodes: `OP_TEMPLATEHASH` (BIP446, redefines
`OP_SUCCESS206`), `OP_CHECKSIGFROMSTACK` (BIP348, `OP_SUCCESS204`)
and `OP_INTERNALKEY` (BIP349, `OP_SUCCESS203`). Its motivation
section names this topic directly: the rebindable signatures the
bundle enables make LN-Symmetry ("Eltoo") possible, and that
construction's simplicity "can substantially improve statechains".
Activation is "left to be determined at a later date" (BIP text,
read September 2026).

What it would change here: a rebindable statechain replaces the
decrementing-timelock backup chain with Eltoo-style state
replacement. That removes the bounded-exit problem but adds a
watchtower requirement — the prototype below warns that if a prior
owner publishes an old state, "you or a delegated watcher have 144
blocks to broadcast the newer saved state".

A proof of concept exists, on test networks only. The
`rebindable_statechains` branch of `stutxo/mercurylayer` (a fork of
the Mercury tree, last pushed September 2026) funds each statechain
to a Taproot output with internal key `P` and the single leaf
`OP_TEMPLATEHASH OP_INTERNALKEY OP_CHECKSIGFROMSTACK`, against a
pinned Bitcoin Inquisition revision; a browser wallet demo runs on
Mutinynet at bip448.cash and labels itself "a Mutinynet research
prototype ... not a production wallet". BIP448 is not active on
mainnet as of September 2026.

## See also

- [spark/SKILL.md](../spark/SKILL.md)
- [ark/SKILL.md](../ark/SKILL.md)
- [../../cryptography/musig2/SKILL.md](../../cryptography/musig2/SKILL.md)
- [../../protocol/proposals/SKILL.md](../../protocol/proposals/SKILL.md)
