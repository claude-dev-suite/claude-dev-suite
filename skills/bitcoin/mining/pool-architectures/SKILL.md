---
name: bitcoin-mining-pool-architectures
description: |
  Mining pool reward schemes: PPS, FPPS, PPLNS, PPS+, Score, prop. Block
  generation queue, share variance, payout cycles. Solo mining vs pooled.
  USE WHEN: comparing pools, designing reward systems, understanding
  miner economics.
allowed-tools: Read, Grep, Glob
---

# Pool Architectures & Reward Schemes

Pools allow many miners to collectively find blocks. Differences are
in how rewards are distributed.

## Reward schemes

### PPS (Pay-Per-Share)

Miner gets fixed payment per accepted share. Pool absorbs all variance:
- Pro: predictable income for miners.
- Con: pool needs cash reserve to cover bad-luck periods.

Fee: typically 4-5% to compensate pool variance risk.

### FPPS (Full Pay-Per-Share)

PPS but miner also receives proportional share of **transaction
fees** beyond just the subsidy.

Most popular scheme as of 2024-2025.

Fee: 2-3%.

### PPLNS (Pay-Per-Last-N-Shares)

Reward = block_reward × (your_shares_in_last_N / total_shares_in_last_N).

- Pool doesn't pay until block found.
- Miners experience variance directly.
- Discourages pool-hopping (you must mine consistently to be in
  the N window).

Fee: 1-2% (lower because pool doesn't bear variance risk).

### PPS+

PPS for subsidy + PPLNS for fees. Hybrid.

### Score (deprecated / niche)

Older scheme that decayed share scores over time. Largely replaced
by PPLNS.

### Proportional

Reward = your_shares / total_shares_this_round × block_reward.

Vulnerable to pool-hopping; rarely used.

## Pool block-finding

Pool's core function:
1. Construct block templates.
2. Distribute work to miners (Stratum V1 or V2).
3. Verify share submissions.
4. When a share is also a block (≤ network target), submit to network.
5. Distribute rewards per scheme.

## Variance considerations

A solo miner finding a block:
- Expected time = network_time × (network_hashrate / your_hashrate).
- For 100 TH/s on a ~980 EH/s network (September 2026):
  ~68,000 days ≈ 186 years.

Pooled:
- Get reward proportional to your hashrate share, daily/hourly.
- Variance reduced.

## Pool centralization risks

- **51% attack**: top pools by hashrate can theoretically reorg.
- **Censorship**: pools have OFAC-compliance pressure.
- **Selfish mining**: pool with > 25% hashrate could selfish-mine.

Mitigations:
- Stratum V2 (miners choose own tx).
- Decentralized pools (P2Pool, OCEAN DATUM).
- Solo mining (CKPool, Public-Pool).

## Major pools (as of September 2026)

Shares below are blocks found over the trailing 3 months per
mempool.space, sampled 2026-09-15, on a network running ~980 EH/s.

- **Foundry USA** — ~25%; largest by hashrate.
- **AntPool** (Bitmain) — ~19%; second.
- **F2Pool** — ~15%; historical leader.
- **SpiderPool** — ~9%; fourth-largest.
- **ViaBTC** — ~9%.
- **MARA Pool** — ~5%.
- **SECPOOL** — ~4%.
- **Luxor** — ~3%.
- **OCEAN** — ~3%; ~21.2 EH/s (ocean.xyz, 2026-09-15). Non-custodial
  TIDES payouts; miners building their own templates with DATUM get a
  50% pool-fee discount.
- **Binance Pool** — ~2%.
- **Braiins Pool** (formerly Slush Pool) — ~2%; SV2-capable.
- **DMND** (DEMAND) — SV2-native pool; mined block 955,318
  (2026-06-25), which DMND states is the first block built via Stratum
  V2 job declaration (dmnd.work, 2026). Negligible network share so
  far — one block in the trailing year as of 2026-09-15.

## See also

- [pow/SKILL.md](../pow/SKILL.md)
- [stratum-v1/SKILL.md](../stratum-v1/SKILL.md)
- [stratum-v2/SKILL.md](../stratum-v2/SKILL.md)
- [decentralized-pools/SKILL.md](../decentralized-pools/SKILL.md)
