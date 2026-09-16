---
name: lightning-channel-jamming
description: |
  Channel jamming attacks: slow-jam (long-held HTLCs exhaust slots),
  fast-jam (rapid hold/release exhausts liquidity). Mitigations:
  upfront fees, reputation, hold-fee proposals.
  USE WHEN: assessing LN security model, designing reputation systems,
  evaluating jamming-resistant routing.
allowed-tools: Read, Grep, Glob
---

# Channel Jamming

Lightning's HTLC-based forwarding has DoS vulnerabilities where
malicious senders block honest payments without paying for the
disruption.

## Two main variants

### Slow-jam (resource jamming)
Attacker sends large HTLCs that fail to settle until close to CLTV
expiry, then fails them. During the wait, the channels' HTLC slots
+ liquidity are tied up.

Cost to attacker: nothing — failed HTLCs cost zero (no fee paid for
failed payments).

Damage: legitimate payments rejected for "no liquidity" / "no slot
available" while attacker's HTLCs sit.

### Fast-jam (channel exhaustion)
Attacker rapidly cycles HTLCs (send → fail), filling and freeing slots
faster than honest senders can grab them.

Less effective than slow-jam but still degrades service.

## Why this works

Lightning has no payment for **failed** HTLC routing:
- Successful payment: each hop earns its forwarding fee.
- Failed payment: each hop refunds, no fee charged.
- Attacker exploits this asymmetry.

## Mitigation 1: Upfront fees (proposal)

Charge a small fee BEFORE forwarding. Even failed HTLCs cost the
sender. Returned to sender on success (or kept regardless).

Proposed in various BLIPs; not yet active.

## Mitigation 2: Reputation

Forwarders track which upstream peers send HTLCs that frequently
fail. Penalize bad senders by:
- Lower forwarding priority.
- Higher upfront fee.
- Outright rejection.

Implementations:
- LSPs apply per-customer reputation.
- LDK has experimental reputation tracking.

Signalling layer:
[bLIP-4](https://github.com/lightning/blips/blob/master/blip-0004.md)
"Experimental Endorsement Signaling" (Carla Kirk-Cohen) is listed Active
in the `lightning/blips` repo as of September 2026. It defines an
experimental `endorsed` TLV (type 106823) on `update_add_htlc`: the
original sender sets `endorsed`=7 when it expects the payment to resolve
immediately and 0 otherwise, and forwarders relay or re-set the signal at
their discretion. Deliberately data-gathering only — nodes MUST NOT use
`endorsed` in resource allocation for the duration of the experiment,
whose `experiment_end` is unix 1767225600 (1 January 2026). Observable
state as of September 2026: `experiment_start` is still the literal
"TODO: set once feature bit is widely deployed" and that
`experiment_end` has already elapsed, while the bLIP's repo status is
unchanged at Active. The matching BOLT change (bolts PR #1071, "HTLC
Endorsement to Mitigate Channel Jamming") was closed unmerged in August
2025, so endorsement remains outside the BOLTs as of September 2026.

Measurement substrate: `option_attribution_data` (feature bits 36/37) is
in BOLT 9 as of September 2026. Attribution data rides as TLV type 1 on
`update_fulfill_htlc` and `update_fail_htlc` and carries
`htlc_hold_times` — up to 20 per-hop hold times in units of 100 ms, each
covered by the reporting hop's HMAC. That gives the sender a verifiable
per-hop latency record, which is the raw measurement any hold-time-based
reputation or hold-fee scheme needs.

## Mitigation 3: Per-channel HTLC limits

Aggressive `max_accepted_htlcs` (default ~483) and `max_htlc_value_in_flight_msat`
limit damage per channel.

Trade-off: low limits also hurt legitimate MPP / micro-payments.

## Mitigation 4: Hold fees

Charge per-hop a "hold fee" proportional to `time × amount` that the
HTLC is in flight. Long hold = larger fee. Defeats slow-jam.

The long-standing blocker is that there is no universal clock and no way
to prove a message (the preimage) was delivered at a given moment, so
"how long did you hold it?" is unprovable. Antoine Riard's *Conditional
Message Transfer Contract* (CMTC),
[posted to Delving Bitcoin](https://delvingbitcoin.org/t/conditional-message-transfer-contract-to-solve-jamming/2772)
on 7 August 2026, is the first concrete construction that attacks that
blocker. It is a Bitcoin Script construction, using adaptor signatures
and timelocks on today's consensus rules, that lets two channel
counterparties later prove whether a specific message was exchanged
between them by a given block height — block height serving as the
universal clock. The parties agree on a discrete temporal window and
assign an "oracle-time" adaptor point to each point in it, so a withhold
fee can be settled according to when the message was delivered. Three
proof paths:

- **Message transfer success**: Bob delivers the preimage and Alice
  cryptographically acknowledges it; the two split the withhold fee
  according to delivery time.
- **Liveness challenge**: Alice is offline and cannot counter-sign; Bob
  exits the contract and recovers the locked funds minus an equilibrium
  penalty fee.
- **Message transfer failure**: Bob is offline or never delivers the
  message; Alice exits and takes the withhold fee.

Riard presents only an on-chain version and leaves lifting it into an
off-chain channel (as extra tapscript leaves) to future work. He also
states that the construction's cryptographic correctness and its
cryptoeconomic equilibrium both need further analysis — treat it as a
research prolegomenon, not a deployable design.

Status as of September 2026: research-stage. Not in any BOLT.

## Mitigation 5: Channel jamming via stuckless payments

Stuckless = receiver provides cancellation token; if sender wants to
abort, they can without keeping CLTV pending. Reduces slow-jam window.

Status: theoretical / spec-stage.

## Real-world status

As of September 2026:

- Active jamming attacks exist but are not yet a major operational
  problem (small network, low incentive).
- Anticipated to become serious if/when LN scales 10-100x.
- Major LN routing nodes are starting to apply heuristic-based
  reputation systems.
- Spec-side work is on measurement and signalling (attribution data,
  bLIP-4 endorsement), not yet on enforcement; the economic mitigations
  (upfront fees, hold fees/CMTC) remain research.

## Compared to replacement cycling

- **Replacement cycling**: attacks specific HTLC-timeout settlement
  on chain.
- **Channel jamming**: attacks live channels off chain by exhausting
  resources.

Different layers, different mitigations.

## See also

- [routing/SKILL.md](../routing/SKILL.md)
- [onion/SKILL.md](../onion/SKILL.md)
- [htlcs/SKILL.md](../htlcs/SKILL.md)
- [replacement-cycling/SKILL.md](../replacement-cycling/SKILL.md)
- [pinning-attacks/SKILL.md](../pinning-attacks/SKILL.md)
