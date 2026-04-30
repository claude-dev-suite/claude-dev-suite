---
name: bitcoin-mining-pow
description: |
  Bitcoin Proof of Work: SHA256d on block header, target, nonce
  iteration, hashrate, mining math.
  USE WHEN: explaining mining mechanics, debugging mining software,
  designing mining-related apps.
allowed-tools: Read, Grep, Glob
---

# Proof of Work

Bitcoin's consensus security: miners compete to find a `nonce` such
that `SHA256d(block_header) ≤ target`. The first to find one
broadcasts the block, claiming the subsidy + fees.

## Block header (80 bytes)

```
[4 bytes]   version
[32 bytes]  prev_block hash
[32 bytes]  merkle_root (of all txs)
[4 bytes]   timestamp (unix seconds)
[4 bytes]   bits (compact target encoding)
[4 bytes]   nonce
```

Hash function: `SHA256(SHA256(header))` (SHA256d).

## Target & difficulty

`bits` encodes the target in compact form:
- `bits = 0xMM_NNNNNN` where MM is exponent (3 bytes) and NNNNNN
  is mantissa.
- `target = mantissa × 2^(8*(MM-3))`.

`difficulty = max_target / current_target`. Higher difficulty =
harder.

Difficulty adjusts every **2016 blocks** (~2 weeks):
- If actual time < target time (~2 weeks), difficulty increases.
- If actual time > target time, difficulty decreases.
- Adjustment factor capped at 4x per epoch.

## Hashrate

Number of header hashes per second. As of 2025:
- Network hashrate: ~700-900 EH/s (10^18 H/s).
- Difficulty: ~100T (100,000,000,000,000).
- Per-block expected time: 10 minutes.

## Mining algorithm

```python
def mine_block(header, target):
    while True:
        for nonce in range(2**32):
            header[76:80] = pack('<I', nonce)
            h = sha256(sha256(header))
            if h < target:
                return header
        # Exhausted nonce space; bump extra-nonce in coinbase, redo merkle
        bump_extra_nonce()
        recompute_merkle_root()
```

`extranonce` lives in the coinbase tx scriptSig, allowing many
2^32 nonce-space sweeps per block template.

## Subsidy / Halving

Block reward = subsidy + fees.
Subsidy halves every **210,000 blocks** (~4 years):
- 2009-2012: 50 BTC.
- 2012-2016: 25 BTC.
- 2016-2020: 12.5 BTC.
- 2020-2024: 6.25 BTC.
- 2024-2028: 3.125 BTC.
- 2028-2032: 1.5625 BTC.
- ...

Total supply asymptote: 21 million BTC.

## Mining hardware

- **CPU**: 2009-2010, megahash range.
- **GPU**: 2010-2013, gigahash range.
- **FPGA**: 2011-2013, low gigahash range.
- **ASIC**: 2013-present, terahash to petahash range per device.

ASIC manufacturers: Bitmain (Antminer), MicroBT (Whatsminer),
Canaan (AvalonMiner), Bitfury, others.

## Selfish mining attack

Theoretical attack where a miner with > 25% hashrate withholds
blocks to gain disproportionate share. Mitigated by random network
delays in practice.

## See also

- [difficulty/SKILL.md](../difficulty/SKILL.md)
- [stratum-v1/SKILL.md](../stratum-v1/SKILL.md)
- [stratum-v2/SKILL.md](../stratum-v2/SKILL.md)
- [pool-architectures/SKILL.md](../pool-architectures/SKILL.md)
