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

## Mitigation 3: Per-channel HTLC limits

Aggressive `max_accepted_htlcs` (default ~483) and `max_htlc_value_in_flight_msat`
limit damage per channel.

Trade-off: low limits also hurt legitimate MPP / micro-payments.

## Mitigation 4: Hold fees

Charge per-hop a "hold fee" proportional to `time × amount` that the
HTLC is in flight. Long hold = larger fee. Defeats slow-jam.

Status: research-stage. Not yet in BOLT.

## Mitigation 5: Channel jamming via stuckless payments

Stuckless = receiver provides cancellation token; if sender wants to
abort, they can without keeping CLTV pending. Reduces slow-jam window.

Status: theoretical / spec-stage.

## Real-world status

- Active jamming attacks exist but are not yet a major operational
  problem (small network, low incentive).
- Anticipated to become serious if/when LN scales 10-100x.
- Major LN routing nodes are starting to apply heuristic-based
  reputation systems.

## Compared to replacement cycling

- **Replacement cycling**: attacks specific HTLC-timeout settlement
  on chain.
- **Channel jamming**: attacks live channels off chain by exhausting
  resources.

Different layers, different mitigations.

## See also

- [routing/SKILL.md](../routing/SKILL.md)
- [htlcs/SKILL.md](../htlcs/SKILL.md)
- [replacement-cycling/SKILL.md](../replacement-cycling/SKILL.md)
- [pinning-attacks/SKILL.md](../pinning-attacks/SKILL.md)
