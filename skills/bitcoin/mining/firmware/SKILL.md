---
name: bitcoin-mining-firmware
description: |
  ASIC mining firmware: Braiins OS+, Vnish, BUMa, stock firmware,
  custom firmware tradeoffs. Overclocking, undervolting, autotuning,
  efficiency curves.
  USE WHEN: deploying mining firmware, evaluating efficiency vs
  hashrate, choosing custom vs stock.
allowed-tools: Read, Grep, Glob
---

# ASIC Firmware

ASIC manufacturers ship stock firmware (BMMiner, etc.). Custom
firmware (Braiins OS+, Vnish, BUMa) often improves efficiency,
adds features, or enables Stratum V2.

## Stock firmware

- Bitmain: BMMiner / Antminer firmware.
- MicroBT: Whatsminer firmware.
- Canaan: AvalonMiner firmware.

Pros: works out of box, manufacturer support.
Cons: limited tuning, possibly built-in backdoors / mining for
manufacturer's pool, no SV2.

## Braiins OS+

Open-source firmware by Braiins (Slush Pool team):
- Compatible with: Antminer S9, S17, S19 series, others.
- Adds: Stratum V2, autotuning, dashboard, monitoring.
- Open-source (auditable).
- Free for personal use; pool fee discount with Braiins.

## Vnish (closed-source)

- Popular firmware especially for S19 series.
- Aggressive tuning profiles.
- Closed-source; some controversy about backdoors.
- Paid license for some models.

## BUMa / NerdMiner

- Custom firmware for **NerdMiner** (low-power solo-mining device).
- ESP32-based, small hashrate (KH/s range).
- Educational / hobby use.

## Tuning concepts

### Overclocking
Increase chip frequency above factory spec. Hashrate up,
electricity up, more heat, may shorten ASIC lifespan.

### Undervolting
Lower voltage at same frequency. Electricity down, slight hashrate
loss, longer lifespan.

### Autotuning
Firmware automatically adjusts per-chip parameters to find optimum
J/TH (joules per terahash). Sometimes 10-20% efficiency gain over
stock.

## Common bugs

- Aggressive overclock → hardware errors → rejected shares → less
  income than conservative tune.
- Cooling not matching new heat profile → throttling.
- Pool config left as factory's pool → unintended donations.

## See also

- [pow/SKILL.md](../pow/SKILL.md)
- [stratum-v2/SKILL.md](../stratum-v2/SKILL.md)
- [pool-architectures/SKILL.md](../pool-architectures/SKILL.md)
