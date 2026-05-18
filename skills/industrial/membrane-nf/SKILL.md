---
name: membrane-nf
description: Nanofiltration (NF) reference — separation mechanisms (Donnan + steric + dielectric exclusion via DSPM-DE), pH-dependent membrane charge and isoelectric point, KPIs and selectivity ratio, vendor matrix (DuPont FilmTec NF270/NF90/NF200/NF245, Suez DK/DL/HL, Toray SUL, LANXESS Lewabrane NF, Pentair X-Flow tubular, Synder NFX/NFS), applications (softening, NOM/color removal, offshore sulfate removal, mining brines, dairy, OSN), operating windows, fouling differences vs RO. Use when designing NF processes, selecting NF membranes, or diagnosing NF performance.
user-invocable: false
---

# Nanofiltration (NF)

Reference for NF process design and diagnostics — what distinguishes NF from RO/UF, where it earns its place, and how to operate it.

Convention markers:
- `⚠️` — likely bug or incorrect assumption in calling code
- `💡` — enhancement opportunity (NF-specific monitoring, selectivity tracking)

---

## §1 — NF Positioning vs RO and UF

| Parameter | UF | NF | RO |
|---|---|---|---|
| Effective pore size | 10–100 nm | ~0.5–2 nm | < 0.5 nm (dense, solution-diffusion) |
| MWCO | 10–1 000 kDa | 150–2 000 Da (NF90 ~200; NF270 ~200–400; Suez D-series 150–300) | < 100 Da |
| Operating pressure | 1–3 bar | 4–15 bar | BWRO 10–25 bar; SWRO 55–83 bar |
| Rejection mechanism | Size exclusion | Steric + Donnan + dielectric | Solution-diffusion |
| Divalent ions (Mg²⁺, SO₄²⁻) | pass freely | 90–99 % (MgSO₄ ≥ 99 % on NF270) | > 99 % |
| Monovalent ions (Na⁺, Cl⁻, K⁺) | pass freely | 20–70 % (NF270 NaCl ~46 %; NF90 NaCl 90–96 %) | > 99 % |
| Organics > 200 Da | partial | 90–99 % (NOM, pesticides, dyes) | > 99 % |
| Permeate flux (typical) | 50–200 LMH | 15–30 LMH | 10–25 LMH |
| Retentate osmotic pressure | negligible | lower than RO at same recovery | high — sets pressure floor |

**Positioning insight**: NF sits between RO and UF. It runs at 4–15 bar (vs RO 10–83) because monovalent ions pass → osmotic backpressure on the retentate side is smaller. Choose NF when the goal is partial desalination, divalent removal, or color/NOM removal — not when full demineralization is required.

---

## §2 — Separation Mechanisms

NF rejection is the superposition of three mechanisms:

### 2.1 Steric (size) exclusion
Solutes larger than the effective pore are rejected. Governs neutral organic rejection and monovalent ion rejection at high ionic strength (charge screened). Quantified by the Donnan Steric Pore Model (DSPM).

### 2.2 Donnan exclusion
Polyamide NF membranes carry fixed charges (carboxyl, amine groups). Co-ions are electrostatically repelled; counter-ions follow them to maintain electroneutrality, so the salt as a whole is rejected. Divalent co-ions rejected more strongly (∝ z²).

- A negatively-charged NF membrane at pH 7 rejects SO₄²⁻ ≫ Cl⁻
- For asymmetric salts (e.g. MgSO₄), divalent rejection is governed by Donnan + dielectric; monovalent rejection (NaCl) is dominated by steric hindrance

### 2.3 Dielectric exclusion
Inside a nanometric pore, confined water has reduced dielectric constant. The Born solvation energy that an ion pays to enter the pore is higher than in bulk. Divalent ions pay 4× the energy (∝ z²), so divalent rejection is enhanced even when pore diameter > hydrated ion size.

The combined model is **DSPM-DE** (Donnan Steric Pore Model with Dielectric Exclusion) — the standard framework for predicting mixed-ion NF rejection.

### 2.4 pH effect on membrane charge

Polyamide NF is **amphoteric** — both protonatable amine and deprotonatable carboxyl groups. Surface charge depends on pH.

- **Isoelectric point (IEP)**: pH at net zero charge
- **NF270 IEP ≈ 3.1–3.3** (zeta potential ≈ −16 mV at pH 7.7)
- Below IEP: net positive (rejects cations less; the membrane attracts SO₄²⁻ slightly, lowering net divalent rejection in some cases)
- Above IEP: net negative (rejects anions more, especially SO₄²⁻)

**Process implication**: feed pH adjustment tunes selectivity. For sulfate removal, **mildly alkaline pH (7–9)** maximizes SO₄²⁻ rejection. Lowering pH below IEP can actually *decrease* Mg²⁺ rejection.

### 2.5 Concentration polarization

Same physics as RO but generally less severe due to moderate NF flux and lower per-stage recovery. At high recovery (> 80 %) it elevates divalent scaling species near the surface and accelerates BaSO₄ / CaCO₃ precipitation.

---

## §3 — NF KPIs and Formulas

### 3.1 Standard metrics (same algebra as RO)

| Metric | Formula | Notes for NF |
|---|---|---|
| Recovery Y | `Y = Qp / Qf` | 70–90 % typical |
| Observed rejection per ion | `R_obs = 1 − Cp / Cf` | **Must be reported per species** — NF rejection is ion-specific |
| Real (intrinsic) rejection | `R_real = 1 − Cp / C_wall` | Corrects for concentration polarization |
| Salt passage | `SP = 1 − R` | Trending baseline |

### 3.2 NF-specific KPI — Selectivity Ratio

```
Selectivity = R_divalent / R_monovalent
            = R_solute_A / R_solute_B
```

The design number for softening or selective separation.

| Application | Ratio | Membrane |
|---|---|---|
| Ca²⁺/Na⁺ softening | ~ 10:1 | NF270 |
| SO₄²⁻/Cl⁻ for offshore injection | ~ 10:1 to 100:1 | NF245, DK |
| Dye/Na₂SO₄ (textile recovery) | > 100, up to 250+ | Loose-NF dye-recovery membranes |

### 3.3 Net Driving Pressure

Same form as RO:
```
NDP = (Pf + Pc)/2 − Pp − Δπ
```
but Δπ is smaller because monovalents pass and don't concentrate as steeply.

### 3.4 Temperature Correction Factor

```
TCF = exp[ K · (1/298 − 1/(273 + T)) ]
K ≈ 2 640 for polyamide NF (close to RO Ke ≈ 2 700)
```

Flux rises ≈ 3 % per °C around 25 °C.

```
Q_normalized = Q_measured · (NDP_ref / NDP_actual) · TCF
```

### 3.5 Permeate flux
```
Jw = Qp / Am   [LMH]
```
Typical 15–30 LMH at standard test conditions. NF270 is high-flux ("low-pressure NF"); NF90 is lower-flux but higher-rejection.

⚠️ For NF reporting, aggregate conductivity-based normalization is **insufficient** — track per-ion rejection (SO₄²⁻, Ca²⁺, Cl⁻, conductivity, TOC). A 10 % drift on a 70 % NaCl rejection means a measurable downstream impact (3 % more salt → hundreds of ppm in product); the same 10 % drift on RO 99.5 % rejection is invisible.

---

## §4 — Vendor Matrix

| Series | Vendor | MWCO | Test conditions | MgSO₄ rej. | NaCl rej. | Typical application |
|---|---|---|---|---|---|---|
| **FilmTec NF270** | DuPont | ~200–400 Da | 2 000 ppm MgSO₄, 4.8 bar (70 psi), 25 °C, 15 % Y | > 97 % | ~40–50 % | Surface/ground water softening, TOC and THM-precursor removal |
| **FilmTec NF90** | DuPont | ~200 Da | 2 000 ppm MgSO₄ or NaCl, 4.8 bar, 25 °C | > 97 % | 85–96 % | High-rejection NF: nitrate, iron, pesticides, herbicides |
| **FilmTec NF200** | DuPont | ~200 Da | per DuPont PDS | High | ~50–70 % | General purpose: high atrazine + TOC, medium hardness passage |
| **FilmTec NF245** | DuPont | rejects > 300 Da | per PDS | > 99 % SO₄²⁻ | Variable | Sulfate removal (offshore SWRO injection); FDA-compliant materials |
| **Suez/Veolia DK** | Veolia | 150–300 Da | 2 000 ppm MgSO₄, 7.6 bar (110 psi), 25 °C, pH 8, 15 % Y | > 98 % | ~30–50 % | Industrial high-rej. NF, dairy demin |
| **Suez/Veolia DL** | Veolia | 150–300 Da | per fact sheet | High | Concentration-dependent | Dye removal/concentration, NaCl diafiltration |
| **Suez/Veolia HL** | Veolia | 150–300 Da | per fact sheet | High | Low–medium | Water softening, color removal, THM precursor |
| **Toray SUL** | Toray | varies (SU-220S) | per PDS | High | Variable | Specialty NF / low-pressure RO crossover |
| **LANXESS Lewabrane NF** | LANXESS | per series | per PDS | High | series-dep. | Industrial RO/NF supplier; smaller NF catalog |
| **Pentair X-Flow tubular NF** | Pentair | per element | per PDS | High | Low | **Dairy whey** concentration, fouling-tolerant tubular geometry |
| **Synder NFX** | Synder | 150–300 Da | per PDS | ≥ 99.3 % | Low–medium | OEM spiral-wound NF |
| **Synder NFS / NFG / NFW** | Synder | 200–300 / 600–800 / 300–500 Da | per PDS | Varies | Low | Looser NF for specialty separations |

⚠️ Vendor MgSO₄ rejection is at 15 % recovery — **not** the rejection you see in a full installation. Use as relative benchmark only.

---

## §5 — Applications

### 5.1 Water softening (alternative to ion exchange)

- **Membrane**: NF270, NF90, Suez HL
- **Process**: single-stage spiral-wound, 6–10 bar, 70–85 % recovery
- **Result**: ≥ 90 % hardness removal, Na⁺ passes (no taste flattening), no brine regen waste
- **vs IEX**: no brine, lower OPEX in high-throughput; works on color and organics too

### 5.2 Color / NOM removal (surface water)

- **Membrane**: NF270, NF200, Suez HL
- **Driver**: humics MW 500–5 000 Da cause color, taste, THM precursors
- **Result**: > 90 % DOC removal, 96 % UV₂₅₄ removal (Stockholm pilot); near-complete NOM removal in optimized installations
- **Region**: standard in Norway, Sweden, Finland, parts of Netherlands and UK

### 5.3 Sulfate removal — offshore oil & gas seawater injection

- **Membrane**: NF245, GE SR (now Veolia)
- **Driver**: seawater ~2 700 ppm SO₄²⁻; mixing with formation water → BaSO₄/SrSO₄/CaSO₄ scale in reservoir → loss of injectivity + reservoir souring (sulfate-reducing bacteria → H₂S)
- **Result**: SO₄²⁻ from 2 700 ppm to < 40 ppm; NaCl mostly retained (preserves brine ionic strength → clay stability)
- **Module**: large 8" or 16" spiral-wound, FPSO or platform-mounted Sulfate Removal Unit (SRU)

### 5.4 Pharmaceutical (desalting, solvent recovery, OSN)

- **Aqueous NF**: desalt active ingredient, retain product, pass salts
- **Organic Solvent Nanofiltration (OSN)**: solvent-resistant NF (polyimide, ceramic) in MeOH, IPA, THF, acetone for catalyst recovery, solvent exchange, peptide/oligonucleotide concentration
- **Energy advantage**: concentrating 1 m³ acetone 10× by distillation = 850 MJ; by OSN at 25 bar = 2.2 MJ

### 5.5 Mining brines (lithium, cobalt)

- **Driver**: salt lakes and battery leachates have high Mg²⁺/Li⁺ ratio; Li recovery requires pre-removal of divalents
- **Membrane**: positively coated NF (ammonium-functionalized) or conventional PA NF
- **Result**: Mg²⁺ rejection 68–79 % while Li⁺ permeates; reduces downstream evaporation load

### 5.6 Dairy / whey processing

- **Membrane**: Pentair X-Flow tubular NF (PES hollow fiber), Suez Dairy-DK, Synder NFW
- **Process**: concentrates lactose and minerals while passing some monovalents; demineralizes whey; recovers cleaning chemicals
- **Geometry**: tubular preferred over spiral for high-solids/protein feeds (whey, milk permeate) — tolerates higher cross-flow, easier to clean

### 5.7 Textile dye recovery

- **Membrane**: "loose NF" (MWCO 500–1 000 Da) with engineered zeta potential
- **Result**: dye rejection > 99 %, salt rejection < 10 %; Congo Red / Na₂SO₄ selectivity > 250
- **Outcome**: concentrate dye for reuse, pass salt for recovery → near-zero-liquid-discharge textile lines

### 5.8 Water reuse

NF reduces TDS partially while retaining minerals for taste / scaling stability (RO permeate is corrosive and needs remineralization; NF permeate may not).

---

## §6 — Operating Windows and Limits (polyamide TFC NF)

| Parameter | Typical limit | Notes |
|---|---|---|
| Max operating pressure | 10–25 bar (NF270: 41 bar / 600 psig max) | Vendor-specific; many "loose NF" cap lower |
| Max temperature continuous | 45 °C | NF270: 35 °C if pH > 10 |
| pH continuous | 2–11 (NF270); many NF 3–10 | Wider than RO; PA hydrolyses at extremes |
| pH short CIP (30 min) | 1–12 (NF270) | At cleaning T ≤ 35 °C |
| Free chlorine | < 0.1 ppm continuous | Same constraint as RO PA |
| Max feed SDI₁₅ | < 5 | NF more fouling-tolerant than RO due to looser surface and lower NDP, but pretreatment still essential |
| Typical recovery (single pass) | 70–90 % | Higher per-element recovery (25 %) feasible vs RO (15 %) — lower osmotic backpressure |
| Typical permeate flux | 15–30 LMH | NF270 high; NF90 lower |

---

## §7 — Fouling Differences vs RO

### 7.1 Organic fouling
NF more tolerant than RO — looser surface and lower NDP reduce compaction of organic foulants. But NOM-rich feeds still drive significant fouling; periodic CIP required.

### 7.2 Biofouling
Develops more slowly than on RO (lower NDP → reduced nutrient flux). Risk grows fast in warm, low-disinfectant feeds; same biocide/cleaning doctrine applies.

### 7.3 Scaling
Different profile vs RO:
- Lower monovalent rejection → osmotic backpressure rises more slowly with recovery
- Divalent species (Ba²⁺, Sr²⁺, Ca²⁺, SO₄²⁻, CO₃²⁻) are concentrated aggressively
- **Net effect**: at the same recovery, NF often has higher BaSO₄ / SrSO₄ / CaCO₃ supersaturation than RO
- Antiscalant dosing rules same as RO (phosphonate-based, polymeric, plus pH adjustment for CaCO₃)

### 7.4 Cleaning
Same chemistry as RO:
1. **Alkaline step** (pH 11–12, often with EDTA or chelant) — organics, biofilm, NOM, metal-bridged carboxylates
2. **Acid step** (pH 2–3, citric or HCl) — inorganic scale (CaCO₃, metal hydroxides)
3. **Specialty step** if needed: surfactant (anionic for biofilm), sodium bisulfite (reducing) for some foulants

NF often tolerates a slightly wider CIP pH window than RO. Always rinse to neutral before service.

### 7.5 Salt-passage drift — critical for NF
NF90 drops NaCl rejection 2–45 % under fouling (cake-enhanced concentration polarization dominates). NF270 drops 10–30 % (flux-decline-driven rejection loss).

💡 Track per-ion rejection separately; aggregate conductivity drift hides ion-specific issues.

---

## §8 — Bilingual IT/EN Glossary

| EN | IT |
|---|---|
| Nanofiltration | Nanofiltrazione |
| Reverse Osmosis | Osmosi inversa |
| Ultrafiltration | Ultrafiltrazione |
| MWCO (Molecular Weight Cut-Off) | Soglia di taglio molecolare (Dalton) |
| Pore size | Dimensione dei pori |
| Divalent ion | Ione divalente / bivalente |
| Monovalent ion | Ione monovalente |
| Multivalent ion | Ione multivalente |
| Donnan exclusion | Esclusione di Donnan |
| Dielectric exclusion | Esclusione dielettrica |
| Steric exclusion / size exclusion | Esclusione sterica / per dimensione |
| Isoelectric point (IEP) | Punto isoelettrico |
| Zeta potential | Potenziale zeta |
| Selectivity | Selettività |
| Selectivity ratio | Rapporto di selettività |
| Salt rejection | Reiezione salina |
| Salt passage | Passaggio di sale |
| Recovery | Recupero / fattore di recupero |
| Permeate / Retentate / Concentrate | Permeato / Ritenuto / Concentrato |
| Net Driving Pressure (NDP) | Pressione netta motrice |
| Temperature Correction Factor (TCF) | Fattore di correzione di temperatura |
| Concentration polarization | Polarizzazione di concentrazione |
| Sulfate removal | Rimozione solfati |
| Softening | Addolcimento |
| Hardness | Durezza |
| Color removal | Rimozione del colore |
| NOM (Natural Organic Matter) | Materia organica naturale |
| Humic substances | Sostanze umiche |
| Antiscalant | Antincrostante / antiscalante |
| Scaling | Formazione di incrostazioni |
| Fouling | Sporcamento / fouling |
| Biofouling | Sporcamento biologico / biofouling |
| Clean In Place (CIP) | Pulizia in posto |
| Thin-Film Composite (TFC) | Film sottile composito |
| Polyamide | Poliammide |
| Silt Density Index (SDI) | Indice di densità del limo |
| Sulfate Removal Unit (SRU) | Unità di rimozione solfati |
| Organic Solvent Nanofiltration (OSN) | Nanofiltrazione in solvente organico |

---

## Sources

- DuPont FilmTec PDS — NF270 (45-D01529), NF90 (45-D01520), NF90-400/34i (45-D01698), NF245 (filmtec NF245 product page)
- Suez/Veolia D-Series datasheets (DK, DL, HL) — Lenntech, Veolia public docs
- Toray SUL series PDS
- LANXESS Lewabrane NF catalog
- Pentair X-Flow tubular NF — pentair.com/spectrum/nanofiltration
- Synder NFX/NFS/NFG/NFW industrial catalog
- DSPM-DE foundational papers (Bowen, Welfoot 2002, J. Membrane Science / Chemical Engineering Science)
- Hilal et al. / Bowen et al. — NF rejection mechanisms
- pH-zeta NF270 characterizations — ResearchGate, Springer Applied Water Science
- Nordic NOM-removal full-scale review — Sci. Total Environ. 2019
- Offshore sulfate-removal (Veolia FPSO SRU)
- ACS Env. Au 2024 — Li recovery via NF from salt lake brine
- Frontiers in Membrane Science & Tech 2025 — loose-NF dye/Na₂SO₄ selectivity
- Whey processing UF+NF review — PMC 11433986
- OSN in pharma — ACS OPRD 2023
- Membranes (MDPI) 15(7):215 — rejection drift under fouling NF90 vs NF270
