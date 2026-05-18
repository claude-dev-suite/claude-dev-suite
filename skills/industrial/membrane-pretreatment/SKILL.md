---
name: membrane-pretreatment
description: RO/NF pretreatment chain — feed type architectures (SWRO open/beach well, BWRO well/surface, tertiary reuse), pretreatment KPI targets (SDI, turbidity, AOC, Fe/Mn, free Cl2), coagulation chemistry (FeCl3/PAC/alum dose math), antiscalant selection by scaling species, dechlorination (SBS stoichiometry + chloramine handling), CO2/pH management for 2-pass RO and EDI feed, biocide strategy (oxidizing pre-membrane vs non-oxidizing on-membrane), monitoring instrumentation. Use when designing or auditing what sits upstream of RO/NF/EDI.
user-invocable: false
---

# RO/NF Pretreatment

Reference for what feeds the membrane train, with KPI targets, chemistry, and instrumentation. The 80 % rule: most RO/NF/EDI problems originate upstream.

Convention markers:
- `⚠️` — likely bug or incorrect assumption in calling code
- `💡` — enhancement opportunity (new alert, new monitoring point, new dosing logic)

---

## §1 — Pretreatment Chain Overview

### 1.1 SWRO open intake

```
Sea intake (screen 5–25 mm)
  → Travelling band / drum screen (~1–3 mm)
  → In-line coagulation (FeCl3 0.5–5 mg/L as Fe) + flash mix (G ≈ 700–1000 s⁻¹, 30–60 s)
  → Flocculation tank (G ≈ 30–80 s⁻¹, 15–30 min) [optional with inline coag]
  → DAF (HABs/algae/oil) OR direct media filtration
  → Dual / Multimedia gravity filter (5–15 m/h) OR pressure MMF (15–25 m/h)
  → [Optional] UF 0.02 µm for SDI₁₅ ≤ 2
  → Cartridge filter 5 µm absolute (ΔP fresh < 0.3 bar; change at 1.0–1.5 bar)
  → Antiscalant injection
  → SBS dechlorination (only if Cl2 used pre-filter)
  → Acid dosing (H2SO4 or HCl) for LSI control
  → HPP → SWRO 1st pass
```

### 1.2 SWRO beach well (subsurface intake)

```
Beach well / infiltration gallery (natural aquifer filtration)
  → Cartridge filter 5 µm
  → Antiscalant injection
  → SBS only if shock-chlorination at wellhead
  → Acid dosing
  → HPP → SWRO
```

Subsurface intakes naturally deliver SDI₁₅ < 3 in most geologies → skip coagulation and media filtration. Yield (m³/h per well) and risk of Fe/Mn intrusion from anoxic strata are the practical limits.

### 1.3 BWRO well (saline groundwater)

```
Well pump → aeration / oxidation (Cl2, KMnO4, or O2) if Fe/Mn > 0.05 mg/L
  → Manganese greensand / pyrolusite filter (Fe/Mn removal)
  → MMF polishing
  → Cartridge filter 5 µm
  → SBS (if Cl2 residual present)
  → Antiscalant
  → Acid (for high alkalinity / LSI)
  → BWRO
```

### 1.4 BWRO surface water

Same architecture as SWRO open intake but lower TDS, lower turbidity peaks. pH control more critical (CaCO3 dominant scaling vs Mg-sulfate).

### 1.5 Tertiary reuse → BWRO

```
Biological secondary effluent → MBR or tertiary UF/MF
  → break tank
  → cartridge filter 5 µm
  → DBNPA continuous low-dose (1 mg/L) optional
  → antiscalant (low-P or P-free)
  → BWRO 1st pass
```

MBR/tertiary UF typically produces SDI₁₅ 0.5–2.0; secondary effluent may exceed 3 in some months.

---

## §2 — Pretreatment KPI Targets (pre-RO)

| Parameter | SWRO open | SWRO beach well | BWRO well | BWRO surface | Tertiary reuse |
|---|---|---|---|---|---|
| SDI₁₅ target | ≤ 3 | ≤ 2 | ≤ 3 | ≤ 3 | ≤ 3 |
| SDI₁₅ max | 5 | 3 | 4 | 5 | 5 |
| SDI₁₅ with UF | ≤ 2 | n/a | ≤ 2 | ≤ 2 | ≤ 2 |
| Turbidity (NTU) target | < 0.1 | < 0.1 | < 0.1 | < 0.1 | < 0.2 |
| Turbidity (NTU) max | 1.0 | 0.5 | 1.0 | 1.0 | 1.0 |
| Free Cl₂ pre-membrane | 0 ppm | 0 ppm | 0 ppm | 0 ppm | 0 ppm |
| ORP post-dechlor | < 200 mV | n/a | < 200 mV | < 200 mV | < 200 mV |
| AOC (µg C/L) | < 50 excellent / < 100 acceptable | < 50 | < 50 | < 100 | < 100 |
| BGP (µg/L) | < 70 | < 70 | n/a | n/a | n/a |
| Iron (mg/L) | < 0.05 | < 0.05 | < 0.05 | < 0.05 | < 0.1 |
| Manganese (mg/L) | < 0.02 | < 0.02 | < 0.02 | < 0.02 | < 0.05 |
| Aluminum residual (mg/L) | < 0.05 | < 0.05 | < 0.05 | < 0.05 | < 0.05 |
| Operating pH | 6.5–7.5 | 6.5–7.5 | 5.5–7 | 5.5–7.5 | 6–7.5 |
| Cartridge ΔP fresh | < 0.3 bar | < 0.3 bar | < 0.3 bar | < 0.3 bar | < 0.3 bar |
| Cartridge ΔP change-out | 0.7–1.0 bar | 0.7–1.0 bar | 0.7–1.0 bar | 0.7–1.0 bar | 0.7–1.0 bar |

⚠️ SDI₁₅ > 5 voids most OEM warranties. SDI₁₅ ≤ 5 is the absolute hard limit.

AOC threshold from Vrouwenvelder / Weinrich biofouling correlation studies. Raw seawater commonly 30–400 µg C/L (Tampa Bay 360 ± 180 µg/L; Monterey 30 ± 20 µg/L).

⚠️ Heavy metals (Fe³⁺, Mn²⁺, Cu²⁺, Co²⁺) catalyse SBS → oxidant conversion under O₂. Keep trace metals low and minimize SBS overdose (see §5.4).

---

## §3 — Coagulation / Flocculation Chemistry

### 3.1 Coagulant comparison

| Coagulant | Formula | Dose (as product) | Dose (as metal) | Optimal pH | Notes |
|---|---|---|---|---|---|
| Ferric chloride | FeCl₃·6H₂O | 5–40 mg/L | 1–10 mg/L Fe | 5.0–8.5 (best 5–7) | Wide pH; dense floc; residual Fe³⁺ accepted < 0.05 ppm; preferred for SWRO |
| Ferrous sulfate | FeSO₄·7H₂O | 10–50 mg/L | 2–10 mg/L Fe | 8.5–11 + Cl₂ oxidize Fe²⁺→Fe³⁺ | Cheap; needs alkaline conditions |
| Alum | Al₂(SO₄)₃·14–18H₂O | 5–60 mg/L | 0.4–5 mg/L Al | 6.0–7.5 (narrow) | Al residual → AlPO₄/Al(OH)₃ fouling on RO; avoid for RO when possible |
| PAC | Al_n(OH)_m Cl_{3n-m} | 5–30 mg/L | 0.5–3 mg/L Al | 5.5–9 (wide) | Lower residual Al than alum; less pH depression; efficient at cold T |

### 3.2 Polymer flocculant aids

- Type: anionic / cationic / nonionic polyacrylamide (PAM); also tannin-based natural polymers
- Dose 0.05–1 mg/L. Under-dose → no benefit; over-dose → carryover, RO fouling
- Cationic PAM acts as primary coagulant in low-turbidity surface waters

⚠️ Cationic polymer + anionic antiscalant → precipitate → RO fouling. Always jar-test the combination before deployment.

### 3.3 Jar test methodology

1. **Setup**: 6 paddle jars × 1 L; coagulant in dilute solution (1–10 % w/v)
2. **Flash mix**: 100–200 rpm × 30–60 s (G ≈ 700–1 000 s⁻¹)
3. **Flocculation**: 30 rpm × 15–30 min (G ≈ 30–80 s⁻¹, tapered if possible)
4. **Settling**: 30 min undisturbed
5. **Sampling**: supernatant at fixed depth; measure turbidity, TOC, SDI, residual coagulant metal, pH

G value:
```
G = sqrt(P / (μ · V))     # P = power (W), μ = dynamic viscosity (Pa·s), V = volume (m³)
```

### 3.4 Pros/cons for downstream RO

| Aspect | Iron-based (FeCl₃) | Aluminum-based (alum, PAC) |
|---|---|---|
| Residual carryover risk | Fe³⁺ acceptable up to 0.05 ppm | Al³⁺-phosphate fouling, severe at > 0.05 ppm |
| Floc strength | Dense, settle easily | Lighter |
| pH window | Wide | Narrow (alum); wider (PAC) |
| Cold water | Good | Good (PAC) / poor (alum) |
| TOC removal | Excellent | Moderate |
| SWRO compatibility | Preferred | Avoid alum; PAC OK with caution |

---

## §4 — Antiscalant Selection and Dose Math

### 4.1 Chemistry families

| Family | Examples | Best for | Typical dose | Notes |
|---|---|---|---|---|
| Phosphonate | HEDP, PBTC, ATMP, DTPMP, BHMTPMP | CaCO₃, CaSO₄, BaSO₄, SrSO₄, CaF₂ | 2–5 mg/L | Workhorse; P discharge constraints |
| Polyacrylate / acrylic homo & copolymer | PAA, AA-MA | BaSO₄, SrSO₄, suspended solids dispersion | 1–5 mg/L | P-free; lower Ca tolerance |
| Sulfonated copolymer | AA-AMPS, AA-AMPS-HPA terpolymer | High Ca, CaPO₄, ZnCO₃ | 2–5 mg/L | High Ca + alkaline tolerance |
| Maleic-based | MA-AA, polymaleic | CaCO₃, CaSO₄ broad | 2–5 mg/L | P-free; used in P-restricted discharges |
| Polymeric silica dispersant | PEG, PEGD, PVA, PAMAM, PEI | SiO₂, colloidal silica | 1–5 mg/L | For SiO₂ > 100 ppm in concentrate |
| Dendrimer / latest-gen | Polyaspartate, dendrimer-based | Broad multi-species | 1–4 mg/L | Biodegradable; premium |

### 4.2 Selection by scaling species

| Scaling species | Antiscalant of choice |
|---|---|
| CaCO₃ | Phosphonate (HEDP, PBTC) OR maleic-based (P-free) |
| CaSO₄ (gypsum) | Phosphonate + polyacrylate blend |
| BaSO₄, SrSO₄ | Polyacrylate or AA-AMPS (phosphonates can co-precipitate with Ba) |
| CaF₂ | Phosphonate |
| SiO₂ amorphous | Polymeric silica inhibitor (PEG/PEGD) + pH adjustment |
| Ca₃(PO₄)₂ | AA-AMPS terpolymer — **NOT** phosphonate |
| Fe / Mn fouling | Specialised dispersant blend |

### 4.3 Dose calculation

Three approaches:
1. **Vendor projection software** (preferred): DuPont WAVE, Hydranautics IMSDesign, Toray DS-Design, Veolia Winflows, Avista AdvisorCi, Genesys Genesys Member. Software computes LSI / S&DSI / IP-Ksp per stage and recommends dose.
2. **LSI-driven empirical**: target concentrate LSI ≤ +1.8 (conservative) or ≤ +2.5 (premium antiscalant). Typical dose 2–5 mg/L product.
3. **Jar-tested matrix**: when projection unavailable.

### 4.4 Compatibility traps

⚠️ Cationic biocide + anionic antiscalant → precipitate.
⚠️ Phosphonate + Ba²⁺ → BaSO₄ co-precipitation under some conditions.
⚠️ Phosphate-containing antiscalant + Ca²⁺ at high pH → calcium phosphate scale (unintended).
⚠️ EU/CN P discharge limits → switch to maleic / polyacrylate / sulfonated terpolymer for compliance.

---

## §5 — Dechlorination (SBS / SMBS)

### 5.1 Chemistry

```
Na2S2O5 + H2O → 2 NaHSO3
NaHSO3 + HOCl → NaHSO4 + HCl
```

### 5.2 Stoichiometry

- **Theoretical** (DuPont 45-D01569): **1.34 mg SMBS per mg free Cl₂** (≈ 1.46 mg NaHSO₃ per mg Cl₂)
- **Practical**: **1.5–3.0 mg/mg** (50–125 % excess) to account for incomplete mixing, competing reactions (DO, chloramines, NOM), continuous overdose margin
- **DuPont rule of thumb**: ~3.0 mg SMBS per mg free Cl₂ (≈ 2.2× theoretical)

⚠️ SMBS (Na₂S₂O₅) and SBS (NaHSO₃) have different molar masses — confirm which the dosing pump is metering and adjust stoichiometry accordingly.

### 5.3 Chloramines

- NH₂Cl, NHCl₂ react more slowly with SBS than free Cl₂
- At feed pH ≥ 8.5, SBS becomes ineffective at fully reducing chloramines
- **ORP signal unreliable** for chloramines — supplement with DPD analyzer
- **Mitigation**: acidify before SBS injection, increase dose 2–3×, increase contact time

### 5.4 The oxidant paradox

Under DO + transition metal traces (Cu²⁺, Co²⁺, Fe³⁺, Mn²⁺):
```
2 NaHSO3 + O2  --[Cu/Co]-->  2 NaHSO4 + sulfite radicals (SO3•⁻, SO4•⁻)
```

Sulfite radicals attack polyamide. Residual SBS up to 30 ppm has been reported to convert partially to oxidants in this scenario.

⚠️ Chronic SBS overdose is **not** safer than just-right dosing. Keep margin small (just enough to neutralize Cl₂); minimise air ingress in suction lines; deaerate where Cu/Co > trace.

### 5.5 Monitoring

- **ORP post-dechlor**: < 200 mV (some vendors < 150 mV)
- **Pre-Cl₂ ORP** typical: +300 to +600 mV
- **DPD analyzer** redundant safety against breakthrough
- ORP under SBS overdose can read misleadingly low

### 5.6 SBS solution preparation

- Use **RO permeate**, not raw water, to avoid sulfate scale in dosing line
- Concentration 5–15 % w/w (higher decomposes faster, especially warm)
- **Filter SBS solution through dedicated cartridge before injection** (insoluble grit, sulfate)
- Inject downstream of last cartridge filter with static mixer
- Solution shelf life ~7 days; replace weekly

⚠️ Do not store dechlorinated water in tanks — promotes bacterial regrowth between dechlor and HPP.

### 5.7 Alternative: GAC

| Aspect | SBS | GAC |
|---|---|---|
| CapEx | Low | High |
| OpEx | Recurring chemical | Periodic media replacement (1–3 yr) |
| Reliability | Active control loop | Passive failsafe |
| Bacterial regrowth | None | High (bed = bioreactor) |
| ORP control needed | Yes | No |
| SWRO use | Primary | Rare (footprint, bio) |
| Pharma / USP use | Sometimes | Common (chlorine-free + TOC reduction) |

---

## §6 — CO₂ / pH Management

### 6.1 Why CO₂ matters

- Neutral CO₂ permeates RO (small uncharged molecule)
- HCO₃⁻ is rejected (charged, hydrated)
- For 2nd-pass RO or EDI feed, CO₂ in 1st-pass permeate becomes the dominant ionic load downstream
- FCE (for EDI) penalizes CO₂ at 2.79 µS/cm per ppm

### 6.2 Strategies

| Strategy | CO₂ outlet | Use when | Notes |
|---|---|---|---|
| Interpass NaOH injection | residual converted to HCO₃⁻, rejected by pass 2 | 2-pass RO present | Target interpass pH 8.4–8.7; also boosts boron and silica rejection |
| Membrane degasser (PTFE/PP hollow fiber, e.g. Liqui-Cel) | < 5 ppm typ, < 0.5 ppm achievable | RO + EDI (no 2nd RO) | Vacuum and/or sweep gas; CIP every 3–6 months |
| Forced-draft atmospheric tower | 5–10 ppm | Lower-purity applications | Open to atmosphere → bacterial ingress risk |
| Vacuum tower degasser | 1–5 ppm | High-purity preferred | Higher CapEx than membrane |

### 6.3 pH control loop

- pH transmitter (glass + Ag/AgCl or solid-state), inline post-injection static mixer
- PID-controlled dosing pump (NaOH 50 % or H₂SO₄ 96–98 %)
- Control band ±0.1 pH typical; alarms at ±0.3

⚠️ Buffer-poor RO permeate → small dose causes large pH swing. Tune integral term carefully or use cascade control.

### 6.4 pH effects on rejection (2nd pass)

- **Boron** (pKa 9.14–9.24): at pH 9.5–9.8, H₃BO₃ → B(OH)₄⁻, rejected by RO. Critical for SWRO when boron > 0.5 mg/L target (WHO/EU drinking water)
- **Silica** (pKa 9.84): higher pH → silicate species → better rejection
- **CO₂**: see §6.1

Tradeoff: pH > 8 increases CaCO₃ scaling risk on 2nd-pass concentrate if Ca slip from 1st pass.

---

## §7 — Biocide Strategy (Split Pre/On Membrane)

### 7.1 Pre-RO (oxidising OK, must be removed before membrane)

| Agent | Typical dose | Notes |
|---|---|---|
| NaOCl / Cl₂ | 0.5–2 mg/L continuous; 5–10 mg/L shock | Must dechlorinate before RO |
| Chloramine (NH₂Cl) | 1–4 mg/L | Slower kill but persistent; less DBPs |
| ClO₂ | 0.1–0.5 mg/L | Stronger; **damages PA more aggressively than Cl₂** — never let through |
| O₃ | 0.5–2 mg/L | Strong; full decomposition required before membrane |
| KMnO₄ | 0.5–5 mg/L | Fe/Mn oxidation; Mn must be filtered out |

### 7.2 On-membrane (non-oxidising only)

| Biocide | Active conc. | Mode | Contact | PA compatibility |
|---|---|---|---|---|
| **DBNPA** (2,2-dibromo-3-nitrilopropionamide) | 10–50 mg/L shock; 1 mg/L continuous | Shock or continuous | 30 min – 3 h | Excellent; hydrolyses rapidly (half-life hrs–days) |
| **CMIT/MIT** (isothiazolinone blend) | 25–100 mg/L | Shock during CIP | 1–24 h | Good; optimum pH 6.5–8.5; hydrolyses above pH 9 |
| **BIT** (1,2-benzisothiazolin-3-one) | 50–100 mg/L | Shock | 1–4 h | Good; longer environmental persistence |
| **Glutaraldehyde** | 100–500 mg/L shock; 1 % storage | Shock + preservation | 1–4 h | Compatible; toxicity / handling concerns |
| **Formaldehyde** | 0.5–1 % (storage only) | Storage | n/a | Legacy; carcinogen — discouraged; banned in some EU member states |
| **Quaternary ammonium** | Limited | Compat varies | n/a | Cationic — **risk of precipitation with anionic antiscalant**; not recommended on PA |
| **Peracetic acid** (PAA) | 50–200 mg/L | CIP | < 1 h | Some vendors allow; strong oxidant — check OEM approval |

### 7.3 Shock dosing protocols

- **DBNPA online**: 10–50 mg/L × 1 h, weekly. Bertheas study: 8.5 mg/L × 3 h more effective than 20 mg/L × 1 h
- **DBNPA offline CIP**: flush 15–30 min → 20 mg/L active recirculate 30 min – 1 h → rinse 30 min
- **CMIT/MIT during CIP**: 25–50 mg/L, contact 1–4 h, full rinse

### 7.4 Storage / preservation

- **Short-term (< 30 days)**: 0.5–1 % SMBS, pH 3–6 (acidify to prevent oxidation)
- **Long-term (months – 3 yr)**: 1–1.5 % SMBS, pH ~7, sealed vacuum bag (new-element vendor practice)
- **Alternative**: 1 % glutaraldehyde or 0.5 % formaldehyde where allowed
- Monitor SMBS solution pH and re-dose every 30–90 days to prevent oxidation to sulfate (loss of preservative + biological growth)

---

## §8 — Monitoring Instrumentation

### 8.1 SDI test (ASTM D4189-23)

- Method scope: waters with turbidity < 1.0 NTU; not applicable to RO/UF permeate
- Filter: 0.45 µm pore, 47 mm MCE
- Pressure: 30 psig (2.07 bar) constant ± 0.1
- Procedure:
  1. Measure time t_i to collect 500 mL at t = 0
  2. Flow at 30 psi for 15 min (or 5/10 min if filter plugs early)
  3. Measure t_f to collect 500 mL at t = 15 min

```
SDI15 = 100 · (1 − t_i / t_f) / 15
```

Units: % per minute drop in flux.

### 8.2 Online instrumentation (typical set)

| Parameter | Sensor | Location | Action threshold |
|---|---|---|---|
| Turbidity | Nephelometric (Hach 2100, Endress+Hauser CUS52D, Yokogawa) | Post media filter, post UF | Alarm > 0.2 NTU |
| Free Cl₂ | DPD analyzer (Wallace & Tiernan, E+H CCS51D) | Post dechlor | Trip > 0.05 ppm |
| ORP | Ag/AgCl electrode | Pre and post dechlor | Trip > 200 mV post-SBS |
| Conductivity | Inductive (high TDS) or contacting (RO permeate) | Feed, permeate, concentrate per stage | Mass balance, salt passage |
| pH | Glass or solid-state | Post acid/caustic injection | PID control |
| Pressure | Piezo-resistive | Each stage feed/perm/conc | ΔP trending |
| Flow | Electromagnetic (preferred), Coriolis (high accuracy) | Feed, perm, conc, recycle | Recovery, mass balance |
| Iron (optional) | Colorimetric (Hach) | Feed | Monthly grab |
| TOC (high-purity) | UV oxidation analyzer | RO permeate, EDI product | UPW spec |
| SDI | Automatic (Sterlitech SimpleSDI:Auto) or manual | Pre-cartridge | Daily check |

💡 Mass-balance closure check (`|Qf − (Qp + Qc)| / Qf < 2 %`) on the feed/permeate/concentrate flow set is essential — without it, instrument drift produces phantom KPI alerts.

---

## §9 — Bilingual IT/EN Glossary

| EN | IT |
|---|---|
| Pretreatment | Pretrattamento |
| Intake | Opera di presa |
| Brine outfall | Scarico salamoia |
| Beach well | Pozzo costiero |
| Open intake | Presa diretta a mare |
| Screening (coarse/fine) | Grigliatura (grossolana/fine) |
| Coagulation | Coagulazione |
| Flocculation | Flocculazione |
| Sedimentation | Sedimentazione |
| Dissolved Air Flotation (DAF) | Flottazione ad aria disciolta |
| Multimedia filter (MMF) | Filtro multistrato |
| Dual-media filter (DMF) | Filtro bistrato |
| Cartridge filter | Filtro a cartuccia |
| Ultrafiltration (UF) | Ultrafiltrazione |
| Antiscalant | Antincrostante |
| Biocide | Biocida |
| Shock dosing | Dosaggio shock |
| Dechlorination | Declorazione |
| Jar test | Jar test (anglicismo) |
| Break-tank | Vasca di rottura |
| Backwash | Controlavaggio |
| Cleaning In Place (CIP) | Lavaggio in posto |
| High Pressure Pump (HPP) | Pompa di alta pressione |
| Recovery | Recupero / resa |
| Reject / concentrate / brine | Concentrato / salamoia |
| Permeate | Permeato |
| Free chlorine | Cloro libero / residuo |
| Combined chlorine / chloramine | Cloro combinato / cloramine |
| Oxidation-Reduction Potential | Potenziale redox (ORP) |
| Silt Density Index | Indice di Densità del Limo (SDI) |
| Assimilable Organic Carbon | Carbonio Organico Assimilabile (AOC) |
| Biological Growth Potential | Potenziale di crescita biologica (BGP) |
| Total Organic Carbon | Carbonio organico totale (TOC) |
| Biodegradable DOC | DOC biodegradabile (BDOC) |
| Polyamide | Poliammide (PA / TFC) |

---

## Sources

- **ASTM D4189-23** SDI
- **DuPont FilmTec** 45-D01504 (Tech Manual), 45-D01569 (Chlorination/Dechlorination), 45-D01578 (Feedwater Guidelines)
- **Hydranautics** TSB 108 (Chlorination), TSB 110 (Biocides), TAB-111 (Chemical Pretreatment)
- **AWWA Research Foundation** Guidance Manual for Disposal of Chlorinated Water
- Weinrich et al. 2011, AEM 77(3):1148 (AOC bioluminescence method)
- Naidu et al. 2016, Water Research (AOC contribution to SWRO biofouling)
- IWA AQUA 2022 — Non-oxidizing biocides for RO PA
- Bertheas et al., DeSWater 2017 — DBNPA dosage for biofouling
- MDPI Membranes 12(2):170 — Roles of Sulfites in RO (Cu/Co catalysed oxidation)
- SnowPure — Interpass pH 8.4–8.7 for 2-pass RO + EDI
- SigmaDAF / Veolia Spidflow — DAF loading 30–45 m/h for SWRO
- Mann+Hummel TSG-C-012 — Dechlorination Using SMBS
