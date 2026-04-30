---
name: bitcoin-mining-difficulty
description: |
  Difficulty adjustment algorithm: 2016-block re-target window, max 4x
  factor, time-warp considerations, real-world hashrate dynamics.
  USE WHEN: predicting next adjustment, understanding hashrate/
  difficulty cycles, building mining analytics.
allowed-tools: Read, Grep, Glob
---

# Difficulty Adjustment

Bitcoin re-targets the difficulty every **2016 blocks** to maintain
~10-minute average block time despite hashrate fluctuations.

## Algorithm

```python
def next_difficulty(current_difficulty, actual_time, expected_time):
    # actual_time = sum of block_n.timestamp - block_(n-2015).timestamp
    # expected_time = 2016 * 10 * 60 = 1,209,600 seconds
    factor = expected_time / actual_time
    factor = clamp(factor, 0.25, 4.0)   # 4x max change per epoch
    return current_difficulty * factor
```

Implemented in `pow.cpp:CalculateNextWorkRequired()` in Bitcoin Core.

## Time-warp protection

Sequential blocks must have:
- `block.timestamp > MTP(last 11 blocks)`.
- `block.timestamp ≤ network_time + 2 hours` (avoids future-dated
  blocks).

These rules limit miner manipulation of timestamps to game the
adjustment.

## Real-world dynamics

- China mining ban (May 2021): hashrate dropped ~50% over weeks;
  difficulty took ~3 weeks to drop accordingly. Miners enjoyed
  high-revenue period during the lag.
- Halvings cause hashrate dips that recover over months.
- Seasonal fluctuations (China's wet season → cheaper hydropower
  → hashrate spikes).

## Common adjustments

Typical adjustments: 0.5% to 5% per epoch in normal conditions.
Large adjustments (10%+) signal major hashrate event (region ban,
ASIC manufacturing surge, etc.).

## Difficulty number vs hashrate

```
hashrate_estimate = difficulty * 2^32 / 600   # H/s
```

Where `2^32` = full nonce space probed for one solution at expected
target, and 600 seconds = average block time.

## Common bugs

- Computing actual_time incorrectly (off-by-one on block count).
- Forgetting the 4x cap → catastrophic divergence.
- Using block timestamps directly without MTP for time-locks.

## See also

- [pow/SKILL.md](../pow/SKILL.md)
- [stratum-v2/SKILL.md](../stratum-v2/SKILL.md)
