---
name: membrane-economics-edi
description: RO/EDI economics (SEC, LCOW, lifecycle decision matrix), Electrodeionization deep-dive (cell pair geometry, FCE feed metric, KPIs, 8 failure modes), EDI vs Mixed-Bed DI sizing economics, pharmaceutical UPW/WFI regulatory context (USP/Ph. Eur./21 CFR Part 11/EU Annex 11), produced-water regulatory context (WHO/ISO 16075/EN 12952-12/SEMI F63). Use for energy benchmarks, cost modelling, EDI design/diagnostics, and regulatory citation.
user-invocable: false
---

# Membrane Economics, Energy & EDI Deep Dive

Two-part reference. Part 1 covers SEC/LCOW/lifecycle. Part 2 covers EDI process, KPIs, failure modes, and regulatory context for produced water and pharmaceutical UPW.

Convention markers:
- `⚠️` — likely bug or incorrect assumption in calling code
- `💡` — enhancement opportunity (new alert, new field, new module)

---

# PART 1 — Energy & Economics

## §1 — Specific Energy Consumption (SEC)

**Operator-facing formula:**
```
SEC = (P_HPP − P_ERD_recovered) / Q_permeate          [kWh/m³]
```
where `P_HPP` = high-pressure-pump draw (kW), `P_ERD_recovered` = power recovered by ERD (kW), `Q_permeate` in m³/h. For brackish/tertiary systems without ERD the second term is zero.

**Engineering-grade form:**
```
SEC = ΔP_feed / (3600 · η_pump · R) − (1 − R) · ΔP_brine · η_ERD / (3600 · R)
```
with R = recovery, ΔP in bar.

### 1.1 Benchmarks by source water (verified 2025–2026)

| Feed type | TDS | Typical SEC | Best-in-class | Source |
|---|---|---|---|---|
| SWRO (open ocean) | ~35 000 mg/L | 2.5–4.0 kWh/m³ | **1.794 kWh/m³** Danfoss DESALRO 2.0 record, Pozo Izquierdo, Gran Canaria, Feb 2025 | Danfoss press release / Guinness |
| Modern large SWRO | 35 000 mg/L | 2.0–2.8 kWh/m³ | Previous record 2.27 kWh/m³ (SWCC, KSA) | Danfoss |
| BWRO industrial | 1 000–10 000 mg/L | 0.5–1.5 kWh/m³ | 0.5–0.8 with ERD + optimal recovery | ScienceDirect S004896972402919X |
| Tertiary reuse RO | < 2 000 mg/L | 0.5–1.5 kWh/m³ | — | EPA WaterReuse |

### 1.2 Thermodynamic minimum

- **≈ 1.06 kWh/m³** for SWRO at R = 0.5, T = 25 °C, 35 g/L TDS
- Derived from Gibbs free energy of separation with Spiegler-Kedem reversible-process framework
- Theoretical minimum at infinite dilution: ≈ 0.78 kWh/m³

Sources: *Journal of Chemical Education* 2021 (doi:10.1021/acs.jchemed.0c01194); Wang et al., *Desalination* 2016 (S001191641630087X "Thermodynamic perspective for SEC of seawater desalination"); US-DOE *Seawater Desalination Bandwidth Study* 2017.

⚠️ The "Stenzel" attribution sometimes seen on the open web for the 1.06 figure is **not confirmed**; cite the Spiegler-Kedem / Gibbs derivation instead.

### 1.3 ERD comparison

| ERD type | Peak η | Field η | Notes |
|---|---|---|---|
| Pelton wheel | 80–87 % | 78–85 % | Older centrifugal recovery; hydraulic → mechanical → hydraulic |
| Calder DWEER (isobaric dual-work) | **98 %** | 93–96 % | Licensed by Calder AG |
| Energy Recovery PX (rotary pressure exchanger) | **95–98 %** | 93–96.4 % | Industry standard for large SWRO |

ERD payback rule of thumb: < 2 years for plants > 1 000 m³/d at industrial electricity tariffs.

---

## §2 — LCOW (Levelized Cost of Water)

```
LCOW = (CAPEX_annualized + OPEX_annual) / Q_produced_annual
CRF  = i·(1+i)^n / ((1+i)^n − 1)            # capital recovery factor
```

### 2.1 Component breakdown — SWRO

| Component | Share |
|---|---|
| CAPEX amortized | 40–50 % |
| Energy | 30–40 % (grid-cost dependent) |
| Chemicals + cleaning | 5–10 % |
| Membrane replacement | 5–10 % |
| Labor + O&M | 10–15 % |

### 2.2 LCOW ranges (verified 2024–2026)

| Plant class | LCOW (USD/m³) | Source |
|---|---|---|
| Large SWRO (> 50 000 m³/d, excl. intake/outfall) | $0.53–$1.58 | Advisian |
| Utility-scale SWRO with high-solar 2026 forecast | $0.45–$0.70 | Energy-solutions.co |
| Small-island SWRO | $1.50–$3.00 | IDA Yearbook / Advisian |
| BWRO industrial | $0.20–$0.50 | Foreverpureplace |

### 2.3 Sensitivity ranking

1. Electricity unit price
2. Membrane lifespan & replacement rate
3. Recovery rate (R)
4. Plant capacity factor (uptime)
5. Discount rate / WACC for CAPEX amortization

Sources: Advisian *Cost of Desalination*; ScienceDirect S2213138823000577.

---

## §3 — Operational KPIs (beyond instantaneous calculations)

| KPI | Healthy | Stressed | Action |
|---|---|---|---|
| Membrane life SWRO | 5–7 yr (8–10 best) | 3–5 yr | Review pretreatment |
| Membrane life BWRO | 7–10 yr | 2–3 yr | Antiscalant + CIP review |
| CIP frequency | 1–2/yr | 4–6/yr | Diagnose foulant |
| CIP frequency critical | > 6/yr | — | Replace lead vessel / re-engineer |
| Availability | ≥ 95 % | 90–95 % | Train rotation / redundancy |
| NPF baseline drift (lifetime) | 5–10 %/yr | 15 %+/yr | Investigate compaction vs fouling |
| NSP baseline drift (lifetime) | 10–20 % | > 25 % | Approach replacement |

Sources: Aqualitek SWRO maintenance guide; FilmTec/DuPont Form 45-D01911 *Exceptional Membrane Life*; Pumps & Systems *Life of an RO Membrane*.

---

## §4 — Lifecycle Decision Matrix

Signature → action mapping that turns trends into operational decisions:

| Observation | Likely cause | Reversibility | Action | Rationale |
|---|---|---|---|---|
| NPF −15 % in 30 d, ΔPn +20 % | Particulate / biofouling | Reversible | CIP (alkaline + biocide) | Standard recovery |
| NPF −20 % over 3 yr, ΔPn stable | Compaction | Irreversible | Tolerate or schedule replacement | No CIP benefit |
| NSP +50 % sudden | Mechanical integrity loss | Localised | Probe sweep; replace lead element | Acute defect |
| NSP +30 % over 2 yr | Cumulative oxidation | Irreversible | Replace lead vessel set; audit RedOx | Wear pattern |
| ΔPn rapid stage 2 only | Stage-2 scaling | Treatable | Antiscalant review + acid CIP | Concentration-polarization location |
| NPF + NSP both down | Severe organic fouling | Often reversible | Hot CIP, then biocide | Combined permeability + selectivity hit |

💡 A `lifecycle_advisor` module consuming this table + cumulative-exposure counters + CIP history → enum recommendation `{TOLERATE, SCHEDULE_CIP, IMMEDIATE_CIP, REPLACE_LEAD, REPLACE_VESSEL_SET}` is more valuable than a single-snapshot alarm.

---

# PART 2 — EDI Deep Dive

## §5 — EDI Process Fundamentals

### 5.1 Cell geometry

Repeating "cell pair" = one **dilute (D)** compartment + one **concentrate (C)** compartment, bounded by alternating cation- and anion-exchange membranes. Electrode compartments at stack ends apply DC field.

Ions in D migrate through membranes into C; dilute stream is product.

### 5.2 In-situ regeneration

At elevated DC voltage, water splits at the bipolar interface of the resin bed in D:
```
H₂O → H⁺ + OH⁻
```
- H⁺ regenerates the cation resin
- OH⁻ regenerates the anion resin

No NaOH/HCl is needed → no hazardous regenerant waste. This is the central advantage over Mixed-Bed DI.

### 5.3 Why EDI lives downstream of RO

- Feed must be ≤ ~40 µS/cm FCE
- Weak acids (CO₂, SiO₂) load the stack when ionized internally
- Hardness > 1 ppm CaCO₃ causes concentrate scaling
- Free chlorine > 0.02 ppm destroys resin permanently

### 5.4 Verified feed envelope (Ionpure LX series)

| Parameter | Limit | Notes |
|---|---|---|
| Feed conductivity (FCE basis) | **< 40 µS/cm** | Stack-dependent 25–43 µS/cm |
| Total hardness (as CaCO₃) | **< 1.0 ppm** | Hard limit; risk = concentrate scaling |
| TOC | < 0.5 ppm | Anion-resin fouling above |
| Fe / Mn | < 0.01 ppm each | Irreversible colloidal fouling |
| Total CO₂ | < 5 ppm typical | Loads via FCE; degas if higher |
| SiO₂ | < 1.0 ppm Ionpure LX; < 0.5 ppm preferred | Polymerization risk |
| Total chlorine | **< 0.02 ppm** (target 0) | Destroys resin |
| Temperature | 5–45 °C standard; 60 °C HWS modules | HWS = hot-water-sanitizable |
| pH | 4–11 | Outside → membrane integrity loss |
| Inlet pressure | ≤ 7 bar (100 psi) | Mechanical limit |

### 5.5 Recommended `EDIDataPoint` fields

Required for computing FCE + full diagnostics:
- `feed_conductivity_uS_cm: float`
- `feed_co2_ppm: float`
- `feed_sio2_ppm: float`
- `feed_temperature_C: float`
- `product_conductivity_uS_cm: float` (or `product_resistivity_MOhm_cm`)
- `concentrate_conductivity_uS_cm: float`
- `feed_flow_m3h: float`
- `product_flow_m3h: float`
- `concentrate_flow_m3h: float`
- `stack_voltage_V: float`
- `stack_current_A: float`
- `cell_pair_count: int` (stack-config metadata)
- Optional: `feed_hardness_ppm`, `feed_chlorine_ppm`

Sources: SnowPure *Electropure OEM Manual v3.5.0*; DuPont EDI-310 Module Manual (45-D01915); Suez E-Cell.

---

## §6 — EDI KPIs and Formulas

### 6.1 Conductivity removal
```
η_κ = (κ_in − κ_out) / κ_in · 100        [%]
```

### 6.2 Product resistivity
```
ρ = 1 / κ
```
Theoretical max **18.18 MΩ·cm @ 25 °C** (pure-water self-ionization). Industrial-grade EDI: ≥ 16 MΩ·cm; pharma UPW polish: 17–18.2 MΩ·cm.

### 6.3 Water utilization (recovery)
```
R = Q_product / Q_feed · 100
```
Typical 90–95 % for industrial EDI.

### 6.4 Reject ratio
```
RR = Q_concentrate / Q_feed
```
Typically 5–10 %.

### 6.5 FCE — Feed Conductivity Equivalent

The manufacturer-standard load metric for EDI sizing:
```
FCE [µS/cm] = κ + 2.79 · CO₂[ppm] + 1.94 · SiO₂[ppm]
```
- `κ` = measured conductivity (µS/cm)
- `CO₂` = **total** carbonate (CO₂ + HCO₃⁻ + CO₃²⁻) as ppm CO₂
- `SiO₂` = total silica (reactive + colloidal)

The 2.79 / 1.94 coefficients reflect equivalent ionic conductivity contributed when each weak acid ionizes inside the stack (HCO₃⁻/CO₃²⁻ for CO₂; H₃SiO₄⁻/H₂SiO₄²⁻ for silica).

Target: FCE **1–5 µS/cm** at EDI inlet for two-pass RO + EDI to UPW. Hard limit: **FCE ≤ 40 µS/cm** (stack-dependent 25–43).

⚠️ Some methodologies use **2.66 for CO₂** instead of 2.79; **2.79 is the SnowPure / E-Cell convention**. Pick one and apply consistently across alerts and reporting.

⚠️ FCE requires **total CO₂** (CO₂ + HCO₃⁻ + CO₃²⁻), not free CO₂ at sample pH. If the data pipeline ingests only "free CO₂", FCE is systematically under-reported → silent off-spec risk.

💡 EDI alerts that compare against raw `feed_conductivity` miss CO₂/SiO₂ load. Always compute FCE.

### 6.6 Specific power
kWh per m³ product, or kWh per kg salt removed. Industrial EDI: **0.1–0.3 kWh/m³** product typical.

### 6.7 Stack voltage drift (ΔV)
Baseline-tracked. Rising ΔV at constant current → resin/membrane resistance ↑ → scaling, fouling, or resin damage.

### 6.8 Faraday current efficiency
```
η_F = (n_ions_transported · F) / (I · t) · 100        [%]
```
F = 96 485 C/mol (Faraday constant); I = stack current (A); t in s; n in equivalents.

Reflects fraction of current moving target ions vs parasitic water-splitting. Industrial EDI: **60–90 %** depending on load.

---

## §7 — EDI Failure Modes (8 scenarios)

| # | Failure mode | Detection signature | Root cause | Prevention | Recovery |
|---|---|---|---|---|---|
| 1 | Scaling in concentrate compartment | ΔP↑, ΔV↑, removal↓ | Hardness leak > 1 ppm; CO₂ + Ca → CaCO₃ at high local pH from water-splitting | Hardness < 1 ppm; lower recovery | Acid clean (citric pH 2); replace if irreversible |
| 2 | Organic anion fouling | ΔV↑, anion removal↓ (higher product conductivity), TOC carryover | TOC > 0.5 ppm; humics adsorb on anion resin | RO pretreatment, GAC, low-fouling RO | Caustic + brine CIP; sometimes irreversible |
| 3 | Chloride breakthrough | Product Cl⁻ off-spec while bulk conductivity OK | High feed Cl⁻ + weak anion exchange at low voltage | Raise current density; reduce feed Cl⁻ via 2-pass RO | Increase voltage; verify polarity |
| 4 | CO₂ overload | Product conductivity↑ but ion-specific analyzers OK | RO permeate pH not raised; degasser bypassed/failed | Membrane degasser before EDI; raise RO permeate pH 8–9 with NaOH | Restore degasser; tune pH |
| 5 | Silica gel formation | ΔP↑, removal↓, irreversible | SiO₂ > 1 ppm + low local pH near anode → polymerized SiO₂ | Feed SiO₂ < 0.5 ppm; warmer feed (> 15 °C); lower recovery | Generally not recoverable — replace module |
| 6 | Fe / Mn colloidal fouling | Visible brown deposit; ΔP↑; ΔV↑ | Fe / Mn > 0.01 ppm; oxidation in feed | ORP control upstream; iron filter; < 0.01 ppm | Irreversible; replace |
| 7 | Polarization / over-limiting current | Random spikes in product conductivity; high ΔV; pH excursions in concentrate | Current density > limiting current for ion supply in D; excessive water splitting | Tune V below limiting current density; segment stacks | Reduce current; relax flow |
| 8 | Free-chlorine breakthrough | Sudden ΔV↑; anion resin → "oatmeal"; quality collapse; irreversible | Cl₂ > 0.02 ppm reaches stack (carbon-filter exhausted; SBS failure) | ORP sensor with hard interlock; redundant chlorine scavenger | Damage is permanent — replace module |

Sources: DuPont EDI-310 Module Manual; SnowPure Electropure OEM v3.5.0; WC&P 2007 *Fundamentals of EDI Technology*; SnowPure *Operating EDI in High-Silica Feedwater*; ScienceDirect S0011916419308276.

---

## §8 — EDI vs Mixed-Bed DI — Decision Economics

| Criterion | EDI | Mixed-Bed DI |
|---|---|---|
| Chemical regeneration | No | Yes (NaOH + HCl) |
| Hazardous regen effluent | None | Yes (acid + caustic, neutralized) |
| Operation | Continuous | Cyclical (regen downtime) |
| CAPEX | Higher | Lower |
| OPEX | Lower (energy + small replacement) | Higher (chemicals + waste handling) |
| Footprint | Larger | Smaller |
| Onsite chemical storage | Minimal | Significant (HSE risk) |
| Best for | ≥ 50 m³/d continuous; pharma; semi | < 20 m³/d intermittent; labs |

**Crossover capacity:** ~30–50 m³/d depending on feed (Stark Water sizing guide).

EDI breakeven shifts lower (favors EDI) when:
- Chemical procurement is constrained
- Hazardous-waste disposal is costly
- Site requires continuous UPW
- Regulatory regime prefers chemical-free

---

## §9 — Pharmaceutical UPW / WFI Context

### 9.1 USP <645> Water Conductivity

Three-stage test:
- **Stage 1** — in-line / at-line, **uncompensated**. Lookup table keyed to measured T. At **25 °C the limit is 1.3 µS/cm**.
- **Stage 2** — sample equilibrated to 25 °C in container with stirring; limit **2.1 µS/cm**. CO₂ ingress may cause failure.
- **Stage 3** — sample pH-adjusted to 4.0 with saturated KCl; pH-keyed limit (e.g. pH 5.0 → 4.7 µS/cm).

Sources: USP General Chapter <645>; Mettler-Toledo *USP 645: 3 Steps*.

⚠️ Stage 1 limits are **uncompensated**. Most online conductivity meters default to 25 °C-temperature-compensated readings. Mixing the two breaks compliance reporting. The compliance signal must be the raw, uncompensated value.

### 9.2 USP <643> Total Organic Carbon

- **TOC limit: 500 ppb (0.50 mg C/L)** for both PW and WFI
- System suitability: response to sucrose vs 1,4-benzoquinone CRS must be 85–115 %
- Instrument LoD: ≤ 50 ppb

Sources: Beckman *Changes to USP <643>*; Veolia/Sievers; Mettler-Toledo.

### 9.3 Ph. Eur. monographs

- **Ph. Eur. 0008** (Purified Water): same TOC + conductivity envelope as USP for bulk PW
- **Ph. Eur. 0169** (Water for Injection): **effective 1 April 2017** (Supplement 9.1) — allows non-distillation WFI: "Reverse Osmosis, single- or double-pass, coupled with electrodeionisation, ultrafiltration or nanofiltration, is suitable." Aligned EP with USP/JP

### 9.4 Ph. Eur. chapter 2.2.44 — effective 1 July 2026

The genuine 2026 normative change for pharma water:
- TOC limit re-expressed **0.50 mg/L** (from "0.5 mg/L") for significant-figure alignment
- New Method B for Sterilized Water for Injection (replaces oxidisable-substances test)
- Sucrose R and 1,4-benzoquinone R replaced by **CRS reference standards** (USP harmonization)
- Term "highly purified water" replaced by "water" with κ ≤ 1.0 µS/cm @ 25 °C, TOC ≤ 0.1 mg/L

Sources: FDCELL *Revision of Ph. Eur. Water for Pharmaceutical Use to Take Effect on 1 July 2026*; EDQM Ph. Eur. 12.x updates.

### 9.5 Sanitization compatibility

| Method | Compatibility |
|---|---|
| Hot water 80–85 °C | OK for HWS modules; weekly typical; verify TFC RO temperature spec |
| Steam (> 121 °C) | Limited; only fully steam-sanitizable PVDF assemblies; avoid for typical EDI/RO |
| Ozone (0.1–0.5 ppm) | Limited; destroys polyamide; OK for stainless distribution loops only |
| Peracetic acid (0.1–0.3 %) | OK for most modern membranes (consult vendor) |
| Formaldehyde (0.5–1 %) | Legacy; phased out for GMP/HSE reasons |

### 9.6 Data integrity (21 CFR Part 11 / EU Annex 11)

- **21 CFR Part 11** (US FDA): audit trails, signature integrity, validated computerized systems, retention. Applies to instruments logging USP <645>/<643> data
- **EU Annex 11** (EudraLex Vol 4, Computerised Systems): risk-based validation; ALCOA+ principles; functional + data-integrity analog to Part 11

---

## §10 — Regulatory Context (Produced Water)

### 10.1 WHO GDWQ 4th ed. (2022 + 1st & 2nd Addenda)

Selected drinking-water limits:
- Nitrate (NO₃⁻): 50 mg/L
- Fluoride: 1.5 mg/L
- Arsenic: 10 µg/L
- Lead: 10 µg/L
- TDS: no health-based guideline; ~1 000 mg/L taste threshold

### 10.2 ISO 16075-2:2020 — Treated Wastewater for Irrigation

| Class | Use | BOD avg/max (mg/L) | TSS avg/max (mg/L) | Faecal coliforms (95 %ile, /100 mL) |
|---|---|---|---|---|
| A | Unrestricted food crops | ≤ 5 / ≤ 10 | ≤ 5 / ≤ 10 | ≤ 10 |
| B | Restricted food (drip) | ≤ 10 / ≤ 20 | ≤ 10 / ≤ 25 | ≤ 200 / ≤ 1 000 |
| C | Industrial crops, fodder | ≤ 20 / ≤ 35 | ≤ 30 / ≤ 50 | ≤ 1 000 / ≤ 10 000 |
| D | No public access | ≤ 60 / ≤ 100 | ≤ 90 / ≤ 140 | Nematodes ≤ 1 egg/L; coliforms n/a |

### 10.3 EN 12952-12 — Boiler-feed and Boiler-water Quality

Tiered limits keyed to drum pressure (general guidance — verify full table in standard before encoding limits):

| Drum pressure | Feed κ (µS/cm) | SiO₂ (mg/L) | Hardness |
|---|---|---|---|
| < 20 bar | < 100 | < 1 | < 0.02 mmol/L |
| 20–60 bar | < 30 | < 0.3 | < 0.01 mmol/L |
| > 100 bar (subcritical) | < 0.2 | < 0.02 | Fe < 0.02 mg/L; Cu < 0.003 |

⚠️ Do not hard-code EN 12952-12 limits as fixed thresholds. Pattern: drum-pressure-keyed lookup table cited to the standard ID.

### 10.4 SEMI F63:2021 — Semiconductor UPW

- Resistivity: ≥ 18.2 MΩ·cm @ 25 °C
- TOC: < 1 ppb (≤ 32 nm nodes); < 0.5 ppb for 3 nm / 2 nm advanced
- Silica: < 0.3 ppb (some sources < 0.1 ppb leading-edge)
- Particles: < 1 particle/mL above threshold (size class node-dependent)
- Bacteria: < 1 CFU / 100 mL

---

## §11 — Cross-cutting Code Recommendations

Tags: 💡 enhancement, ⚠️ potential bug / data-quality risk.

- 💡 `EDIDataPoint` should require: `stack_voltage_V`, `stack_current_A`, `cell_pair_count`, `feed_co2_ppm`, `feed_sio2_ppm`, `feed_temperature_C`. Without these, FCE and Faraday efficiency cannot be computed.
- 💡 `EDIKPIs` should expose: `fce_uS_cm`, `faraday_current_efficiency_pct`, `product_resistivity_MOhm_cm`, `water_utilization_pct`, `stack_voltage_drift_pct`.
- 💡 `EDI_THRESHOLDS` must be application-specific. Implement as `EDIThresholdProfile` enum: `PHARMA_WFI`, `PHARMA_PW`, `POWER_BOILER_HP`, `POWER_BOILER_LP`, `SEMI_LEADING_NODE`, `SEMI_LEGACY_NODE`, `INDUSTRIAL_GENERIC`.
- 💡 `edi_calculator.py` should use **FCE as the load metric**, not raw conductivity. The 40 µS/cm limit applies to FCE.
- 💡 New `lifecycle_advisor.py` module: input = cumulative chlorine exposure, CIP history, NPF/NSP baseline drift, ΔP trend, hours-on-stream; output = enum `{TOLERATE, SCHEDULE_CIP, IMMEDIATE_CIP, REPLACE_LEAD, REPLACE_VESSEL_SET}` with justification string.
- ⚠️ Concentrate flow derived as `Q_feed − Q_product` without sensor reconciliation hides leaks / cross-contamination. Add a closure check with warning at |Q_in − Q_out| / Q_in > 2 %.
- ⚠️ FCE depends on **total** CO₂ (CO₂ + HCO₃⁻ + CO₃²⁻), not free CO₂ at sample pH. Free-CO₂-only feeds under-report FCE silently.
- ⚠️ USP <645> Stage 1 limits are **uncompensated**. Compliance reporting must use raw uncompensated conductivity, not 25 °C-compensated readings.

---

## Sources

**Energy / SEC** — Danfoss DESALRO 2.0 case story (Feb 2025); Danfoss Guinness press release; *J. Chem. Ed.* 2021 doi:10.1021/acs.jchemed.0c01194; Wang et al. *Desalination* 2016 (S001191641630087X); US-DOE *Seawater Desalination Bandwidth Study* (2017); Energy Recovery Inc. PX product page; Wikipedia DWEER.

**Economics** — Advisian *Cost of Desalination*; Energy-Solutions.co *SWRO Cost Trends 2026*; Foreverpureplace BWRO costs; ScienceDirect S2213138823000577 LCOW sensitivity; ScienceDirect S004896972402919X BWRO SEC optimization.

**EDI** — SnowPure *Electropure OEM Manual v3.5.0*; DuPont EDI-310 Module Manual (45-D01915); Suez E-Cell EDI documentation; SnowPure FCE technical article; Stark Water *FCE EDI* blog; Ionpure LX-HI datasheet DB-LXHI; WC&P 2007 *Fundamentals of EDI Technology*; SnowPure *Operating EDI in High-Silica Feedwater*.

**Pharma** — USP General Chapters <645> and <643>; Mettler-Toledo USP guides; Beckman / Veolia / Sievers TOC references; PharmOut *Ph. Eur. allows non-distillation WFI from April 2017*; A3P membrane vs distillation comparison; EMA Q&A on non-distillation WFI; FDCELL *Ph. Eur. Water Revision 1 July 2026*; EDQM Ph. Eur. 12.x updates.

**Produced-water regulatory** — WHO GDWQ 4th ed. (2022 + addenda); ISO 16075-1..4 (2020–2021); EN 12952-12; SEMI F63:2021; ASME/EPRI boiler-feed guidance; EPA WaterReuse.

**Membrane life** — FilmTec/DuPont 45-D01911 *Exceptional Membrane Life*; Aqualitek SWRO maintenance guide; *Pumps & Systems Life of an RO Membrane* multipart.
