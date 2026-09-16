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

Number of header hashes per second. Per-block expected time: 10 minutes
(protocol target, held by the retarget).

The figures below are a dated snapshot - they age fast, re-check a live
source before quoting them.

As of 15 September 2026 (mempool.space mining API):
- Difficulty: ~127.45T (127,450,789,715,843), set at the retarget of
  5 September 2026 (block 965,664, +1.31%).
- Network hashrate: ~0.9-1.0 ZH/s (10^21 H/s). Monthly means stayed in
  the 900-940 EH/s band through Q3 2026; the spot reading is a rolling
  estimate and wandered from 967 to 981 EH/s within 15 September 2026.
- All-time highs, both still unbeaten: daily-average hashrate ~1.31 ZH/s
  on 25 October 2025; difficulty 155.97T on 29 October 2025
  (block 921,312).

Live sources: `getdifficulty` / `getnetworkhashps` RPC, or
`https://mempool.space/api/v1/mining/hashrate/1m`.

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

## Header search space (nonce rolling)

`2^32` is only ~4.3 billion hashes; a 200 TH/s ASIC sweeps the whole
nonce field in ~21 microseconds. Miners therefore roll four fields,
cheapest first:

- `nonce` - 32 bits, header-only.
- `nVersion` reserved bits - 16 bits (BIP 320) or 24 bits (BIP 323),
  header-only.
- `timestamp` - one increment per second, and must stay inside the
  consensus bounds (> median-time-past of the last 11 blocks,
  <= network-adjusted time + 2h).
- `extranonce` in the coinbase scriptSig - unbounded, but every bump
  rebuilds the coinbase and the merkle root, so the controller and not
  the hash core does the work.

Only the first three are *headers-only* mining: the device mutates the
80-byte header without touching transactions or merkle trees.

Standardization of the nVersion slice:

- **BIP 310** (Braiins, Informational, Draft since 2018) defines the
  Stratum `mining.configure` negotiation and with it the
  `version-rolling` extension, through which a pool advertises the
  version mask a miner may roll.
- **BIP 320** reserves nVersion bits 13-28 (mask `0xe0001fff`, 16 bits)
  for general use and removes them from BIP8/BIP9 signaling.
- **BIP 323** (Matt Corallo, Draft, merged into the BIPs repo
  12 May 2026) replaces BIP 320 and reserves bits 5-28 (mask
  `0xe000001f`, 24 bits). 16 bits proved too few; some devices had
  started taking ~7 bits out of `nTime` instead, which distorts block
  timestamps. Future soft forks SHOULD NOT signal on bits 5-28.

Core support, as of September 2026:

- Core never shipped BIP 320's 16-bit mask.
- PR #34779 ignores bits 5-28 for BIP9 signaling and for
  unknown-soft-fork warnings. Merged 3 June 2026, milestoned v32.0.
- Newest release line is 31.1 (8 July 2026); 32.0 has not shipped, so
  released nodes still warn on blocks that set those bits.

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
