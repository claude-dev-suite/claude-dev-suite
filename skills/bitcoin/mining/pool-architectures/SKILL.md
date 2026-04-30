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
- For 100 TH/s on 800 EH/s network: 8000 days = 22 years.

Pooled:
- Get reward proportional to your hashrate share, daily/hourly.
- Variance reduced.

## Pool centralization risks

- **51% attack**: top pools by hashrate can theoretically reorg.
- **Censorship**: pools have OFAC-compliance pressure.
- **Selfish mining**: pool with > 25% hashrate could selfish-mine.

Mitigations:
- Stratum V2 (miners choose own tx).
- Decentralized pools (P2Pool, Ocean Datum).
- Solo mining (CKPool, Public-Pool).

## Major pools (2025)

- **Foundry USA** — largest by hashrate.
- **AntPool** (Bitmain) — second.
- **F2Pool** — historical leader.
- **Braiins Pool** (formerly Slush Pool) — SV2-capable.
- **ViaBTC**, **MARA Pool**, **Luxor**.
- **Ocean** — non-custodial; decentralized template via Datum.

## See also

- [pow/SKILL.md](../pow/SKILL.md)
- [stratum-v1/SKILL.md](../stratum-v1/SKILL.md)
- [stratum-v2/SKILL.md](../stratum-v2/SKILL.md)
- [decentralized-pools/SKILL.md](../decentralized-pools/SKILL.md)
