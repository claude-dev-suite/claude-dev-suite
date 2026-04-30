---
name: bitcoin-fee-estimation
description: |
  Fee estimation strategies: local mempool-based (estimatesmartfee),
  external APIs (mempool.space, BlockCypher), bitcoind's smart-fee
  algorithm, replacement bidding, fee-rate floor (incremental relay).
  USE WHEN: choosing a fee for a new tx, evaluating fee-bump amounts,
  designing fee policy for a service.
allowed-tools: Read, Grep, Glob
---

# Fee Estimation

Bitcoin tx fees are auctioned per-block. Wallets need to estimate the
fee rate (sat/vB) needed to confirm within `n` blocks.

## Bitcoin Core's `estimatesmartfee`

```bash
bitcoin-cli estimatesmartfee 6 ECONOMICAL
```
Returns `{"feerate": 0.00010000, "blocks": 6}` (BTC/kvB → 10 sat/vB).

### Algorithm (simplified)

1. Track every tx that enters mempool with its first-seen fee rate.
2. Track which fee rates resulted in confirmation within `n` blocks.
3. For target `n`: find lowest fee rate that successfully confirmed
   ≥ X% of historical txs within `n` blocks.

Modes: `ECONOMICAL` (less aggressive), `CONSERVATIVE` (more buffer).

Limitations:
- Cold-start: needs ~3 hours of running for reliable estimates.
- Doesn't see network-wide mempool, only local.
- Slow to react to fee spikes (uses historical data).

## Mempool-based estimation

Sample `getrawmempool true`:
```python
mempool = bitcoind.getrawmempool(verbose=True)
# build histogram of (fee_rate, vsize)
# find fee rate where cumulative vsize from top fits in 1 MB block
target_rate_for_next_block = histogram.percentile(at_vsize=1_000_000)
```

This reflects **current** mempool state, not historical. Better
during fee spikes; volatile during quiet periods.

## External services

- **mempool.space API**: `GET /api/v1/fees/recommended` →
  `{ fastestFee, halfHourFee, hourFee, economyFee, minimumFee }`.
- **mempool.space mempool blocks API**: `/api/v1/fees/mempool-blocks`
  shows projected next ~10 blocks with median fee rate per block.
- **BlockCypher**, **Esplora** — similar.

External APIs offer real-time mempool view; trade-off is trust and
availability.

## Floor: incremental relay fee

```
incrementalrelayfee = 1 sat/vB (default)
```

Min fee rate for a tx to be relayed. RBF replacement must add at least
this much per added vbyte beyond the original.

## Smart-fee + smart-bump pattern

```
fee_rate = max(local_estimate(target=N),
               external_api(target=N))
broadcast(tx, fee_rate)
sleep(check_interval)
if not confirmed:
    new_rate = max(current_market_rate * bump_factor,
                   fee_rate + incrementalrelayfee + buffer)
    rbf_replace(tx, new_rate)
```

`bump_factor` typically 1.5x for proactive bumps.

## Fee floor for relay vs mining

- **Relay**: 1 sat/vB minimum (mempool admit).
- **Mining**: miners include highest-fee txs first, no theoretical
  floor (some pools mine 1 sat/vB; others have policies).
- **Compact fee floor**: even at near-empty mempool, miners include
  zero-fee txs only via private submission (mempool.space accelerator).

## Special cases

### Lightning anchor / commitment

Pre-signed commitment tx has fixed fee at signing time. To bump:
- Spend anchor output with high-fee child (CPFP).
- Effective fee rate = (parent_fee + child_fee) / (parent_vsize +
  child_vsize).

### Mempool eviction

Bitcoin Core evicts tx with lowest fee when mempool is full
(`maxmempool=300MB` default). If your tx is evicted:
- Re-broadcast with same fee → may be re-rejected.
- Re-broadcast with bumped fee → admitted.

## Per-block fee dynamics

- Fees follow **block subsidy halvings** loosely (more competition
  for fees as subsidy declines).
- Daily seasonality: fees lower on weekends, higher during US
  business hours.
- Event-driven spikes: ordinals waves (2023-2024), runes launch
  (April 2024) caused 1000+ sat/vB peaks.

## Common bugs

- Using `estimatesmartfee 1` (next-block) on a fresh node → returns
  -1 (insufficient history) → tx with no fee.
- Hard-coding sat/vB → fails when fees spike.
- Not accounting for mempool min: on rejection from mempool, your tx
  is silently lost; check `testmempoolaccept` first.
- Fee bumping without checking BIP125 rules → replacement rejected.

## See also

- [coin-selection/SKILL.md](../coin-selection/SKILL.md)
- [rbf-cpfp/SKILL.md](../rbf-cpfp/SKILL.md)
- [../../protocol/transactions/quick-ref/rbf-cpfp.md](../../protocol/transactions/quick-ref/rbf-cpfp.md)
- [../../infrastructure/mempool-space/SKILL.md](../../infrastructure/mempool-space/SKILL.md)
