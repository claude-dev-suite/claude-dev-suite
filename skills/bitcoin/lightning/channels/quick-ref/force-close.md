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

## Anchor CPFP (`option_anchors`, bits 22/23)

- Anchor outputs are 330 sats each, spendable immediately by their
  owner.
- If commitment fee rate is too low at broadcast time, spend your
  anchor with a high-fee child to CPFP.
- `to_remote` and both HTLC output types carry a 1-block CSV (and
  `to_local` its `to_self_delay`), so the child must be funded from
  an external on-chain UTXO.
- Use `submitpackage` (BIP331) for atomic admission.

## CPFP on `zero_fee_commitments` channels (bits 40/41)

For the channel type merged 2026-05-04 (lightning/bolts PR #1228) the
sequence differs:
- The commitment is a v3/TRUC tx paying no fee, so it will not confirm
  on its own — CPFP is mandatory, not a contingency.
- There is one unkeyed `shared_anchor` (P2A, 0-240 sats) rather than
  two keyed 330-sat anchors, and anyone can spend it with an empty
  witness.
- The 1-block CSV is gone, so you may instead CPFP from your own
  `to_remote` / HTLC outputs on a remote commitment — no external
  wallet UTXO required.
- TRUC allows at most one unconfirmed descendant and permits sibling
  eviction, so a counterparty cannot pin the package with a low-fee
  child.
- 2nd-stage HTLC txs are also 0-fee and are bumped by adding inputs,
  not by an anchor.

## Replacement cycling resistance

Pre-TRUC: a malicious counterparty could pin your HTLC-timeout by
publishing a low-fee descendant on the same anchor / HTLC output,
exploiting BIP125 rule 5.

Post-TRUC v3 + ephemeral anchors:
- v3 commitment ≤ 1 unconfirmed descendant.
- Sibling eviction allows replacing bad child.
- Pinning surface eliminated.

## On-chain cost

Force-close cost = (commitment tx vsize × effective fee rate) +
(per-HTLC 2nd-stage tx fees) + (CPFP child fees if needed).

Sizes come from BOLT 3's expected weights, so they are stable:
- `option_anchors` commitment, 0 HTLCs: 1124 WU = 281 vB.
- Each untrimmed HTLC adds 172 WU = 43 vB to the commitment.
- HTLC-timeout 666 WU ≈ 167 vB, HTLC-success 706 WU ≈ 177 vB
  (`option_anchors`; both are 0-fee, so that cost lands on the bump).

The fee *rate* is the volatile input, so price it as a range rather
than one dated figure. A 281 vB, 0-HTLC `option_anchors` commitment:

| fee rate   | commitment fee |
|------------|----------------|
| 1 sat/vB   | ~281 sats      |
| 10 sat/vB  | ~2,810 sats    |
| 50 sat/vB  | ~14,050 sats   |
| 200 sat/vB | ~56,200 sats   |

For scale: mempool.space's recommended fees on 2026-09-15 were
2 sat/vB for the fastest tier and 1 sat/vB for every slower tier, so
today the top row of that table is the realistic one — but the
point of the table is that this input moves.

On a `zero_fee_commitments` channel the commitment contributes no fee
of its own; the cost is the target *package* fee rate applied to
commitment vsize plus child vsize, and the child can be funded from
your own channel outputs.

## Common bugs

- Force-closing right before HTLC CLTV expiry → not enough time to
  resolve.
- Insufficient on-chain UTXOs to anchor CPFP → commitment stuck at
  too-low fee rate. Applies to `option_anchors` only: on a
  `zero_fee_commitments` channel the child can spend your own
  unencumbered channel outputs.
- Assuming a `zero_fee_commitments` commitment will confirm on its
  own → it pays no fee; without a CPFP child it simply sits.
- Treating to_self_delay as elapsed blocks since broadcast (not
  confirmation) → premature sweep tx rejected.
- Missing watchtower while offline → cheating goes unrebutted.

## See also

- [state-machine.md](state-machine.md)
- [commitment-tx.md](commitment-tx.md)
- [../watchtowers/SKILL.md](../../watchtowers/SKILL.md)
- [../replacement-cycling/SKILL.md](../../replacement-cycling/SKILL.md)
