---
name: lightning-watchtowers
description: |
  Watchtower architecture: encrypted breach blob storage, justice
  transactions, monitoring outsourced for offline channels.
  LN-Symmetry (eltoo, BIP 448) alternatives.
  USE WHEN: deploying a watchtower service, evaluating watchtower
  vendors, designing self-hosted monitoring.
allowed-tools: Read, Grep, Glob
---

# Watchtowers

A Lightning channel partner can cheat by broadcasting an old commitment
tx. To detect and revert, the honest party must broadcast a "justice
tx" within `to_self_delay` blocks. Watchtowers do this monitoring on
your behalf when you're offline.

## Threat model

Watchtower is **untrusted** for fund custody. It only learns:
- Channel txid (from `txid_prefix` you provide).
- Encrypted blob (the justice tx).

It does NOT learn:
- Channel balance.
- Counterparty identity.
- Payment activity.

If the watchtower colludes with the cheating party, it gains nothing
(it doesn't have funds; it only fails to broadcast → channel partner
might steal anyway).

## Protocol (implementation-defined)

There is **no watchtower BOLT**. As of September 2026 the
`lightning/bolts` repo root contains BOLTs 00-05, 07-12 plus the
`bolt-simple-taproot.md` extension document — there is no `13-*.md`
and no watchtower spec, and `lightning/blips` contains no watchtower
bLIP at all (September 2026). An unmerged personal draft titled
"Watchtower protocol specification (BOLT DRAFT REV.1)" lives at
`sr-gi/bolt13` (last pushed August 2023) and is what The Eye of
Satoshi implements; Core Lightning's beginners guide links to it.
It is a different protocol from LND's, using `register_top_up` /
`subscription_details` / `add_update_appointment` messages.

Consequence: **there is no cross-implementation tower interop.** An
LND client can only use an LND-protocol tower. The wire protocol
below is LND's `wtwire` (`watchtower/wtwire`, message types 600-607
as of lnd v0.21.3-beta, September 2026) — the de-facto deployed one.

### Registration

Client → Watchtower (`create_session`, type 602):
```
create_session {
  blob_type,       // altruist/reward + commit/anchor/taproot flags
  max_updates,     // uint16, updates honored for this session
  reward_base,     // uint32, flat tower cut if blob_type has reward
  reward_rate,     // uint32, millionths of revoked commitment balance
  sweep_fee_rate,  // sat/kw the justice tx must be built at
}
```

Watchtower replies `create_session_reply` (603) with the session
parameters. The session is identified by the client's brontide key,
not by an explicit session ID field.

### Update push

When client signs new commitment, sends `state_update` (604):
```
state_update {
  seq_num,         // uint16, 1-indexed, <= max_updates
  last_applied,    // uint16, echoes tower's last_applied
  is_complete,     // 1 = tower closes the connection after replying
  hint,            // 16-byte prefix of the revoked commitment txid
  encrypted_blob,  // justice kit, encrypted under the FULL txid
}
```

Watchtower stores `(hint → blob)` mapping. Cannot decrypt without
seeing the actual commitment tx on chain.

### Monitoring

Watchtower watches the chain:
- For each block, scan all txs.
- For each tx in block, compute hint = first-16-bytes-of-txid.
- If hint matches a stored update, decrypt blob using full txid.
- Decrypt yields a justice tx; broadcast it.

### Justice tx

Pre-built sweep tx:
- Spends `to_local` of cheating commitment using revocation key.
- Spends the `to_remote` output when the blob carries one.
- Pays output to a client-specified address.

HTLC outputs are **not** swept by an LND tower: as of lnd
v0.21.3-beta (September 2026) `watchtower/lookout/justice_descriptor.go`
still carries `// TODO(conner): sweep htlc outputs`, and the blob
`Type` flags cover commitment outputs only. In-flight HTLC value is
outside watchtower coverage.

The watchtower fee model:
- **Altruist** — tower takes nothing, client pays only on-chain fees.
  This is what LND ships and the only mode in practice.
- **Reward** — `reward_base` + `reward_rate` negotiated in
  `create_session` add a tower output to the justice tx. Wire support
  exists; lnd's own `docs/watchtower.md` still says reward towers
  "will be enabled in a subsequent release" as of v0.21.3-beta
  (September 2026).
- **Subscription** — the `sr-gi/bolt13` draft and The Eye of Satoshi
  use a prepaid slot count topped up over Lightning, independent of
  LND's model.

## Implementations

### LND watchtower

LND has built-in client (`wtclient`) and tower (`watchtower`),
enabled with `watchtower.active=1`; it listens on `:9911` by default:
```bash
# Tower (your friend's node)
lncli tower info

# Client side: add tower
lncli wtclient add <pubkey>@<addr>:<port>
```

The tower is **private altruist only** — it takes no cut, so there
are no tower fees to configure (lnd v0.21.3-beta, September 2026).
Access control is by whoever knows the tower URI.

### Eclair

Eclair has **no** watchtower, client or server: as of September 2026
there is no watchtower code in `ACINQ/eclair` and no `eclair.conf`
setting for one. Eclair relies on the node itself being online.

### Core Lightning

CLN has no built-in tower. It exposes the `commitment_revocation`
hook, which watchtower plugins (e.g. rust-teos' `watchtower-plugin`)
use to capture the penalty tx for each revoked state.

### Standalone services

- **The Eye of Satoshi** (`talaia-labs/rust-teos`) — open-source
  tower implementing the `sr-gi/bolt13` draft, with a CLN plugin.
  Last tagged release v0.2.0 (February 2023); repo still receives
  occasional commits (latest October 2025 as of September 2026).
- Verify which protocol a vendor speaks before assuming your client
  can talk to it — see the interop note above.

## LN-Symmetry / eltoo (would-be replacement)

LN-Symmetry — the design long discussed as "eltoo" — replaces the
punish-on-cheating model with "latest-state-wins" semantics:
- No revocation; an old state published on chain is overridden by
  rebinding the latest update transaction onto it.
- Watchtowers are no longer per-state justice-blob stores. The draft's
  on-chain requirements make publishing the re-bound complete update
  transaction the response to an old state (`XX-eltoo-onchain.md`), so
  a tower acting for an offline client republishes the latest state
  instead of punishing — a design consequence, not a tower requirement
  the draft states.

Status as of September 2026: still a proposal, and the active work has
moved off SIGHASH_ANYPREVOUT. BIP 118 (SIGHASH_ANYPREVOUT for Taproot
Scripts, Decker/Towns) is still `Status: Draft` and unactivated. The
current vehicle is **BIP 448, "Taproot-native (Re)bindable
Transactions"** (Sanders/Poinsot/Roose, assigned 2026-03-11, `Status:
Draft`), which bundles BIP 446 `OP_TEMPLATEHASH`, BIP 348
`OP_CHECKSIGFROMSTACK` and BIP 349 `OP_INTERNALKEY` — all Draft, none
activated. The BIP 448 abstract names LN-Symmetry ("Eltoo") as a
motivating use case.

Work is collected in the `bip448` GitHub organization (created June
2026). Both Lightning pieces are open, unmerged drafts opened
2026-06-26 by instagibbs: draft BOLTs in `bip448/bolts` PR #1
(`XX-eltoo-peer-protocol.md`, `XX-eltoo-transactions.md`,
`XX-eltoo-onchain.md`) and a Core Lightning implementation in
`bip448/lightning` PR #1. Optech newsletter #421 (2026-09-04) covers
the state of this work.

What the BIP 448 draft BOLTs change for towers:
- Settlement is enforced by `OP_TEMPLATEHASH <expected_hash> OP_EQUAL`
  with **no signature**. The draft calls this "a key advantage over
  BIP118: watchtowers can enforce settlement by simply spending with
  the correct settlement transaction, without needing to recreate any
  signatures."
- Update and settlement transactions are re-bound at broadcast time by
  rewriting the prevout; the template hash excludes prevout data
  (`sha_prevouts`, `sha_scriptpubkeys`, `sha_amounts`), so one
  signature stays valid against any earlier state output.
- Fee bumping uses a keyless P2A anchor under TRUC (BIP 431), which the
  draft says lets third parties (e.g. watchtowers) bump fees without
  requiring key material; replacement is by package RBF on the anchor
  spend.

None of this is deployed: no BIP 448 opcode is active on mainnet as of
September 2026, so every production tower today is still an ln-penalty
tower.

## Self-hosted vs outsourced

| Aspect | Self-hosted | Outsourced |
|--------|-------------|------------|
| Privacy | Best (no one else knows your channels) | Encrypted blobs hide details |
| Reliability | Single point of failure | Multiple towers possible |
| Cost | Server cost | Free on altruist towers; fees on reward/subscription |
| Trust | None | Privacy-leak risk if multiple hashers cluster you |

Best practice: subscribe to **multiple** watchtowers for redundancy.

## Common bugs

- Sending the justice tx blob unencrypted → watchtower learns
  channel state.
- Not retrying tower delivery on failure → missed updates.
- Watchtower with insufficient mempool watch → misses cheating
  broadcast.
- Delayed justice tx broadcast (post `to_self_delay`) → too late.
- Zero-conf channels: watchtower doesn't recognize the channel until
  funding tx confirms; gap in coverage.
- Assuming a tower is interchangeable across implementations — it is
  not; pick a tower that speaks your node's protocol.
- Treating watchtower coverage as covering HTLCs — LND towers sweep
  commitment outputs only (September 2026).

## See also

- [channels/quick-ref/force-close.md](../channels/quick-ref/force-close.md)
- [channel-jamming/SKILL.md](../channel-jamming/SKILL.md)
- [replacement-cycling/SKILL.md](../replacement-cycling/SKILL.md)
