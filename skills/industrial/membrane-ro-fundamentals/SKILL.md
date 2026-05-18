---
name: membrane-ro-fundamentals
description: Reverse Osmosis (RO) and Electrodeionization (EDI) process fundamentals — formulas (recovery, rejection, NDP, osmotic pressure, TCF, NPF/NSP), authoritative standards reference (ASTM/ISO/USP/Ph.Eur./WHO/EN), vendor design windows (DuPont, Hydranautics, Toray, Suez, LANXESS), water chemistry, EDI quick reference, IT/EN glossary. Use when working on RO/EDI plant code, KPI calculations, or normative citations.
user-invocable: false
---

# RO & EDI Process Fundamentals

Reference for water-treatment expertise: formulas, normative standards, vendor design envelopes, water chemistry, and bilingual terminology.

Convention markers used throughout the membrane skills:
- `⚠️` — likely bug or incorrect numerical approximation in calling code; highest priority
- `💡` — enhancement opportunity (new KPI, new model field, refined threshold)

---

## §1 — RO Process Fundamentals

All formulas in SI (LMH, bar, °C) with US field-unit (GFD, psi, °F) variant noted. Variables: `Qf` feed flow, `Qp` permeate, `Qc` concentrate, `Cf`/`Cp`/`Cc` concentrations, `Am` membrane area, `T` temperature.

### 1.1 Recovery (Water Recovery / Recupero)

```
Y = Qp / Qf
```

Typical ranges (vendor-dependent):
- SWRO single-pass: 35–50 %
- BWRO: 70–85 %
- BWRO high-recovery (w/ antiscalant): 90 %+
- Double-pass RO+RO overall: 70–80 %

Source: ASTM D6161-19; DuPont 45-D01504; Hydranautics TSB 107.

### 1.2 Concentration Factor (CF)

```
CF_ideal = 1 / (1 - Y)                          # for R = 1
CF_real  = (1 - Y·(1 - R)) / (1 - Y)            # for rejection R
```

At Y = 0.75 and R = 0.99: CF_ideal = 4.00, CF_real ≈ 3.97 (error < 1 %), so the ideal form is acceptable for SWRO/BWRO design.

Source: DuPont 45-D01591 (Design Equations).

### 1.3 Salt Rejection — three definitions

| Variant | Symbol | Formula | When used |
|---|---|---|---|
| Observed (apparent) | R_obs | `1 − Cp/Cf` | What instruments measure |
| System (log-mean) | R_sys | `1 − Cp / mean(Cf, Cc)` | Standard reporting |
| Intrinsic (at wall) | R_int | `1 − Cp / (β · mean(Cf, Cc))` | Corrected for polarization |

Concentration polarization factor:
```
β = Cwall / Cbulk = exp(0.7 · Y_element)
```
where `Y_element` is per-element recovery. FilmTec design limit: β ≤ 1.2 → Y_element ≤ 18 % (the **18 % per-element rule**). Hydranautics is more conservative at 15 %.

⚠️ A code path that confuses `R_obs` with `R_sys` will under-report rejection by 5–15 % at high recovery. Always specify which definition the calculator returns.

Sources: DuPont 45-D01591; Hydranautics *Terms and Equations of RO*.

### 1.4 Permeate Flux (Jw)

```
Jw = A · NDP · TCF · FF                          # vendor model
Jw = Qp / Am                                     # operational
```

`A` = water permeability (LMH/bar), `FF` = fouling factor (0.85 design / 0.70 EOL).

Unit conversion: **1 GFD = 1.6987 LMH** (≈ 1.70).

Typical design flux windows (vendor consensus):

| Application | GFD | LMH |
|---|---|---|
| SWRO open intake (SDI 3–5) | 7–9 | 12–15 |
| SWRO beach well (SDI < 2) | 8–10 | 14–17 |
| BWRO well (SDI < 3) | 14–18 | 24–30 |
| BWRO surface (SDI 3–5) | 10–14 | 17–24 |
| RO permeate / 2nd pass | 20–30 | 34–51 |

⚠️ A hard-coded `flux_max = 25 LMH` threshold is incorrect for SWRO (well above limit) and conservative for BWRO well (well below limit). Threshold must be water-source-aware.

Sources: DuPont 45-D01695 Rev 14 (Feb 2026); Hydranautics TSB 105; AMTA *Optimum Flux Rates*.

### 1.5 Salt Flux (Js)

```
Js = B · (mean(Cf,Cc) − Cp) ≈ B · mean(Cf,Cc)
Cp = Js / Jw                                     # key inverse relation
```

`B` is **temperature-dependent but pressure-independent** (unlike `A`). At cold feed temperature, `Jw` drops while `Js` is relatively unchanged → `Cp` rises → permeate quality degrades. Cold-water permeate TDS spikes are explained by this relation.

Source: DuPont 45-D01591; Hydranautics *Terms and Equations*.

### 1.6 Net Driving Pressure (NDP)

```
NDP = (Pf + Pc)/2 − Pp − (πw − πp)
    = mean_feed_pressure − permeate_pressure − osmotic_differential_at_wall
```

with `πw = β · π_mean(Cf,Cc)` (osmotic pressure at membrane wall, corrected for polarization).

Source: ASTM D4516-19a §6; DuPont 45-D01591.

### 1.7 Osmotic Pressure (π)

**Rigorous Van't Hoff:**
```
π = i · M · R · T                                # i ≈ 1.8–2.0 for NaCl
                                                 # R = 0.08314 L·bar/(mol·K)
                                                 # T in Kelvin
```

**Engineering shortcut (industry standard at 25 °C):**
```
π [psi] ≈ 0.0085 · TDS [ppm]
π [bar] ≈ 0.000586 · TDS [ppm]
```

Shortcut accuracy:
- ±3 % for NaCl-dominated brackish (1 000–10 000 ppm)
- ±5 % for seawater (32 000–40 000 ppm) — agrees with Pitzer model up to 70 g/L NaCl
- Diverges > 10 % for sulfate-rich or hardness-dominated brines — use OLI/PHREEQC instead

Seawater rule of thumb: 35 000 ppm → π ≈ 25–28 bar bulk; ≈ 32–35 bar at wall with β = 1.15.

⚠️ A formula returning π ≈ 8 bar for seawater under-estimates by 3–4× — verify constants and unit handling. The correct order of magnitude for seawater is **25–35 bar**.

Source: Pitzer comparison (Tandfonline 2019); Stark-Water RO Working Principle Guide; FilmTec 45-D01591.

### 1.8 Temperature Correction Factor (TCF)

ASTM D4516-19a normalizes flux to a 25 °C reference. General exponential form:

```
TCF = exp[ Ke · (1/298 − 1/(273 + T)) ]
```

Membrane-chemistry constants (Hydranautics TSB 107.28 Apr 2025; FilmTec 45-D01616 Rev 10 Feb 2022):

| Membrane type | Ke | Regime |
|---|---|---|
| FilmTec BW30 / SW30 (T ≥ 25 °C) | **3 020** | Hot |
| FilmTec BW30 / SW30 (T < 25 °C) | **2 640** | Cold (flux drops faster) |
| Hydranautics CPA / ESPA | 2 500–3 480 | Element-specific (TSB 107) |
| Hydranautics SWC seawater | ~3 020 | |

Practitioner shortcut: TCF ≈ 1.03 per °C around 25 °C; doubles every ~25 °C rise.

### 1.9 Normalized Permeate Flow (NPF) — ASTM D4516-19a §7

```
NPF = Qp_meas · (NDP_std / NDP_actual) · (TCF_std / TCF_actual)
```

Action thresholds (industry consensus):
- NPF drop **10 %** vs baseline → schedule CIP
- NPF drop **15 %** → CIP mandatory
- NPF drop **30 %** → autopsy / replacement evaluation

⚠️ NPF cannot be computed without a baseline. Code paths declaring `NPF` as a field but never populating it because `calculate_kpis()` receives no baseline are silently broken.

### 1.10 Normalized Salt Passage (NSP) — ASTM D4516-19a §8

```
NSP = SP_meas · (mean_C_std / mean_C_actual) · (EPF_actual / EPF_std) · (STCF_std / STCF_actual)
```

where `SP = Cp / mean(Cf, Cc)` and `STCF` is the salt-passage temperature factor (different exponent constant: `Ks ≈ 2 200`).

Action threshold: NSP rise **15 %** → integrity check via ASTM D6908 VDT or ASTM D3923 leak test.

### 1.11 Element / Vessel / Stage / Train Hierarchy

```
Train (skid)
└── Stage 1                  ┐ array typically 2:1 or 3:2:1
    ├── Pressure Vessel       │
    │   ├── Element 1         │ standard 8"×40" or 4"×40"
    │   ├── Element 2         │ 6–8 elements per vessel
    │   └── …                 │ typical per-vessel Y = 8–15 %
    └── Stage 2 / 3            reuses concentrate as feed
```

Per-stage recovery rule of thumb:
- Stage 1 (8 elements, single pass): Y₁ ≈ 50 %
- 2-stage train: `Ysys = 1 − (1−Y1)·(1−Y2) ≈ 75 %`
- 3-stage train: 85–90 % for high-recovery BWRO

Per-element max: Y_element ≤ 18 % (FilmTec) or ≤ 15 % (Hydranautics).

---

## §2 — Authoritative Standards Reference

| Standard | Title | Edition | When to invoke |
|---|---|---|---|
| **ASTM D4516-19a** | Standardizing RO Performance Data | 2019 | Normalize NPF, NSP — any commissioning, surveillance, warranty claim |
| **ASTM D3923** | Detecting Leaks in RO and NF Devices | 2023 (also 2018) | New-element acceptance; suspected O-ring / glue-line failure |
| **ASTM D3739-19** | Calculation of the Langelier Saturation Index for RO | 2019 | CaCO₃ scaling prediction; valid for concentrate TDS 10–10 000 mg/L |
| **ASTM D4582** | Stiff & Davis Stability Index | current | CaCO₃ scaling at TDS > 10 000 mg/L |
| **ASTM D4194-23** | Operating Characteristics of RO and NF Devices | 2023 | Short-term (< 24 h) factory or commissioning test — not for plant design |
| **ASTM D4195** | Water Analysis for RO/NF Application | 2014 (withdrawn 2023, still authoritative for scope) | Feedwater characterization scope |
| **ASTM D6161-19** | Terminology for Membrane Separation | 2019 | Definitive glossary; cite to resolve term disputes |
| **ASTM D4189-23** | Silt Density Index (SDI) | 2023 | Pretreatment performance benchmark (30 psi, 0.45 µm, 15 min default) |
| **ASTM D6908** | Integrity Testing of Water Filtration Membrane Systems | 2025 / 2017 | VDT for RO/NF; PDT for UF/MF |
| **ISO 16075-1..4** | Treated Wastewater Use for Irrigation | 2020 / 2021 | Reuse projects; -2 defines water-quality classes A–D |
| **WHO GDWQ 4th ed.** | Guidelines for Drinking-water Quality (+ 1st & 2nd Addenda) | 2022 | Health-based limits: As 10 µg/L, B 2 400 µg/L, F 1.5 mg/L, NO₃ 50 mg/L |
| **USP <645>** | Water Conductivity | current | Stage 1 limit **1.3 µS/cm @ 25 °C** (uncompensated, in-line) for Purified Water |
| **USP <643>** | Total Organic Carbon | current | **500 ppb** limit for PW and WFI; system suitability with sucrose + 1,4-benzoquinone |
| **Ph. Eur. 0008** | Purified Water (Aqua purificata) | current | Equivalent to USP PW; conductivity ≤ 4.3 µS/cm @ 20 °C, TOC ≤ 0.5 mg/L |
| **Ph. Eur. 0169** | Water for Injection | **Effective 1 April 2017** (Suppl. 9.1) | Allows non-distillation WFI via RO + EDI/UF/NF (note: no 2026 enforcement deadline for this monograph) |
| **Ph. Eur. ch. 2.2.44** | TOC in Water for Pharmaceutical Use | **Effective 1 July 2026** | New harmonized USP/Ph.Eur. method; CRS replaces sucrose/1,4-BQ; updates to "Water" terminology |
| **EN 1717:2025** | Protection of Potable Water from Backflow | 2025 | Fluid categories 1–5; air gaps for RO permeate re-entering potable mains |
| **EN 12952-12** | Boiler-feed and Boiler-water Quality | current | Tiered limits keyed to drum pressure class |
| **21 CFR Part 11** | Electronic Records & Signatures (US FDA) | — | Data integrity for pharma roadmap |
| **EU Annex 11** | Computerised Systems (EudraLex Vol. 4) | — | Risk-based validation; ALCOA+ |
| **SEMI F63** | Ultrapure Water for Semiconductor Processing | 2021 | ≥ 18.2 MΩ·cm, TOC < 1 ppb, SiO₂ < 0.3 ppb |

⚠️ ASTM D4195 is withdrawn (2023) but still cited as authoritative for scope — flag this explicitly when referencing.

⚠️ Ph. Eur. 0169 has no "mandatory 2026-07" deadline. The non-distillation WFI revision took effect 1 April 2017. The 2026-07 date belongs to **chapter 2.2.44** (TOC harmonization), which is a different normative artifact.

---

## §3 — Vendor Design Guides

### 3.1 DuPont FilmTec
Key documents: **45-D01504** (master Tech Manual); **45-D01580** (System Design); **45-D01588** (4"/midsize); **45-D01695 Rev 14 Feb 2026** (8" Design Guidelines, current); **45-D01591** (Design Equations); **45-D01616** (Plant Performance Normalization).

| Family | Use | Test conditions | Salt rejection |
|---|---|---|---|
| SW30HR / SW30HRLE-440i | Seawater | 32 000 ppm NaCl, 800 psi, 25 °C, 8 % | 99.7–99.8 % |
| BW30-400 / BW30HR-440i | Brackish | 2 000 ppm NaCl, 225 psi, 25 °C, 15 % | 99.5 % |
| LE / XLE / Eco | Low-energy brackish | 500–2 000 ppm, 100–150 psi | 99.0–99.4 % |

### 3.2 Hydranautics (Nitto)
TSB index (publicly available at membranes.com):

| TSB | Topic |
|---|---|
| 100 | Foulant identification |
| 105 | Storage and preservation |
| 107.28 (Apr 2025) | Foulants & cleaning procedures; TCF constants |
| 108 | Chlorination / dechlorination |
| 110 | Operating limits & biocides |
| 111 | Biofouling control |
| 113 | ESPA/CPA/SWC product specs; oxidation |
| 124 | Integrity and VDT |
| 207 | Standardization (Hydranautics version of D4516) |
| 414 | Caustic / acid CIP procedure |

| Family | Type | Notes |
|---|---|---|
| SWC4 / SWC5 / SWC6 | Seawater | 99.8 % rejection; ~92 % B rejection @ pH 8 |
| CPA3 / CPA5-LD / CPA7 | Brackish high rejection | Low-ΔP variants for fouling |
| ESPA1 / ESPA2 / ESPA4 | Energy saving | Low pressure, tap/municipal |
| PRO-XS / PRO-XR | Industrial | Lifecycle / robustness |

### 3.3 Toray, Suez/Veolia, LANXESS

| Vendor | Series | Notes |
|---|---|---|
| Toray | TM820V/M (seawater), TMG20D (brackish low-energy), TM720D (tap) | TM820V-400: 99.8 % @ 32 000 ppm, 800 psi |
| Suez/Veolia | AG / AK / AD / AE; **GenGard** antiscalant | AG8040F: ~11 000 GPD, 99.5 % |
| LANXESS | Lewabrane B400 HR / B440 HR / ULP / ASD | B400 HR: 37.9 m³/d, 99.7 % rejection |
| LG Chem | NanoH2O | Variable operating windows |

### 3.4 Universal vendor envelope (all polyamide TFC)

| Parameter | Limit | Damage mode if exceeded |
|---|---|---|
| Max pressure SWRO | 83 bar (1 200 psi) | Compaction; glue-line failure |
| Max pressure BWRO | 41 bar (600 psi) | Same |
| Max ΔP per element | 1 bar (15 psi) | Telescoping |
| Max ΔP per vessel | 3.5 bar (50 psi) | Same |
| Max temperature | 45 °C continuous; 35 °C above pH 10 | Compaction, hydrolysis |
| pH range continuous | 2–11 | Hydrolysis outside |
| pH range CIP | 1–13 (short-term) | |
| Free chlorine | **< 0.1 ppm** (effectively zero) | Oxidative attack |
| Other oxidants (O₃, MnO₄⁻, peroxide) | Not tolerated | Same |
| Max SDI₁₅ feed | 5 (3 preferred) | Colloidal fouling |
| Max turbidity feed | 1 NTU | |

---

## §4 — Water Chemistry Essentials

### 4.1 Conductivity / TDS quick reference (25 °C)

| Water type | TDS (mg/L) | Conductivity (µS/cm) |
|---|---|---|
| Seawater (open ocean) | 32 000–38 000 | 50 000–58 000 |
| Mediterranean / Red Sea | 38 000–43 000 | 58 000–65 000 |
| High brackish | 5 000–15 000 | 7 000–22 000 |
| Low brackish / well | 1 000–5 000 | 1 500–7 500 |
| Tap (municipal) | 100–500 | 150–750 |
| 1st-pass RO permeate (SW feed) | 200–500 | 300–800 |
| 1st-pass RO permeate (BW feed) | 10–50 | 15–80 |
| 2nd-pass RO permeate | 1–5 | 1.5–8 |
| Mixed-bed DI / EDI product | < 0.1 | < 0.1 |
| USP PW limit (Stage 1) | — | ≤ 1.3 |
| 18.2 MΩ·cm UPW | < 0.06 | **0.055** (theoretical limit) |

Conversion rule (NaCl-dominated): `TDS [ppm] ≈ 0.64 × κ [µS/cm]` for brackish; 0.55–0.70 for seawater.

### 4.2 Typical seawater ion composition (mg/L)

| Ion | Atlantic | Mediterranean | Red Sea |
|---|---|---|---|
| Na⁺ | 10 800 | 12 700 | 13 500 |
| Cl⁻ | 19 400 | 22 900 | 24 100 |
| SO₄²⁻ | 2 700 | 3 200 | 3 400 |
| Mg²⁺ | 1 290 | 1 480 | 1 590 |
| Ca²⁺ | 410 | 470 | 510 |
| K⁺ | 390 | 470 | 500 |
| HCO₃⁻ | 142 | 150 | 165 |
| Br⁻ | 67 | 76 | 80 |
| Sr²⁺ | 8 | 9 | 13 |
| B (total) | 4.5 | 5.2 | 6.5 |
| **TDS** | **35 200** | **41 500** | **44 000** |

### 4.3 pH effects on rejection (pKa-driven)

| Species | pKa @ 25 °C | Practical impact |
|---|---|---|
| **Boron** (H₃BO₃ ⇌ B(OH)₄⁻) | 9.14–9.24 | 85–92 % @ pH 8 → > 98 % @ pH 10.5. **Double-pass with high-pH 2nd pass** is the industry standard for SWRO boron removal |
| **Silica** (H₄SiO₄ ⇌ H₃SiO₄⁻) | 9.84 | Higher pH → higher rejection but raises scaling risk |
| **Ammonia** (NH₄⁺ ⇌ NH₃) | 9.25 | Below pKa: 95 % rejection; above pKa: NH₃ passes (DW concern) |
| **CO₂ / HCO₃⁻ / CO₃²⁻** | 6.35 / 10.33 | At pH < 7 dominated by CO₂ which passes freely; **dose NaOH after RO** to convert to HCO₃⁻ before EDI |

### 4.4 SDI interpretation (ASTM D4189-23)

| SDI₁₅ | Interpretation | Action |
|---|---|---|
| < 1 | Excellent | Years between fouling events |
| 1–3 | Acceptable | Months between CIP |
| 3–5 | Marginal | Frequent CIP likely; consider UF |
| > 5 | Unacceptable | UF / coagulation / multimedia required |

Caveat: SDI is filter-brand-dependent; Modified Fouling Index (MFI) is more rigorous.

### 4.5 Free chlorine / ORP

- Polyamide TFC tolerance: < 0.1 ppm free Cl₂ continuous
- ORP target after dechlorination: **< 200 mV** at RO inlet (some specs < 150 mV)
- SBS (sodium bisulfite) dosing: **1.46 mg per mg Cl₂** stoichiometric; practical **1.8–3.0 mg/mg** (1.5–2.5× excess)
- Cumulative dose damage tracked in ppm·h — see `membrane-troubleshooting` §3

### 4.6 Scaling indices

**LSI (Langelier)** — for TDS < 10 000 mg/L (ASTM D3739-19):
```
LSI = pH_actual − pH_s
pH_s = (9.3 + A + B) − (C + D)
  A = f(TDS)
  B = f(T)
  C = f(Ca²⁺ hardness)
  D = f(alkalinity)
```
LSI > 0 → CaCO₃ scaling tendency. Target: LSI(concentrate) < 0 without antiscalant; < +1.8 with effective inhibitor; up to +2.5 with strong dosing.

**S&DSI (Stiff & Davis)** — for TDS > 10 000 mg/L (ASTM D4582):
```
S&DSI = pH − pK2 + pKs − p[Ca²⁺] − p[HCO₃⁻]
```
Same interpretation as LSI; targets typically < +1.0 with antiscalant.

⚠️ Saturation indices must be computed at the **concentrate** (last element), not feed — the concentrate is where supersaturation actually occurs.

---

## §5 — EDI Quick Reference

### 5.1 EDI feed envelope

| Parameter | Target | Hard limit |
|---|---|---|
| Conductivity / FCE | < 30 µS/cm preferred | **< 40 µS/cm** |
| Total hardness (as CaCO₃) | < 1 ppm | < 2 ppm (softener required above) |
| Total CO₂ (CO₂ + HCO₃⁻ + CO₃²⁻) | < 5 ppm | < 10 ppm (NaOH dosing / degasser) |
| Silica (SiO₂) | < 0.5 ppm | < 1 ppm |
| TOC | < 0.5 ppm | < 1 ppm |
| Fe / Mn | < 0.01 ppm each | < 0.05 ppm |
| Free chlorine | **< 0.02 ppm** | (destroys resin) |
| Temperature | 10–40 °C standard; 60 °C HWS modules | 5–45 °C |
| Inlet pressure | ≤ 7 bar (100 psi) | mechanical limit |

### 5.2 EDI product targets by application

| Application | Conductivity | Resistivity | Standard |
|---|---|---|---|
| Pharma PW | ≤ 1.3 µS/cm @ 25 °C | ≥ 0.77 MΩ·cm | USP <645> Stage 1 |
| Pharma WFI | ≤ 1.3 µS/cm + TOC ≤ 0.5 ppm + endotoxin ≤ 0.25 EU/mL | — | Ph. Eur. 0169 / USP WFI |
| Power-plant UPW | 0.1–1 µS/cm | 1–10 MΩ·cm | ASME / EPRI |
| Semiconductor UPW | < 0.055 µS/cm | **18.18 MΩ·cm** (theoretical) | SEMI F63 |

### 5.3 Feed Conductivity Equivalent (FCE)

The manufacturer-standard load metric for EDI sizing — combines conductivity with the ionic load contributed by weak acids when ionized inside the stack:

```
FCE [µS/cm] = κ + 2.79 · CO₂[ppm] + 1.94 · SiO₂[ppm]
```

where:
- `κ` = measured feed conductivity (µS/cm)
- `CO₂` = **total** carbonate (CO₂ + HCO₃⁻ + CO₃²⁻) as ppm CO₂
- `SiO₂` = total silica (reactive + colloidal)

Target: FCE 1–5 µS/cm for two-pass RO + EDI to UPW; **FCE ≤ 40 µS/cm** is the EDI feed limit (stack-dependent 25–43).

⚠️ Coefficient note: some methodologies use 2.66 for CO₂; **2.79 is the SnowPure/E-Cell convention** — pick one and be consistent.

💡 EDI alerts that compare against raw `feed_conductivity` miss CO₂/SiO₂ load and silently allow off-spec operation. Always compute FCE.

---

## §6 — Bilingual IT/EN Glossary

### 6.1 Process KPIs

| EN | IT | Note |
|---|---|---|
| Recovery | Recupero (Y) | Fraction or %, never raw flow |
| Rejection | Reiezione (R) | Three flavors: observed / system / intrinsic |
| Salt passage (SP) | Passaggio salino | SP = 1 − R |
| Permeate flux | Flusso del permeato (Jw) | LMH (EU) / GFD (US) |
| Salt flux | Flusso salino (Js) | Sets Cp at given Jw |
| Net Driving Pressure (NDP) | Pressione netta motrice | Apply gauge pressures consistently |
| Concentration factor (CF) | Fattore di concentrazione | 1/(1−Y) shortcut |
| Specific energy consumption (SEC) | Consumo energetico specifico | kWh/m³ |
| Normalized permeate flow (NPF) | Portata permeato normalizzata | ASTM D4516 |
| Normalized salt passage (NSP) | Passaggio salino normalizzato | ASTM D4516 |
| Temperature correction factor (TCF) | Fattore di correzione temperatura | Exponential form, Ke per membrane |
| Concentration polarization (β) | Polarizzazione di concentrazione | Wall/bulk ratio |
| Differential pressure (ΔP) | Perdita di carico | Per element / vessel / stage |

### 6.2 Phenomena

| EN | IT |
|---|---|
| Fouling | Sporcamento / fouling |
| Scaling | Incrostazione |
| Biofouling | Bioincrostazione |
| Compaction | Compattazione |
| Concentration polarization | Polarizzazione di concentrazione |
| Breakthrough | Sfondamento / breakthrough |
| Hydrolysis | Idrolisi |
| Oxidation | Ossidazione |
| Telescoping | Telescopamento (anglicismo accettato) |
| Channeling | Channeling (anglicismo) |

### 6.3 Components

| EN | IT |
|---|---|
| Skid | Skid / pacchetto pre-assemblato |
| Train | Treno (impianto) |
| Element (membrane element) | Elemento (a membrana) |
| Pressure vessel (PV) | Recipiente in pressione |
| Stage | Stadio |
| Pass | Passaggio |
| Feed spacer | Spaziatore di feed |
| Permeate channel / carrier | Canale del permeato |
| Header / manifold | Collettore |
| Energy Recovery Device (ERD) | Recuperatore di energia (Pelton / PX / DWEER) |
| High-pressure pump (HPP) | Pompa di alta pressione |
| Booster pump | Pompa di rilancio |
| Antiscalant | Antincrostante / antiscalante |
| Dechlorinator (SMBS) | Dechlorante / metabisolfito di sodio |
| Cartridge filter | Filtro a cartuccia |

### 6.4 Operations

| EN | IT |
|---|---|
| CIP (Cleaning In Place) | Lavaggio in posto / CIP |
| Flushing | Lavaggio / flussaggio |
| Sanitization | Sanitizzazione |
| Standby / preservation | Conservazione / messa in standby |
| Set-point | Set-point / valore di consegna |
| Trip / shutdown | Arresto di emergenza |
| Commissioning | Messa in servizio |
| Performance test | Test di prestazione |
| Autopsy | Autopsia (membrana) |
| Ramp-up | Avviamento progressivo (≤ 0.7 bar/s) |

### 6.5 Regulatory

| EN | IT |
|---|---|
| Purified Water (PW) | Acqua purificata |
| Water For Injection (WFI) | Acqua per preparazioni iniettabili |
| Highly Purified Water (HPW) | Acqua altamente purificata (Ph. Eur. historical) |
| Drinking water | Acqua potabile / per consumo umano |
| Reclaimed water | Acqua riutilizzata / di riuso |
| Endotoxin | Endotossina (EU/mL; LAL test) |
| Bioburden | Carica microbica (CFU/mL) |
| Total Organic Carbon (TOC) | Carbonio organico totale |

---

## Sources

Primary normative — ASTM D4516-19a, D6161-19, D4189-23, D3739-19, D4582, D3923, D4194-23, D6908; ISO 16075-1..4; USP <645>, <643>; Ph. Eur. 0008, 0169 (Suppl. 9.1 effective 2017-04-01), chapter 2.2.44 (effective 2026-07-01); WHO GDWQ 4th ed. (2022 + addenda); EN 1717:2025; EN 12952-12; 21 CFR Part 11; EU Annex 11; SEMI F63:2021.

Vendor manuals — DuPont FilmTec 45-D01504, 45-D01580, 45-D01588, 45-D01591, 45-D01616, 45-D01695 (Rev 14 Feb 2026); Hydranautics TSB 100, 105, 107.28 (Apr 2025), 108, 110, 111, 113, 124, 207, 414; Toray RO Brochure 2024; LANXESS Lewabrane datasheets; LG Chem NanoH2O.

Reference — Lenntech RO chemistry pages; Stark-Water *RO Working Principle*; Pitzer vs Van't Hoff comparison (Tandfonline 2019); EMA Q&A on non-distillation WFI; PharmOut on Ph. Eur. 0169 (2017); FDCELL on chapter 2.2.44 (2026-07).
