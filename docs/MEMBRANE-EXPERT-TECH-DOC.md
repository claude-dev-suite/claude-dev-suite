# Membrane Expert — Technical Documentation

Overview of the **membrane-expert** dev-suite agent: scope, knowledge base composition, and the authoritative source list used to compile its reference material.

---

## 1. Agent Overview

### 1.1 Purpose

The `membrane-expert` agent provides domain expertise on **Reverse Osmosis (RO)** and **Electrodeionization (EDI)** processes for water treatment, desalination, and ultrapure water production. It was created to support the MembSense project (RO/EDI process monitoring and AI advisory app) but is reusable across any project that touches:

- Industrial water treatment plants (SWRO, BWRO, tertiary reuse RO)
- Pharmaceutical Purified Water / Water for Injection (WFI) systems
- Power-plant ultrapure water trains
- Semiconductor UPW chains
- Process diagnostics, KPI normalization, fouling/scaling analysis
- Membrane integrity testing and CIP planning

### 1.2 Dual-consumer design

The knowledge base is engineered for two distinct consumers:

| Consumer | Use case |
|---|---|
| **Dev-suite agent** (Claude Code) | Codebase decisions during MembSense development — KPI formulas, threshold values, alert categorization, Pydantic model design, validation logic |
| **In-app AI advisor** | System-prompt context for the `core/ai_advisor.py` Claude integration that generates operator and plant-manager reports |

Both consumers share the same source-of-truth knowledge files but invoke them in different ways:
- The dev-suite agent reads the markdown directly when reasoning about code.
- The in-app advisor would have curated excerpts injected into its system prompt (with prompt caching) to ground its diagnostic narrative in cited standards.

### 1.3 Audience targeting

The material is calibrated for a **mixed audience** — plant operator + process engineer + plant manager. Operator-facing text avoids unexplained jargon; engineer-facing sections cite ASTM clauses, vendor TSB numbers, and use indices (LSI, S&DSI, NPF, NSP, FCE) without dilution.

### 1.4 Bilingual scope (IT/EN)

The MembSense UI is Italian. The agent and advisor must preserve terminology in both languages:
- English where Italian convention loans the term (CIP, fouling, skid, set-point, breakthrough)
- Italian where standard terms exist (recovery → recupero, salt rejection → rigetto salino, NDP → pressione netta motrice, scaling → incrostazione, fouling → sporcamento)

A complete bilingual glossary is part of the knowledge base (`01-fundamentals.md §6`).

---

## 2. Knowledge Base Composition

The knowledge files live in the MembSense project under `.claude/knowledge/membrane-expert/`:

```
01-fundamentals.md       ~5 000 words
02-troubleshooting.md    ~5 000 words
03-economics-edi.md      ~5 000 words
README.md                index and conventions
```

### 2.1 File 1 — RO & EDI Process Fundamentals

**Path**: `.claude/knowledge/membrane-expert/01-fundamentals.md`

Foundational physics, chemistry, and standards reference. Sections:

1. **RO Process Fundamentals** — Mass/ion balance, Recovery (Y), Concentration Factor, Salt Rejection (observed vs system vs intrinsic with β), Permeate/Salt Flux, Net Driving Pressure, Osmotic Pressure (Van't Hoff + engineering shorthands), Temperature Correction Factor (ASTM D4516 form), Normalized Permeate Flow, Normalized Salt Passage, Element/vessel/staging basics
2. **Authoritative Standards Reference** — Per-standard treatment of scope, current edition, key clauses, when to invoke (ASTM D4516, D3923, D4194, D4195, D6161, D4189; ISO 16075-1..4; WHO GDWQ; USP <645>/<643>; Ph. Eur. 0008/0169; EN 1717)
3. **Vendor Design Guides — Synthesis** — DuPont FilmTec design flux windows, Toray TM/TMG limits, Hydranautics TSB series index, Suez/Veolia GenGard antiscalant, LANXESS Lewabrane, side-by-side vendor comparison
4. **Water Chemistry Essentials** — TDS/conductivity per water type, typical ion composition (seawater, brackish, tap), pH effects on rejection (boron, CO₂/HCO₃, silica, ammonia), SDI interpretation, ORP/chlorine, scaling indices intro
5. **EDI Quick Reference** — Feed-quality envelope, product targets (pharma/power/semi)
6. **Bilingual IT/EN Glossary** — 45+ membrane-process terms with translation and usage notes
7. **Summary of ⚠️ items in `core/calculator.py`** — Code-mapped bug/approximation list with concrete recommended fixes
8. **Recommended Plant-Config Schema Additions** — YAML schema for water_type, membrane_class, baselines, thresholds_override

Every formula is mapped to the corresponding field in `core/models.py::RODataPoint`.

### 2.2 File 2 — RO Troubleshooting & Diagnostic Methodology

**Path**: `.claude/knowledge/membrane-expert/02-troubleshooting.md`

Diagnostic depth — how to distinguish failure modes from process data. Sections:

0. **Diagnostic frame of reference** — Five orthogonal failure axes, ASTM D4516 "three observables" (NPF, NSP, normalized ΔP)
1. **Fouling — full taxonomy** — Colloidal, biofouling, organic, particulate, combined fouling. Each with chemistry, signature in process data, confirmation tests, prevention, cleaning protocol.
2. **Scaling — by mineral species** — CaCO₃ (LSI/S&DSI formulas), CaSO₄, BaSO₄, SrSO₄, SiO₂, CaF₂, Fe/Mn hybrid. Solubility limits, saturation indices, antiscalant compatibility table.
3. **Membrane integrity loss** — O-ring failure, breach/pinhole, chlorine oxidation (with ppm·h dose tolerance: 200/1 000/6 200), mechanical damage (telescoping, glue line, lobe seal), integrity test decision matrix, when to autopsy
4. **Chemical/operational failures** — Free chlorine breakthrough, pH excursion, temperature excursion, pressure shock
5. **Diagnostic decision logic** — Top-level decision tree (pseudo-code) consuming `RODataPoint` + baseline → ranked root causes with confidence. Branches: fouling subtype, sudden vs gradual rejection drop, scaling vs compaction, valve drift vs permeate leak.
6. **CIP decision matrix** — Trigger criteria (ASTM D4516 trend-based), chemistry selection by foulant, sequence rule (acid-first vs alkaline-first), operating parameters, when CIP won't help
7. **Data-driven trending** — Baseline establishment per ASTM D4516, signal-to-noise expectations per KPI, why snapshots mislead, SQLite schema suggestions for `baselines` and `cumulative_exposure` tables
8. **Bilingual glossary** (troubleshooting-specific terms)

### 2.3 File 3 — Economics, Energy, and EDI Deep Dive

**Path**: `.claude/knowledge/membrane-expert/03-economics-edi.md`

Managerial framing + EDI-specific deep treatment.

**PART 1 — Energy & Economics:**
1. **Specific Energy Consumption** — SEC formula, benchmarks by source (SWRO 2.5–4.0, 1.79 world record DESALRO 2.0; BWRO 0.3–1.0), thermodynamic minimum (~1.1 kWh/m³ for seawater), ERD comparison (Pelton vs Pressure Exchanger), ERD payback rule of thumb
2. **LCOW** — Component breakdown (CAPEX/OPEX shares), LCOW ranges by configuration, sensitivity ranking (energy price #1, membrane life #2, recovery #3)
3. **Operational KPIs** beyond what MembSense computes — Membrane life, replacement rate, CIP frequency benchmark, availability, NPF/NSP baseline drift rates
4. **Lifecycle Decision Matrix** — Signature-to-action table (CIP vs replace vs tolerate) with rationale

**PART 2 — EDI Deep Dive:**
5. **Process Fundamentals** — Cell-pair geometry, in-situ resin regeneration via water splitting, why EDI lives downstream of RO, full feed-quality envelope with `EDIDataPoint` field mapping
6. **EDI KPIs and Formulas** — Conductivity removal, product resistivity (18.18 MΩ·cm theoretical max), water utilization, reject ratio, specific power, stack ΔV (health indicator), **FCE — Feed Conductivity Equivalent** (the manufacturer-standard load metric: `C + 2.79·CO₂ + 1.94·SiO₂`), Faraday current efficiency
7. **EDI Failure Modes** — Eight scenarios with detection signatures, prevention, recovery: scaling in concentrate, organic anion fouling, chloride breakthrough, CO₂ overload, silica gel formation, Fe/Mn colloidal fouling, polarization/over-limiting current, free-chlorine breakthrough
8. **EDI vs Mixed Bed Decision Economics** — Comparison table, decision matrix by operating profile
9. **Pharmaceutical UPW/WFI Context** — USP <645> three-stage test, USP <643> TOC limit, Ph. Eur. 2017 membrane-WFI revision, sanitization compatibility table, 21 CFR Part 11 / EU Annex 11 brief
10. **Regulatory Context for Produced Water** — WHO drinking, ISO 16075 irrigation classes A–D, ASME/EN 12952 boiler feed by pressure class, SEMI F63 semiconductor UPW
11. **Cross-cutting code recommendations** — Enumerated 💡 callouts on `EDIDataPoint`, `EDIKPIs`, `EDI_THRESHOLDS`, `edi_calculator.py`, plus a `lifecycle_advisor.py` new-module suggestion

### 2.4 Convention markers used throughout

| Marker | Meaning |
|---|---|
| ⚠️ | Bug or incorrect numerical approximation in current MembSense code. Highest priority. |
| 💡 | Enhancement opportunity — new alert, new model field, new threshold. |

Both markers cite the file and (where relevant) the line number in the existing MembSense source tree.

### 2.5 Highest-impact findings flagged

| File | Finding | Severity |
|---|---|---|
| 01-fundamentals §1.7 | `osmotic_pressure_approx()` underestimates π by ~3–4× (returns 8 bar vs textbook 27 bar for seawater) | ⚠️ Bug |
| 01-fundamentals §1.9 | NPF and NSP defined in `ROKPIs` but never populated because no baseline is passed to `calculate_kpis()` | ⚠️ Functional gap |
| 02-troubleshooting §5.5 | No mass-balance closure check (`Qf ≈ Qp + Qc`) — #1 cause of phantom alerts from instrument drift | 💡 High value |
| 02-troubleshooting §3.3 | No cumulative chlorine exposure tracking (ppm·h) for membrane-life decisions | 💡 Lifecycle |
| 03-economics-edi §2.2 | EDI alerts use raw `feed_conductivity` instead of FCE — misses CO₂/SiO₂ load | 💡 Vendor alignment |
| 01-fundamentals §1.5 | `THRESHOLDS["flux_max"] = 25` is one-size-fits-all; should be water-source-aware | 💡 Threshold realism |
| 01-fundamentals §1.4 | `THRESHOLDS["salt_rejection_min"] = 98` is below modern SW/BW membrane spec | 💡 Threshold realism |

---

## 3. Source List

Every factual claim in the knowledge base is traceable to one of the sources below. Sources are organized by type.

### 3.1 ASTM Standards

| Standard | Title | Edition |
|---|---|---|
| ASTM D4516 | Standard Practice for Standardizing Reverse Osmosis Performance Data | 2019a |
| ASTM D3923 | Standard Practices for Detecting Leaks in RO and NF Devices | 2023 (also 2018) |
| ASTM D3739 | Calculation and Adjustment of the Langelier Saturation Index for RO | 2019 |
| ASTM D4194 | Standard Test Methods for Operating Characteristics of RO and NF Devices | 2023 |
| ASTM D4195 | Standard Guide for Water Analysis for RO/NF Application | 2014 (withdrawn 2023, content still authoritative) |
| ASTM D6161 | Standard Terminology for Membrane Separation | 2023 |
| ASTM D4189 | Silt Density Index of Water | 2023 |
| ASTM D6908 | Integrity Testing of Water Filtration Membrane Systems (PDT, VDT) | current |

### 3.2 ISO Standards

| Standard | Title | Year |
|---|---|---|
| ISO 16075-1 | Treated wastewater use for irrigation projects — Part 1: Basis of a reuse project | 2020 |
| ISO 16075-2 | Part 2: Development of the project | 2020 |
| ISO 16075-3 | Part 3: Components of a reuse project | 2021 |
| ISO 16075-4 | Part 4: Monitoring | 2021 |

### 3.3 European Norms

| Standard | Title | Year |
|---|---|---|
| EN 1717 | Protection against pollution of potable water by backflow | 2025 |
| EN 12952-12 | Water-tube boilers and auxiliary installations — Part 12: Requirements for boiler-feed and boiler-water quality | current |

### 3.4 Pharmacopoeia

| Reference | Title | Notes |
|---|---|---|
| USP <645> | Water Conductivity | three-stage test; Stage 1 limit 1.3 µS/cm at 25 °C |
| USP <643> | Total Organic Carbon | 500 ppb limit for PW/WFI |
| Ph. Eur. 0008 | Purified Water monograph | current revision |
| Ph. Eur. 0169 | Water for Injection monograph | 2017 revision allows non-distillation WFI; further revisions effective 2026-07 |
| Ph. Eur. 12.3 chapter 2.2.44 | TOC determination | becomes mandatory 2026-07 |

### 3.5 Health/Regulatory Guidelines

| Reference | Title | Year |
|---|---|---|
| WHO GDWQ | Guidelines for Drinking-water Quality, 4th edition + 1st & 2nd addenda | 2022 |
| EMA Guideline | Quality of water for pharmaceutical use | current |
| US EPA SDWA | Safe Drinking Water Act MCLs | referenced for cross-comparison |
| EU Directive 2020/2184 | Drinking water directive (recast) | 2020 |
| 21 CFR Part 11 | Electronic Records; Electronic Signatures (US FDA) | data integrity for pharma roadmap |
| EU Annex 11 | Computerised Systems (EudraLex Vol. 4) | data integrity for pharma roadmap |
| SEMI F63 | Guide for Ultrapure Water Used in Semiconductor Processing | current |
| ASME / ABMA Boiler & PVC | Boiler water consensus guidelines (with EN 12952-12) | current |

### 3.6 Vendor Technical Manuals — DuPont FilmTec

| Form # | Title |
|---|---|
| 45-D01504 | FilmTec™ Reverse Osmosis Membranes Technical Manual |
| 45-D01588 | FilmTec™ System Design Guidelines |
| 45-D01591 | FilmTec™ Design Equations Manual |
| 45-D01616 | FilmTec™ Plant Performance Normalization |
| 45-D01695 | FilmTec™ System Design Guidelines for 8" Elements |
| 45-D01552 | FilmTec™ Calcium Carbonate Scale Prevention Manual |
| 45-D01557 | FilmTec™ Silica Scale Prevention Manual |
| 45-D01569 | FilmTec™ Chlorination/Dechlorination Manual |
| 45-D01915 | DuPont EDI-310 Module Technical Manual |

### 3.7 Vendor Technical Manuals — Hydranautics / Nitto

Technical Service Bulletins (publicly available at membranes.com):

| TSB | Topic |
|---|---|
| TSB 100 | Foulant identification |
| TSB 104 | Storage and preservation (SMBS, glycerin) |
| TSB 107 | Foulants and cleaning procedures for composite polyamide |
| TSB 108 | Chlorination and dechlorination |
| TSB 110 | Operating limits and guidelines |
| TSB 111 | Biofouling control |
| TSB 113 | ESPA/CPA/SWC product specifications |
| TSB 116 | Sodium bisulfite use for oxidant removal |
| TSB 124 | Membrane integrity and vacuum-decay testing |
| TSB 207 | Standardization (Hydranautics version of ASTM D4516) |
| TSB 414 | Caustic / acid CIP procedure |

Plus: Hydranautics RO Water Chemistry datasheet, Hydranautics Terms & Equations of RO datasheet.

### 3.8 Vendor Technical Manuals — Other RO

| Vendor | Document |
|---|---|
| Toray | TM/TMG element datasheets; TorayDS design tool |
| Toray | TMG-D datasheet (low-energy brackish) |
| Suez / Veolia | AG/AK/AD element series; GenGard™ antiscalant compatibility |
| Suez / Veolia | E-Cell EDI systems documentation |
| LANXESS | Lewabrane LP/HR/B400/B440 datasheets; LewaPlus design software |
| LG Chem | Nanoh2o operating limits |

### 3.9 Vendor Technical Manuals — EDI

| Vendor | Document |
|---|---|
| DuPont / Evoqua | IONPURE LX, LX-X, LX-HI module datasheets |
| Suez | E-Cell EDI systems |
| SnowPure | Electropure EDI OEM Engineering Manual v3.5.0 |
| MEC Watertek | EDI module documentation |

### 3.10 Industry Technical Bulletins

| Source | Topic |
|---|---|
| American Water Chemicals | TAB-111 Chemical Pretreatment for RO and NF |
| Stark Water | FCE — EDI Equivalent Conductivity technical note |
| Stark Water | EDI vs Mixed Bed DI sizing guide |
| Felitecn | Mixed bed resin vs EDI economics |
| Ultrapurewater.com | IX vs EDI comparison |
| Lenntech | SDI test reference, Osmotic Pressure tutorial, RO Water Chemistry data sheets |
| WCP Online (Water Conditioning & Purification) | Fundamentals of EDI Technology (2007) |

### 3.11 Peer-Reviewed Literature

| Citation | Topic |
|---|---|
| Gohil & Suresh (2019), *Desalination* 457:133 | Free chlorine exposure dose tolerance for polyamide (ppm·h thresholds: 200 onset, ~2 640 severe, ~6 200 RO→NF transformation) |
| Pereira et al. (2014), PMC4021920 | Membrane biofouling: causes, monitoring, control |
| Vrouwenvelder et al., multiple | AOC/BGP correlation with normalized SWRO ΔP rise |
| *Journal of Membrane Science*, various | Concentration polarization and water splitting in EDI |
| *Desalination* journal | Thermodynamic perspective on SEC of seawater desalination (Spiegler–Kedem analysis, ~1.06 kWh/m³ lower bound) |
| *Desalination* (Elsevier, 2025) | SWRO SEC and machine learning study |
| *Journal of Chemical Education* | Theoretical minimum energy of desalination |
| *Pumps & Systems* | Life of an RO membrane (multipart) |

### 3.12 Industry News & Cost Data (recent)

| Source | Topic | Year |
|---|---|---|
| Danfoss press release | DESALRO 2.0 SWRO efficiency world record (1.79 kWh/m³) | 2025 |
| Energy Recovery Inc. | PX-Q400 SWRO efficiency case studies | 2024 |
| Aqualitek | Maximum ERD efficiency overview | 2024 |
| Energy Solutions | Solar SWRO cost trends 2026 | 2025 |
| Advisian/Worley | Cost of desalination global perspectives | 2024 |
| Aqualitek | CIP procedures for industrial RO | 2024 |

### 3.13 Pharmaceutical Industry References

| Source | Topic |
|---|---|
| PharmOut | "Ph. Eur. allows generation of WFI by non-distillation technologies" (April 2017 revision) |
| A3P | Comparison of WFI production by membrane-based vs distillation-based methods |
| Lab Manager | Pharmaceutical-grade water meeting USP PW and WFI standards |
| FD Cell | Revision of Ph. Eur. water for pharmaceutical use, effective 2026-07 |

---

## 4. Curation Methodology

How the knowledge base was assembled:

1. **Scoping interview** with the user (project owner) to define audience (operator + process engineer), standards inclusion (ASTM family + ISO + WHO + USP/Ph. Eur. + vendor manuals), and diagnostic focus areas (fouling, scaling, integrity, economics/energy).
2. **Three parallel research passes** executed by general-purpose agents in isolated contexts, each tasked with a non-overlapping section: (a) fundamentals & standards, (b) troubleshooting & diagnostics, (c) economics & EDI. Each pass had its own source list and was asked to verify specific numbers (chlorine ppm·h limits, solubility constants, SEC benchmarks) via live web fetches against primary sources.
3. **Code mapping** — every formula and every threshold was cross-referenced to the existing MembSense code (`core/calculator.py`, `core/edi_calculator.py`, `core/models.py`, `core/config.py`) and flagged with ⚠️ (bug/approximation) or 💡 (enhancement opportunity).
4. **Synthesis & persistence** — three markdown briefs + a README index, written to `.claude/knowledge/membrane-expert/` in the MembSense project. No production code was modified during knowledge-base creation.

## 5. Recommended Next Steps for Consumers

For the dev-suite agent file (`.claude/agents/membrane-expert.md` in MembSense or dev-suite distribution):
- Reference all four knowledge files in the agent's system prompt as authoritative context
- Path-scope activation on `core/calculator.py`, `core/edi_calculator.py`, `core/models.py`, `core/config.py`, `core/ai_advisor.py`
- Tools allowlist: Read, Edit, Write, Grep, Glob, Bash (for pytest)
- Model selection: Sonnet for most tasks; Opus for complex diagnostic logic design

For the in-app AI advisor (`core/ai_advisor.py` system prompt augmentation):
- Inject curated extracts from §1 (KPI formulas) and §5 of `02-troubleshooting.md` (decision tree)
- Use Anthropic prompt caching (cache the standards reference as a static block)
- Tag responses with cited standards (e.g., "per ASTM D4516, NPF decline >10% indicates fouling") so operators can verify

## 6. Maintenance Notes

- Standards editions evolve. Ph. Eur. 12.3 chapter 2.2.44 becomes mandatory **2026-07** — update advisor references when that lands. ASTM D4516 last revised 2019a; check ASTM annual review schedule.
- Vendor design fluxes drift downward as new low-fouling membrane chemistries arrive; revisit the FilmTec/Toray/Hydranautics tables annually.
- DESALRO 2.0's 1.79 kWh/m³ record (2025) will likely be surpassed; treat SEC benchmarks as "state of the art at compilation date 2026-05".
- EDI vendor consolidation (DuPont acquired Evoqua's IONPURE line) — manual numbers may renumber under DuPont branding over time.
