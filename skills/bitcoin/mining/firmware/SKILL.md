---
name: bitcoin-mining-firmware
description: |
  ASIC mining firmware: Braiins OS+, Vnish, BUMa, ESP-Miner/AxeOS
  (Bitaxe), stock firmware, custom firmware tradeoffs. Overclocking,
  undervolting, autotuning, efficiency curves.
  USE WHEN: deploying mining firmware, evaluating efficiency vs
  hashrate, choosing custom vs stock.
allowed-tools: Read, Grep, Glob
---

# ASIC Firmware

ASIC manufacturers ship stock firmware (BMMiner, etc.). Custom
firmware (Braiins OS+, Vnish, BUMa) often improves efficiency,
adds features, or enables Stratum V2. Open-source hardware (the
Bitaxe family) instead ships open firmware from the start:
ESP-Miner / AxeOS.

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

## ESP-Miner / AxeOS (Bitaxe)

Firmware for the **Bitaxe** family of fully open-source, single-chip
(or few-chip) ASIC boards. These are real SHA-256 ASICs in the
sub-TH/s to few-TH/s range, not the ESP32 KH/s class below.

Hardware (design files at `github.com/bitaxeorg`, as of September
2026):

| Board | ASIC | Harvested from | Vendor efficiency claim |
|---|---|---|---|
| Max | BM1397 | Antminer S17 | - |
| Ultra | BM1366 | Antminer S19 XP | 0.021 J/GH (21 J/TH) |
| Supra | BM1368 | Antminer S21 | 17.5 J/TH |
| Gamma | BM1370 | Antminer S21 Pro | 15 J/TH |
| Gamma Turbo (GT) | 2x BM1370 | Antminer S21 Pro | - |
| Gamma Hex | 6x BM1370 | Antminer S21 Pro | - |

A single Gamma carries one of the 195 BM1370s in an S21 Pro, so
roughly `234 / 195 ≈ 1.2 TH/s` per board off a 5 V barrel jack (PSU
must sustain >4 A; 25-30 W recommended).

Firmware: **ESP-Miner**, ESP32-S3 firmware whose web UI is called
**AxeOS**, maintained by Open Source Miners United (OSMU) at
`github.com/bitaxeorg/ESP-Miner`. Latest release v2.15.1
(29 August 2026).

- Stratum V1 native, with optional per-pool TLS (`tls_mode`, custom
  CA cert) - so solo pools can be reached over an encrypted socket.
- **Stratum V2** support landed in v2.14.0 (June 2026) and was
  extended in v2.15.0 (August 2026): 8 KiB SV2 frames, per-pool
  "require authentication", fractional SV2 difficulty, pending-share
  display.
- Wi-Fi + browser config; no host computer. REST API at
  `/api/system/info`, `/api/system/asic`, `/api/system/statistics`,
  plus a `/api/ws` log stream.
- Flash via `pip install bitaxetool` or the Bitaxe Web Flasher. Since
  v2.15.0 AxeOS is embedded in `esp-miner.bin` - no separate
  `www.bin` upload.
- Per-board frequency/voltage are user-set; benchmark scripts rather
  than a built-in autotuner are the usual way to find the J/TH knee.

Why it matters: these boards make solo mining a home appliance. On
10 July 2026 a solo miner on Public Pool found block **957,382**
(coinbase tagged `Public-Pool`, single 3.138 BTC payout); it was
widely reported as a Bitaxe.

## BUMa / NerdMiner (ESP32 class)

- Custom firmware for **NerdMiner** (low-power solo-mining device).
- ESP32-based, small hashrate (KH/s range) - the microcontroller
  itself hashes; there is no ASIC.
- Educational / hobby / lottery use. Distinct from the Bitaxe boards
  above, which are ASIC hardware six-plus orders of magnitude faster.
- Related ASIC forks: **NerdQAxe / NerdQAxe+** run a fork of
  ESP-Miner (`shufps/ESP-Miner-NerdQAxePlus`), not NerdMiner
  firmware.

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
- Bitaxe flashed with the wrong board-version image (e.g. a 401
  image on a 6xx Gamma) → wrong voltage/frequency defaults.

## See also

- [pow/SKILL.md](../pow/SKILL.md)
- [stratum-v2/SKILL.md](../stratum-v2/SKILL.md)
- [pool-architectures/SKILL.md](../pool-architectures/SKILL.md)
- [decentralized-pools/SKILL.md](../decentralized-pools/SKILL.md)
