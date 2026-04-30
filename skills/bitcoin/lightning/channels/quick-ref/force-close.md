# Force-close (unilateral close) flow

When cooperation isn't possible (peer offline, malfunctioning, or
adversarial), one side broadcasts the latest commitment tx.

## Conditions triggering force-close

- HTLC about to expire and counterparty unresponsive.
- Watchdog detects stuck channel.
- Counterparty broadcasts an old commitment (cheating attempt).
- Manual operator action.

## Sequence (honest commitment)

```
T=0:        you broadcast latest commitment tx
T~10min:    confirmed in block
T+0..N:     anchor CPFP if needed (commitment fee was low)
T + to_self_delay (your CSV):  you can claim to_local
T + per-HTLC time:    HTLC outputs resolved one by one
```

Typical `to_self_delay`: 144 blocks (1 day) up to 2016 (2 weeks).

## HTLC resolution

For each HTLC output on the commitment:

### HTLC you offered (outgoing)
- If counterparty has preimage:
  - They reveal preimage and claim via HTLC-success tx (you may
    learn preimage from chain → upstream success).
- If counterparty doesn't claim:
  - After CLTV expires, you broadcast HTLC-timeout tx (pre-signed).
  - After HTLC-timeout's CSV, claim those funds.

### HTLC you received (incoming)
- If you have preimage:
  - Broadcast HTLC-success tx (pre-signed) immediately revealing
    preimage.
  - After CSV, claim those funds.
- If you don't have preimage:
  - Counterparty broadcasts HTLC-timeout after CLTV → reclaims
    those funds.

## Cheating detection (revocation path)

If counterparty broadcasts an OLD commitment:
- You hold the revocation secret for that commitment.
- Within `to_self_delay` blocks of confirmation, broadcast
  **justice tx** that claims:
  - Their `to_local` (using revocation key).
  - Each HTLC output (also using revocation).
- All channel funds become yours.

Watchtower services automate this monitoring + justice broadcast.

## Anchor CPFP

Modern anchor commitment with `option_anchors_zero_fee_htlc_tx`:
- Anchor outputs are 330 sats each, spendable immediately by their
  owner.
- If commitment fee rate is too low at broadcast time, spend your
  anchor with a high-fee child to CPFP.
- Use `submitpackage` (BIP331) for atomic admission.

## Replacement cycling resistance

Pre-TRUC: a malicious counterparty could pin your HTLC-timeout by
publishing a low-fee descendant on the same anchor / HTLC output,
exploiting BIP125 rule 5.

Post-TRUC v3 + ephemeral anchors:
- v3 commitment ≤ 1 unconfirmed descendant.
- Sibling eviction allows replacing bad child.
- Pinning surface eliminated.

## On-chain cost

Force-close cost = (commitment tx vsize × current fee rate) +
(per-HTLC 2nd-stage tx fees) + (anchor CPFP fees if needed).

For a channel with 0 HTLCs: ~150 vB commitment ≈ 7500 sats at 50
sat/vB. Plus anchor CPFP ~5000 sats. Total ~$5-15 USD as of 2025.

For a channel with N HTLCs: add ~165 vB per HTLC 2nd-stage tx.

## Common bugs

- Force-closing right before HTLC CLTV expiry → not enough time to
  resolve.
- Insufficient on-chain UTXOs to anchor CPFP → commitment stuck at
  too-low fee rate.
- Treating to_self_delay as elapsed blocks since broadcast (not
  confirmation) → premature sweep tx rejected.
- Missing watchtower while offline → cheating goes unrebutted.

## See also

- [state-machine.md](state-machine.md)
- [commitment-tx.md](commitment-tx.md)
- [../watchtowers/SKILL.md](../../watchtowers/SKILL.md)
- [../replacement-cycling/SKILL.md](../../replacement-cycling/SKILL.md)
