---
name: membrane-troubleshooting
description: RO/NF membrane diagnostic methodology — fouling taxonomy (colloidal, biofouling, organic, particulate), scaling by mineral species (CaCO3/CaSO4/BaSO4/SrSO4/SiO2/CaF2/Fe-Mn), integrity loss (O-ring, breach, chlorine oxidation, telescoping), chemical/operational failures, CIP decision matrix, ASTM D4516 trend-based diagnostics, baseline establishment, and decision-tree pseudo-code. Use when analyzing RO/NF plant data to identify root cause of performance deviation.
user-invocable: false
---

# RO/NF Troubleshooting & Diagnostic Methodology

Scope: spiral-wound thin-film-composite (TFC) polyamide RO/NF elements (8" standard + 4" variants). Numeric thresholds carry vendor + year of source.

Convention markers:
- `⚠️` — likely bug or incorrect assumption in calling code; highest priority
- `💡` — enhancement opportunity (new alert, new state, refined threshold)

---

## §0 — Diagnostic Frame of Reference

### 0.1 Five orthogonal failure modes

Every observed deviation must be classified into one (or more) of:

1. **Fouling** — reversible / partially reversible accumulation (colloidal, biological, organic, particulate)
2. **Scaling** — supersaturation-driven mineral precipitation, mostly in tail/concentrate stages
3. **Integrity loss** — physical breach of active polyamide layer or seal (O-ring, glue line, telescoping, pinhole)
4. **Mechanical compaction / chemical hydrolysis** — pressure-driven densification (largely irreversible); polyamide hydrolysis outside pH 2–11
5. **Instrumental / operational error** — out-of-cal flow meter, conductivity probe drift, dosing pump miscount, baseline never re-established after element swap

### 0.2 ASTM D4516 — the three observables

| Variable | Symbol | Direction of concern | Typical noise band |
|---|---|---|---|
| Normalized permeate flow | NPF | decreasing | ±3 % |
| Normalized salt passage | NSP | increasing | ±5 % |
| Normalized ΔP (feed → concentrate) | ΔPn | increasing | ±5 % |

### 0.3 Canonical signature table

Combines DuPont 45-D01650 troubleshooting matrix + Hydranautics TSB 107 logic + WaterTechOnline normalization article:

| NPF | NSP | ΔPn | Stage affected | Most likely root cause |
|---|---|---|---|---|
| ↓ | → / slight ↑ | ↑ | First stage | Colloidal / particulate fouling (front end) |
| ↓ | ↑ | ↑↑ | Tail stage | Advanced scaling (CaCO₃ / CaSO₄ / BaSO₄) |
| ↓ | ↑ | ↑ | All stages | Biofouling (channel plugging by biofilm) |
| ↓ | → | → / slight ↑ | All stages | Compaction or organic NOM adsorption |
| → / slight ↓ | ↑↑ | → | Localised (one vessel) | O-ring leak / element breach / glue-line crack |
| ↑ | ↑↑ | → | All stages | Chlorine oxidation (PA degradation, RO → NF drift) |
| → | → | ↑ | First stage | Mechanical / feed-spacer plugging, no membrane impact |
| ↓↓ | ↑ | → | One vessel | Telescoping in that vessel |
| inconsistent | inconsistent | inconsistent | — | Suspect instrumentation first; run mass balance |

### 0.4 Mass balance sanity check

Before any diagnosis:
```
|Qf − (Qp + Qc)| / Qf  <  0.02      # within 2 %
```
A 5 % error in recovery shifts scale-potential calculations dramatically.

💡 No mass-balance closure check is the **#1 cause of phantom alerts** from instrument drift. Add this check before any rule evaluation; halt diagnosis if it fails.

---

## §1 — Fouling Taxonomy

### 1.1 Colloidal fouling

- **Definition** — sub-µm inorganic / mixed particles (silt, clays, Fe/Al hydroxides) too small to settle
- **Predictor** — SDI₁₅ (ASTM D4189-23): < 3 acceptable; 3–5 frequent CIP; > 5 needs MF/UF upstream. Vendors recommend SDI₁₅ < 4
- **Signature** — NPF↓ first stage, ΔP↑ lead element, NSP stable
- **Cleaning** — alkaline (pH 11–12, NaOH + EDTA + anionic surfactant) first; acid (HCl/citric, pH 2–3) only if Fe/Al hydroxide confirmed

### 1.2 Biofouling

- **Definition** — biofilm (EPS matrix + bacteria) on membrane and feed spacer
- **Predictors** — AOC (assimilable organic carbon): biofilm-free risk threshold ~1 µg/L; conventional treatment achieves 50–100 µg/L (Pereira et al. 2014, PMC4021920). ATP, BFR, rising SDI without particulate cause
- **Signature** — NPF↓, ΔP↑ over weeks, slight NSP↑; autopsy shows slime mat on lead-element feed face
- **Cleaning** — alkaline NaOH (pH 11–12) + EDTA + surfactant, then non-oxidizing biocide soak. **Never** free chlorine for in-service biocide on PA membranes
- **DBNPA dosing** (industry consensus, IWA AQUA 2022; Feedwater datasheet):
  - Online maintenance: 10–50 mg/L for ≥ 1 h, weekly
  - CIP additive: 50–200 mg/L circulated 1–3 h
  - Continuous preventive: ~1 mg/L (where allowed)
  - Bisulfite upstream consumes DBNPA → increase dose
- Other accepted non-oxidizers: isothiazolinone (CMIT/MIT), glutaraldehyde for storage. See Hydranautics TSB 110

### 1.3 Organic fouling (NOM)

- **Definition** — natural organic matter (humics, fulvics), hydrophobic adsorption on PA surface
- **Signature** — NPF↓, NSP stable or slight ↑, ΔP → (no spacer plugging until late)
- **Cleaning** — alkaline NaOH pH 11–12 + EDTA chelant + surfactant (DuPont 45-D01504 default rule for unknown / combined fouling)

### 1.4 Particulate fouling

- **Definition** — > 1 µm material from failed pretreatment (cartridge bypass, blown media filter)
- **Diff vs colloidal** — visible deposit on cartridge filter; rapid ΔP rise on lead element only
- **Cleaning** — flush forward at high crossflow; alkaline CIP if needed

### 1.5 Combined fouling (most common in practice)

DuPont 45-D01504 rule: **alkaline cleaning as the first step** for unknown / combined; acid only when CaCO₃ or Fe/Mn hydroxide is confirmed.

Sequence:
1. Alkaline (NaOH + EDTA + surfactant), pH 11–12, T ≤ 35 °C above pH 10
2. Flush to neutral pH with permeate-quality water
3. Acid (HCl, citric, or sulfamic), pH 2–3, T ≤ 35 °C
4. Optional biocide soak (DBNPA 50–200 mg/L, 1–3 h)

⚠️ Never mix caustic and acid in the same loop (Hydranautics TSB 107).

---

## §2 — Scaling by Mineral Species

Solubility products at 25 °C cross-checked against Hydranautics TAB-111, DuPont 45-D01552, and standard chemistry tables.

| Species | Ksp (25 °C) | Saturation metric | Antiscalant family | Cleaning chemistry |
|---|---|---|---|---|
| **CaCO₃** (calcite) | 3.4 × 10⁻⁹ | LSI < 0 (no AS); ≤ +2.5 with AS; S&DSI for TDS > 10 000 ppm | Phosphonate (HEDP, PBTC, ATMP) | HCl or citric, pH 2–3, ≤ 35 °C |
| **CaSO₄·2H₂O** (gypsum) | 4.93 × 10⁻⁵ | IP/Ksp < 230 % (no AS); < 400 % with AS | Phosphonate + polyacrylate / sulfonated copolymer | EDTA-tetra-Na pH ~11, T 30–35 °C; long soak |
| **BaSO₄** (barite) | 1.08 × 10⁻¹⁰ | IP/Ksp < 6 000 % with strong AS | Phosphonate (DTPMP) + sulfonate polymer | Practically irreversible — EDTA hot soak partial; usually replace |
| **SrSO₄** (celestite) | 3.44 × 10⁻⁷ | IP/Ksp < 800 % with AS | Phosphonate + polyacrylate | EDTA + Na-citrate hot, slow |
| **SiO₂** (amorphous) | — | Solubility ≈ 100–150 mg/L @ 25 °C neutral pH; up to 250–300 traditional, 400–600 with dispersants | Polymeric dispersants (PEG/PVA/PAM) | Alkaline pH > 11 + fluoride (NH₄F or NaF); often autopsy/replace |
| **CaF₂** | 3.45 × 10⁻¹¹ | rare except geothermal/industrial | Phosphonate | Strong acid HCl, hot |
| **Fe(OH)₃ / Mn(OH)x** | low | Fe feed < 0.05 mg/L; Mn < 0.02 mg/L | Phosphonate + dispersant; better prevent via reduced Fe upstream | Citric acid + ammonia (pH 4), or Na₂S₂O₄ reductive clean |

### 2.1 Saturation calculations

**LSI** (low TDS): `LSI = pH − pH_s`; pH_s depends on Ca²⁺, alkalinity, TDS, T. LSI > 0 ⇒ CaCO₃ supersaturated.

**S&DSI** (TDS > 10 000 ppm): same logic, ionic-strength corrected.

**Sulfate scales / silica**: use ion-product / Ksp ratio: `S = IP/Ksp`. Vendor projection tools (ROSA, IMSdesign, WAVE, ROProMax) compute these per stage.

⚠️ Compute always at the **concentrate** (last element). LSI at feed is meaningless for scaling prediction.

---

## §3 — Membrane Integrity Loss

### 3.1 O-ring failure

- **Location** — interconnector between elements; permeate-tube to vessel end-adapter
- **Signature** — sudden NSP↑ localized to **one vessel**, NPF and ΔP unchanged
- **Detection** — conductivity profiling (Toray "Probing" white-paper); Rhodamine WT dye test
- **Repair** — replace O-ring; rebuild dry, light glycerin to seat. Do **not** use petroleum grease (attacks EPDM and PA)

### 3.2 Breach / pinhole

- **Detection methods**:
  - **VDT** (Vacuum Decay Test, ASTM D6908) — primary for RO/NF
  - **PDT** (Pressure Decay Test) — for MF/UF
  - Bubble test at 3–5 psig with submerged element
  - **Rhodamine WT dye** under pressure: diffuse pattern = chemical attack; localized = mechanical
- **Threshold for autopsy** — industry rule of thumb: salt rejection drop > 10 % vs baseline, or sharp ΔP rise. Always autopsy at least one representative element before discarding

### 3.3 Chlorine oxidation of polyamide

Cumulative dose metric: **ppm·h of free chlorine exposure**.

Literature consensus (Gohil & Suresh 2019, Desalination 457:133; vendor literature):
- **Onset of measurable degradation**: ~200 ppm·h
- **Severe degradation**: ~1 000 ppm·h
- SWRO membranes (denser, higher MPD crosslink) generally more tolerant than BWRO
- At very high cumulative exposure (thousands of ppm·h) PA RO can transform toward NF-like behavior (rejection drop, flux rise)

⚠️ Specific values like "2 640 / 6 200 ppm·h" sometimes seen in process literature are **not directly confirmed** by the primary Gohil paper; use the 200 onset / ~1 000 severe range as the defensible cited band, and note SWRO/BWRO/PA-density dependence.

Vendor rule: all manufacturers (DuPont, Hydranautics, Toray) specify "no detectable free chlorine in feed" (< 0.1 mg/L) for warranty.

Mechanism: N-chlorination of PA amide → Orton rearrangement → ring chlorination → loss of crosslink → flux ↑ and rejection ↓.

💡 Track cumulative chlorine exposure as a running ppm·h counter in a `cumulative_exposure` table. This is essential for lifecycle decisions (replace vs continue) and is invisible to instantaneous KPI checks.

### 3.4 Mechanical damage

- **Telescoping** — axial spacer/membrane migration. Causes: pressure shock (water hammer); excessive ΔP per element (> 15 psi normalized; > 50 psi destructive); missing/failed ATD (Anti-Telescoping Device). Pressurization rate limit: **≤ 10 psi/s (≈ 0.69 bar/s)** at start-up
- **Glue-line crack** — same shock causes; dye test shows linear pattern at glue line
- **Abrasion** — feed sand/grit; visible signs on lead-element feed end at autopsy

### 3.5 Autopsy decision matrix

Trigger when any one of:
- Salt rejection drop > 10 % vs baseline persisting after 2 CIPs
- ΔPn rise > 25 % not recovered by CIP
- NPF decline > 25 % not recovered by CIP
- Unexplained instrument disagreement after calibration
- End-of-warranty diagnostic to claim manufacturing defect

---

## §4 — Chemical / Operational Failures

### 4.1 Free chlorine breakthrough

- **Causes** — SBS pump failure, GAC bed exhausted, chloramine breakthrough not detected by ORP (chloramines have low ORP signal)
- **Monitoring** — ORP < 200 mV after dechlorination (some target < 150 mV); redundant DPD colorimetric
- **SBS stoichiometry** — 1.46 mg NaHSO₃ per mg Cl₂ (theoretical); practical 1.5–2.5× theoretical = **1.8–3.0 mg/mg**
- **Side effect** — chronic SBS overdose with dissolved Cu/Co catalyses oxidant generation under O₂ → unintended PA attack

### 4.2 pH excursion

PA operating window: **pH 2–11 continuous; 1–12 short CIP** (most vendor datasheets; DuPont 45-D04358).

Out-of-range hydrolysis → permanent rejection loss.

### 4.3 Temperature excursion

- Max continuous: **45 °C / 113 °F** at pH ≤ 10
- Above pH 10: **35 °C / 95 °F** max
- Above 45 °C: accelerated hydrolysis + compaction

### 4.4 Pressure shock / water hammer

- Slow pressurization (≤ 10 psi/s); install soft-start VFD or air-loaded accumulator; check valve on permeate
- Per-element ΔP cap: normalized ΔP per 6-element vessel ≈ 15 psi typical; > 50 psi induces telescoping

---

## §5 — Diagnostic Decision Logic

Pseudo-code consuming an `RODataPoint` (current readings) + a `Baseline` (commissioning-normalized values) + cumulative exposure counters:

```python
@dataclass
class RODataPoint:
    Qf: float; Qp: float; Qc: float          # m3/h
    Cf: float; Cp: float                     # µS/cm or ppm
    Tf: float                                # °C
    P_feed: float; P_perm: float; P_conc: float  # bar
    timestamp: datetime
    stage: int = 1

@dataclass
class Baseline:
    NPF0: float; NSP0: float; dPn0: float    # normalized at t0
    R0: float; Tref: float = 25.0

def diagnose(now: RODataPoint, base: Baseline,
             cumulative_Cl_ppmh: float = 0.0,
             cumulative_T_above_45_h: float = 0.0) -> list[Diagnosis]:
    findings = []

    # Step 0 — instrumentation sanity
    if abs(now.Qf - (now.Qp + now.Qc)) / now.Qf > 0.02:
        findings.append(Diagnosis("instrument", conf=0.9,
            note="Mass balance fails > 2 %; calibrate before diagnosing membrane."))
        return findings  # halt: trust nothing else until fixed

    # Step 1 — normalize per ASTM D4516
    NPF = normalize_permeate_flow(now, base.Tref)
    NSP = normalize_salt_passage(now, base.Tref)
    dPn = normalize_dp(now, base.Tref)

    dNPF = (NPF - base.NPF0) / base.NPF0
    dNSP = (NSP - base.NSP0) / base.NSP0
    ddP  = (dPn - base.dPn0) / base.dPn0

    # Step 2 — cumulative-exposure overrides
    if cumulative_Cl_ppmh > 200:
        findings.append(Diagnosis("chlorine_oxidation",
            conf=min(1.0, cumulative_Cl_ppmh / 1000),
            note=f"PA degradation likely; {cumulative_Cl_ppmh:.0f} ppm·h ≥ 200 onset"))

    # Step 3 — signature matching (ASTM D4516 triple)
    if dNPF < -0.15 and ddP > 0.15 and abs(dNSP) < 0.05:
        if first_stage_dominates(now):
            findings.append(Diagnosis("colloidal_or_particulate", conf=0.8))
        else:
            findings.append(Diagnosis("biofouling", conf=0.6))

    if dNPF < -0.10 and dNSP > 0.10 and ddP > 0.15 and tail_stage_dominates(now):
        findings.append(Diagnosis("scaling_advanced", conf=0.85,
            note="Run LSI / S&DSI / SO4·Ba / Sr Ksp on concentrate."))

    if abs(dNPF) < 0.05 and dNSP > 0.15 and abs(ddP) < 0.05:
        findings.append(Diagnosis("integrity_loss", conf=0.8,
            note="Conductivity-profile vessels; expect O-ring or seal."))

    if dNPF > 0.05 and dNSP > 0.15 and abs(ddP) < 0.10:
        findings.append(Diagnosis("oxidative_degradation", conf=0.85))

    if dNPF < -0.10 and abs(dNSP) < 0.05 and abs(ddP) < 0.05:
        if uniform_across_stages(now):
            findings.append(Diagnosis("compaction_or_NOM_adsorption", conf=0.6))

    # Step 4 — timescale modifier
    if dNSP > 0.10 and is_sudden(now, base, hours=24):
        upgrade_confidence(findings, "integrity_loss", +0.15)
    if dNSP > 0.05 and is_gradual(now, base, days=30):
        upgrade_confidence(findings, "oxidation_or_fouling", +0.1)

    return sorted(findings, key=lambda d: -d.conf)
```

Branching rules encoded above:
- Mass balance fails → instrumentation first; halt
- Sudden change (< 24 h) of rejection → leak / integrity
- Gradual change (weeks) of rejection → cumulative oxidation or fouling
- First-stage flux loss only → upstream fouling (colloid, NOM, bio)
- Tail-stage loss with rising salt → scaling
- Uniform across stages → compaction or systemic oxidation

---

## §6 — CIP Decision Matrix

### 6.1 Trigger criteria (industry consensus)

From WaterTechOnline 14171304; Hydranautics TSB 107; DuPont 45-D01696:
- NPF decline ≥ **10–15 %** below baseline
- NSP increase ≥ **5–15 %** above baseline
- ΔPn increase ≥ **15 %** above baseline (some sources 15–25 %; don't wait past 25 % — foulant turns irreversible)

### 6.2 Chemistry selection

| Foulant identified | First step | Recipe | pH | T (max) | Time |
|---|---|---|---|---|---|
| Inorganic scale (CaCO₃, Fe/Mn) | Acid | HCl to pH 2–3 (or 2 wt % citric, 0.2 wt % sulfamic) | 2–3 | 35 °C | 1–4 h |
| Organic / biofilm / colloidal | Alkaline | NaOH to pH 11–12 + Na₄-EDTA 1 wt % + Na-DSS surfactant 0.025 wt % | 11–12 | 35 °C | 1–4 h |
| Combined (default) | **Alkaline first, then acid** | as above, with full intermediate flush | — | — | — |
| Biofilm (after alkaline) | Biocide soak | DBNPA 50–200 mg/L | feed pH | < 35 °C | 1–3 h |
| Silica | Alkaline + fluoride (NH₄F) | vendor-specific | > 11 | 35 °C | hours |
| Sulfate scale (gypsum) | Alkaline EDTA | Na₄-EDTA 2 wt %, NaOH pH 11 | 11 | 30–35 °C | hours; long soak |

### 6.3 Per-element CIP flow rate

| Element diameter | Flow per vessel (gpm) | (m³/h) |
|---|---|---|
| 4" | 8–10 | 1.8–2.3 |
| 8" | 35–45 | 8–10 |
| 16" | 140–180 | 32–41 |

ΔP **during** CIP must stay below ~10 psi per element; exceeding telescopes.

### 6.4 When CIP does NOT help (autopsy / replace)

- Chlorine oxidation: damage cumulative; no chemistry restores PA
- Mineral scale cemented (typically Ba/Sr sulfate): EDTA partial at best
- Mechanical telescoping or glue-line crack
- Hydrolysis from pH excursion

---

## §7 — Data-Driven Trending

### 7.1 Baseline establishment (ASTM D4516)

- Record after 24–48 h stable operation post-startup or post-CIP
- Hold feed T, P, recovery, conductivity constant during baseline window
- NPF, NSP, ΔPn become the **t0** anchor; persist to DB
- Re-baseline after every element swap

### 7.2 Signal-to-noise

| KPI | Typical noise | Action threshold (% from baseline) |
|---|---|---|
| NPF | ±3 % | −10 % review, −15 % CIP |
| NSP | ±5 % | +10 % review, +15 % CIP, +25 % autopsy candidate |
| ΔPn | ±5 % | +15 % CIP, +25 % urgent |

### 7.3 Why snapshots mislead

- Feed-T drift: each +1 °C ≈ +3 % permeate flow → masks fouling
- Recovery drift: 5 % recovery change shifts LSI/S&DSI by tenths
- Dosing-pump cycles (antiscalant ± 10 % short term) affect tail-stage rejection

### 7.4 Suggested SQLite schema

```sql
CREATE TABLE baselines (
  id INTEGER PRIMARY KEY,
  train_id TEXT, stage INTEGER,
  ts_utc TEXT,
  NPF0 REAL, NSP0 REAL, dPn0 REAL,
  R0 REAL, Tref REAL DEFAULT 25.0
);

CREATE TABLE readings (
  id INTEGER PRIMARY KEY,
  train_id TEXT, stage INTEGER, ts_utc TEXT,
  Qf REAL, Qp REAL, Qc REAL,
  Cf REAL, Cp REAL,
  Tf REAL, P_feed REAL, P_perm REAL, P_conc REAL,
  NPF REAL, NSP REAL, dPn REAL   -- pre-computed
);

CREATE TABLE cumulative_exposure (
  train_id TEXT PRIMARY KEY,
  cl_ppmh REAL DEFAULT 0,          -- running ppm·h free chlorine
  t_above_45c_h REAL DEFAULT 0,    -- hours above 45 °C
  pressure_cycles INTEGER DEFAULT 0,
  ph_excursions_below_2 INTEGER DEFAULT 0,
  ph_excursions_above_11 INTEGER DEFAULT 0,
  last_update TEXT
);

CREATE TABLE cip_events (
  id INTEGER PRIMARY KEY, train_id TEXT,
  ts_start TEXT, ts_end TEXT,
  chemistry TEXT, pH REAL, T REAL,
  trigger_metric TEXT,
  pre_NPF REAL, post_NPF REAL,
  pre_NSP REAL, post_NSP REAL,
  pre_dPn REAL, post_dPn REAL,
  notes TEXT
);
```

💡 The `cumulative_exposure` and `cip_events` tables are essential for any **lifecycle advisor** that recommends CIP vs replace based on long-horizon history.

---

## §8 — Bilingual Glossary (Troubleshooting Terms)

| EN | IT |
|---|---|
| scaling | incrostazione (minerale) |
| fouling | sporcamento |
| biofouling | bioincrostazione |
| colloidal fouling | sporcamento colloidale |
| autopsy (of element) | autopsia membrana |
| pinhole | foro puntiforme / micro-foro |
| breach | lesione / breccia |
| telescoping | telescopamento |
| anti-telescoping device (ATD) | dispositivo anti-telescopaggio |
| O-ring | guarnizione O-ring / anello di tenuta |
| glue line | linea di incollaggio |
| feed spacer | spaziatore lato alimentazione |
| permeate carrier | spaziatore lato permeato |
| integrity (test) | (test di) integrità |
| breakthrough (chlorine) | passaggio / breakthrough (cloro) |
| dechlorination | declorazione |
| compaction | compattazione |
| hydrolysis | idrolisi |
| crossflow | flusso tangenziale |
| recovery (%) | recupero (%) |
| rejection (%) | reiezione (%) |
| salt passage | passaggio salino |
| normalized permeate flow (NPF) | portata permeato normalizzata |
| normalized differential pressure (ΔPn) | perdita di carico normalizzata |
| CIP (Cleaning In Place) | lavaggio in posto / CIP |
| antiscalant | antincrostante |
| biocide (non-oxidizing) | biocida (non ossidante) |
| baseline | linea di riferimento iniziale |
| commissioning | messa in marcia / commissioning |
| profiling / probing | profilatura / sondaggio (conduttività) |

---

## Sources

- ASTM **D4516-19a** Standardizing RO Performance Data
- ASTM **D6908** Integrity Testing of Water Filtration Membrane Systems
- ASTM **D3923** Detecting Leaks in RO and NF Devices
- ASTM **D4189-23** Silt Density Index
- Hydranautics **TSB 107.28** (Apr 2025) — foulants & cleaning, TCF
- Hydranautics **TSB 108** — chlorination/dechlorination
- Hydranautics **TSB 110** — biocides and storage
- Hydranautics **TSB 111** — biofouling
- Hydranautics **TSB 124** — VDT and integrity
- Hydranautics **TAB-111** — chemical pretreatment for RO/NF
- DuPont FilmTec **45-D01504** Tech Manual; **45-D01650** Symptoms of Trouble; **45-D01696** Rev 13 Cleaning Procedures (Feb 2026); **45-D04358** Temperature & pH Best Practices; **45-D01616** Plant Performance Normalization; **45-D01552** CaCO₃ Scale Prevention; **45-D01569** Chlorination/Dechlorination
- **Gohil & Suresh 2019**, Desalination 457:133 — free chlorine exposure tolerance
- **Pereira et al. 2014**, PMC4021920 — biofouling review
- AWWA RF — Guidance Manual for Disposal of Chlorinated Water (SBS stoichiometry)
- WaterTechOnline article 14171304 — Membrane Cleaning Fundamentals
- Toray *Probing* white-paper — vessel conductivity profiling
- Avista / American Water Chemicals autopsy leaflets — Rhodamine WT dye, integrity thresholds
- IWA Publishing 2022 — non-oxidizing biocides in PA RO
