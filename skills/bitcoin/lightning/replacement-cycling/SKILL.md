---
name: lightning-replacement-cycling
description: |
  Replacement cycling attack on Lightning (Riard 2023): exploits BIP125
  rule 5 to indefinitely delay an honest HTLC-timeout, costing the
  victim. Mitigated by TRUC v3 + ephemeral anchors.
  USE WHEN: auditing LN security posture, evaluating fee-bumping
  strategies, understanding why TRUC was activated.
allowed-tools: Read, Grep, Glob
---

# Replacement Cycling Attack

Disclosed by Antoine Riard, Oct 2023. A novel mempool-policy attack
against Lightning where an attacker repeatedly cycles RBF-replacing
their own malicious child tx, forcing your honest fee-bumping
attempts to incur progressively higher costs while their tx sits in
mempool, eventually causing your legitimate sweep tx (HTLC-timeout)
to miss its CLTV deadline.

## The setup

You're routing a payment Alice → You → Bob:
- You have an outgoing HTLC to Bob (Bob owes you).
- You have an incoming HTLC from Alice (you owe Alice).
- Alice's HTLC has earlier CLTV; Bob's HTLC has later.

If Bob force-closes and you can't claim his outgoing HTLC before
your incoming HTLC times out → you lose the payment forwarded to Bob
but still owe Alice.

## The exploit

Attacker (Bob) attempts:

1. Bob force-closes the channel; HTLC output appears on chain.
2. You publish HTLC-timeout tx (pre-signed) to claim back the funds
   after CLTV.
3. Bob publishes a competing HTLC-success tx using a (potentially
   recently learned) preimage, with lower fee → your tx and his tx
   both spend the same output.
4. You bump your tx via RBF.
5. Bob bumps **his** tx slightly by replacing his own with a marginally
   higher-fee version.
6. By BIP125 rule 5, each replacement must pay extra per added vbyte.
7. Bob repeats step 5, marginally bumping each time.
8. Each Bob's bump is cheap; your bump becomes more expensive each
   round (you must beat his absolute fee).
9. Eventually you stop bumping (resource exhaustion), Bob's tx
   confirms with the preimage. He's revealed it now to you, but
   you've **already** paid Alice's HTLC (you trusted the chain to
   resolve before).

The ATTACK COST to Bob is small (he keeps replacing his own tx with
incremental bumps); the COST TO YOU includes both the failed timeout
fees and the lost payment to Alice.

## Why BIP125 enabled it

BIP125 rule 5: replacement tx must pay extra `incrementalrelayfee ×
size_increase` beyond the original. But this allows an attacker who
controls a competing tx to **force you** to keep bumping ahead of
them, while their own bumps are tiny.

## Mitigation 1: TRUC v3 (BIP431)

v3 transactions limit:
- ≤ 1 unconfirmed ancestor.
- ≤ 1 unconfirmed descendant.
- Sibling eviction allowed (no need to pay for sibling's bandwidth).

This breaks the cycling pattern: attacker can't keep stacking
replacements with tiny bumps; sibling eviction lets honest party
replace cheaply.

## Mitigation 2: Ephemeral anchors

Anchor with `value=0` and trivially-spendable script. Must be spent
in the same package as parent. Eliminates pinning surface (anchor
isn't independently spendable).

## Mitigation 3: Increase pre-signed fee buffer

Pre-sign HTLC-timeout txs with a generous fee. If mempool fee rates
spike beyond expectations, you have headroom.

## Mitigation 4: Watchtower + witness monitoring

Watchtowers monitor not just for cheating commitments but also for
HTLC pinning attempts; can attempt punitive replacement.

## Lightning impact

- LDK, LND, CLN, Eclair shipped TRUC v3 + ephemeral anchor support
  in the channels they create after BIP431 activation (Sept 2024).
- Legacy anchor channels remain vulnerable in theory until they're
  closed and reopened.

## Status

- BIP431 + BIP331 active in mempool policy since Bitcoin Core 28.0.
- Deployed by major LN impls in their post-28.0 release cycles.
- Mitigations are at **mempool policy level**, not consensus.

## Common confusions

- Replacement cycling is NOT the same as **pinning** (which is about
  blocking your tx from confirming via large descendants). They
  share the underlying BIP125 mechanic but exploit it differently.
- Replacement cycling is NOT a flaw in Lightning's fundamental
  protocol; it's a flaw in pre-TRUC mempool policy that Lightning
  was relying on.

## See also

- [channel-jamming/SKILL.md](../channel-jamming/SKILL.md)
- [pinning-attacks/SKILL.md](../pinning-attacks/SKILL.md)
- [../../protocol/transactions/quick-ref/v3-truc.md](../../protocol/transactions/quick-ref/v3-truc.md)
- [../../protocol/package-relay/SKILL.md](../../protocol/package-relay/SKILL.md)
