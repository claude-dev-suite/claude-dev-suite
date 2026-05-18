---
name: membrane-autopsy
description: Membrane autopsy lab methodology — autopsy decision matrix (when to autopsy), element sampling protocol (which to pick, preservation, data package), lab method suite (visual / weight-loss / dye test per ASTM D6908 / SEM-EDS / FTIR / swab + plate count / Fujiwara chlorine test / cross-section), findings-to-action interpretation table, independent and vendor-affiliated labs with cost ranges, warranty claim workflow (open BEFORE pulling the element), bilingual glossary. Use when planning or interpreting an autopsy, or filing a manufacturing-defect warranty claim.
user-invocable: false
---

# Membrane Autopsy

Reference for deciding when to autopsy a membrane element, how to ship it, what each lab method reveals, and how to translate findings into operational action or a warranty claim.

Convention markers:
- `⚠️` — likely bug or incorrect assumption in calling code
- `💡` — enhancement opportunity (autopsy-driven lifecycle update, vendor warranty workflow integration)

---

## §1 — When to Autopsy (Decision Matrix)

### 1.1 Trigger conditions (any one suffices)

| Trigger | Threshold | Notes |
|---|---|---|
| Salt rejection drop (passage rise) | > 10 % vs baseline, persistent after 2 CIPs | Avista / AWC / Vipanan canonical trigger |
| Normalized ΔP (ΔPn) rise | > 15–25 % not recovered by CIP | DuPont 45-D01652: 15 % action; many operators use 20–25 % post-CIP |
| Normalized permeate flow (NPF) decline | > 10–25 % not recovered by CIP | Biofouling signature: ΔP impacted first, then flux, then rejection |
| Unexplained instrument disagreement | Persistent after sensor calibration | Rules out membrane vs instrumentation root cause |
| End-of-warranty diagnostic | Before warranty expiry | Required to file manufacturing-defect claim |
| Premature failure pattern | Multiple elements < expected life | Especially when concentrated in lead or tail positions |
| Suspect chlorine breakthrough | Cumulative ppm·h record exists OR ORP excursion | Fujiwara test confirms halogenation |
| Pre-replacement diagnostic | Before bulk replacement decision | Validates cleaning options before procurement |

### 1.2 Cost-benefit framing

Public vendor websites do not publish autopsy price lists — all require a quote. Indicative ranges from industry practice (planning indicators, not contractual):

| Scope | Indicative range (USD) | Use case |
|---|---|---|
| Basic: visual + dye + weight-loss | ~$500–1 000 | Quick screen, single element |
| Standard (Genesys "Tier 2-3"): + SEM/EDS + FTIR + cleaning study | ~$1 500–2 500 | Most common; supports warranty claim |
| Advanced (Tier 4-5): + 16S rRNA + cross-section + Fujiwara + ATP + LOI | ~$2 500–5 000 | Complex/persistent failures, expert-witness |
| Vendor warranty autopsy (DuPont, Hydranautics, Toray) | Free, if claim accepted | RMA process; vendor-affiliated lab |

Pays off when: multiple elements need replacement, warranty claim plausible, recurring failure pattern needs root-causing.

---

## §2 — Sampling Protocol

### 2.1 Which element to autopsy

| Position | What it reveals | When to pick |
|---|---|---|
| **Lead element of lead vessel** | Particulate / colloidal fouling, biofouling, oxidation damage, organics, oil/grease | Default; fouling-dominant problems; suspected chlorine breakthrough |
| **Tail element of last vessel** | Scaling (CaCO₃, CaSO₄, BaSO₄, SiO₂), compaction | Rejection drop suspected scale-driven; LSI/recovery review |
| **Lead + tail** | Complete fouling picture | Generous budget, systemic problem |
| **Failed element (via probing)** | Localized integrity loss | Probing identifies a specific outlier |

For budget-limited cases pick **lead** unless symptoms point to tail.

### 2.2 Element preparation post-removal

1. **Do not air-dry** — desiccation alters biofilm morphology and chemistry, masks NOM, kills microbial signal
2. **Wrap in heavy plastic** (double-bag); label with element serial, position, removal date
3. **Refrigerate at 4 °C** within 24 h; ship in insulated container with cold packs
4. **Do not freeze** — ice crystals damage PA and disrupt cross-section integrity
5. **Ship within 48–72 h**
6. **Photograph** all external surfaces under good light **before** shipment (telescoping, glue line, end-cap, brine seal, fiberglass shell). Photos are essential for warranty claims

⚠️ Do not preserve the entire element in SMBS if microbial culture from the main sample is required — SMBS suppresses what you want to grow. Keep a **separate witness coupon** in 0.5–1 % SMBS if biofilm is the suspect and shipping is slow.

### 2.3 Pre-autopsy data package (ship with the element)

The lab — and, if applicable, the vendor warranty desk — both require:

- Element identifier (serial number, model, lot, manufacture date)
- Position in train (rack / vessel / position), hours on-stream
- Feed water source + quality history (TDS, SDI, T, pH, alkalinity, hardness, silica, Fe/Mn, oils, chlorine, ORP)
- Baseline NPF / NSP / ΔPn and recent normalized values
- CIP history (dates, chemistry, pH, T, contact time, recovery achieved)
- Cumulative free chlorine exposure if tracked (ppm·h)
- Abnormal event log (pressure shocks, dosing failures, dechlor failures, feed upsets)
- ORP / free-Cl₂ continuous log around the suspected exposure event
- Photographs taken at removal

⚠️ Without this data package the lab can identify the *what* but not the *why*, and warranty submissions are routinely rejected for missing pretreatment logs.

---

## §3 — Lab Method Suite

For each: what it reveals, indicative cost, limitations.

### 3.1 Visual inspection
- **External**: telescoping, fiberglass cracks, glue-line cracks, abrasion, brine-seal damage, biofilm rim on lead face, surface color (brown = Fe, white/tan = scale, dark green-brown = biofilm/NOM)
- **Internal** (after dissection): leaf-by-leaf deposit distribution, spacer compaction, permeate-spacer imprint on PA (compaction signature)
- **Cost**: included in any autopsy package
- **Limitation**: qualitative

### 3.2 Weight-loss / Loss-on-Ignition (LOI)
- **Reveals**: total foulant mass and organic vs inorganic split. Wet weight baseline → post-CIP weight (mass removed); coupon ashed at 550 °C (organic burns off, inorganic residue remains)
- **Cost**: ~$100–200 add-on
- **Limitation**: bulk number; doesn't identify foulant species

### 3.3 Cleaning effectiveness test
- **Reveals**: whether field CIP can recover the element. Bench cell applies sequential chemistries (high-pH detergent → low-pH acid → non-oxidizing biocide → reductant if needed) and re-measures flux + rejection after each step
- **Decision rule**:
  - Recovery ≥ **90 %** → CIP-treatable in field, deploy the recipe
  - **70–90 %** → marginal; consider one more aggressive CIP, then replace
  - **< 70 %** → replace; no CIP benefit
- **Cost**: ~$300–600
- **Limitation**: bench cell ≠ field hydraulics; treat as upper bound

### 3.4 Salt-rejection retest
- **Reveals**: membrane chemistry change. Standard conditions per vendor (typically 2 000 ppm NaCl, 225 psi, 15 % recovery, 25 °C for BWRO; 32 000 ppm NaCl, 800 psi for SWRO)
- **Interpretation**: rejection > 5 % below vendor spec → confirmed chemical/structural damage (oxidation, hydrolysis, compaction) → replacement
- **Cost**: ~$200–400
- **Limitation**: does not identify cause, only confirms loss

### 3.5 Dye test (Rhodamine WT or Red Dye #40 per ASTM D6908)
- **Reveals**: integrity defect location and type. ASTM D6908 lists Rhodamine WT and Red Dye #40 (both MW ~500) as soluble-dye tracers for RO/NF

| Stain pattern | Defect |
|---|---|
| Diffuse, full-membrane | Chemical attack (oxidation, hydrolysis) — confirm with Fujiwara |
| Localized point | Pinhole — hydraulic shock, particulate puncture |
| Linear / straight line | Glue-line crack — manufacturing or handling |
| Edge concentration | O-ring or brine-seal bypass |

- Methylene blue is the cheaper alternative
- **Cost**: ~$150–300 — cheapest discriminating test
- **Limitation**: confirms breach but not chemistry of attack

### 3.6 SEM / EDS
- **SEM**: high-resolution surface morphology — foulant thickness, crystal habit (rhombohedral CaCO₃, needle CaSO₄, tabular BaSO₄), biofilm 3D structure
- **EDS**: elemental composition, semi-quantitative. Map: Ca, Mg, Ba, Sr, Si, Fe, Mn, Al, S, P, C, N, Na, Cl

Cheat sheet:

| EDS dominant elements | Foulant |
|---|---|
| Ca + C (+ Mg) | CaCO₃ scaling |
| Ca + S | CaSO₄ |
| Ba + S | BaSO₄ (very low solubility — usually irreversible) |
| Sr + S | SrSO₄ |
| Si dominant | Silica (amorphous or quartz) |
| Fe (± Mn) | Iron/manganese oxide |
| Al + Si | Aluminosilicate (clay) |
| C + N + P high, low metals | Biofilm / organic |
| P + Ca | Calcium phosphate |

- **Cost**: ~$300–500 per coupon
- **Limitation**: surface-sensitive (top ~1 µm), semi-quantitative, heterogeneity-prone (sample ≥ 3 spots). EDS cannot detect H; light elements (B, Li) unreliable

### 3.7 FTIR / ATR-FTIR
- **Reveals**: organic functional groups in deposits and integrity of polyamide active layer

| Band (cm⁻¹) | Assignment |
|---|---|
| 1650 (amide I, C=O) | Protein OR polyamide active layer |
| 1540–1550 (amide II, N–H) | Protein / polyamide |
| 1010–1040 | Polysaccharides (biofilm EPS) |
| 1720 (C=O carboxylic) | Humic / NOM |
| 1080 (Si–O–Si) | Silica |
| 1450, 870 (CO₃²⁻) | Carbonate |
| 2800–3000 (C–H) | Aliphatic — oil/grease, surfactant, antiscalant residue |

Loss/shift of amide I/II from the polyamide itself indicates oxidative degradation.

- **Cost**: ~$200–400
- **Limitation**: detects organics in top few µm; overlapping bands need expert interpretation

### 3.8 Biofilm characterization
- **R2A agar swab / plate count** — low-nutrient medium for slow-growing oligotrophs; reports CFU/cm²
- **ATP assay** — total live biomass; fast (~minutes); good for trending
- **16S rRNA sequencing** — full community profile. Recurring problem genera on RO membranes: *Sphingomonas* (dominant biofilm initiator), *Pseudomonas*, *Mycobacterium*, *Acinetobacter*, *Burkholderia*, *Halomonas*
- **Cost**: $200 (plate count) → $800+ (sequencing)
- **Limitation**: R2A captures only culturable fraction (often < 1 % of community); sequencing requires intact DNA — don't ship dry or autoclaved samples

### 3.9 Fujiwara test (chlorine attack confirmation)
- **Reveals**: presence of halogenated organics in/on polyamide → confirms chlorine (or chloramine, bromine) attack
- **Procedure**: membrane coupon in tube with 2 mL pyridine + 3 mL 10 % NaOH, heated to boiling ~1 min. **Pink/red colour in the caustic layer = positive** (halogenated organic present)
- Cross-verify with FTIR (amide-band shifts) and EDS (Cl detection)
- **Cost**: ~$100–200
- **Limitation**: qualitative; does not quantify exposure dose; false negatives possible if exposure was brief and PA heavily rinsed. Bromine and iodine also produce positive results

### 3.10 Cross-section analysis
- **Reveals**: active layer (PA), polysulfone support, polyester backing condition; compaction extent; delamination; foulant penetration depth
- **Method**: embed in epoxy → microtome → optical or SEM imaging
- **Cost**: ~$400–800
- **Use**: advanced failure analysis, manufacturing-defect substantiation (PA voids, support delamination)

### 3.11 Optional: PDT / VDT (per ASTM D6908)
Pressure or vacuum decay test — pressure applied to permeate side, decay rate quantifies leak. More common at module/system level than on a dissected element, but useful when the lab runs an integrity workflow.

---

## §4 — Findings → Root Cause → Action

| Lab finding | Root cause | Operational action |
|---|---|---|
| EDS Ca + C dominant, rhombohedral SEM crystals | CaCO₃ scaling | Review LSI/S&DSI at concentrate; antiscalant dose/selection; acid CIP (citric or HCl, pH 2–3) |
| EDS Ca + S | CaSO₄ scaling | Lower recovery OR upgrade antiscalant (HEDP, polyacrylate); chelant CIP (EDTA pH 11–12) |
| EDS Ba + S (or Sr + S) | BaSO₄ / SrSO₄ scaling — generally irreversible | Antiscalant upgrade to DTPMP; if extensive, replace |
| EDS Si dominant | Silica scaling | Review pH, T, recovery; warm-water alkaline CIP (pH 11–12, ≥ 35 °C if vendor allows); if cemented, replace |
| EDS Fe (± Mn), reddish SEM | Iron / manganese oxidation upstream | Audit prefiltration / oxidation / pH; reductive CIP with sodium hydrosulfite (Na₂S₂O₄) at 1 %, pH 5; or citric + ammoniated citric |
| EDS high C, N, P; SEM biofilm; ATP high | Biofouling | Non-oxidizing biocide CIP (DBNPA, isothiazolinone); reduce AOC upstream; consider continuous low-dose |
| FTIR humic peaks (~1720, 1620 cm⁻¹) | Organic NOM fouling | Upstream coagulation review; alkaline CIP (NaOH + EDTA pH 12) |
| FTIR C-H aliphatic, EDS C only | Oil / grease / surfactant | Pretreatment audit; intake protection; surfactant CIP |
| Dye diffuse + Fujiwara positive | Chlorine / chloramine oxidation | Dechlor failure — audit SBS dosing / ORP loop; replace element |
| Dye localized point | Mechanical pinhole | Investigate pressure shocks, particulate breakthrough; replace |
| Dye linear line | Glue-line crack | Manufacturing defect → warranty claim; replace |
| Dye edge concentration | O-ring / brine-seal failure | Replace seal, verify orientation, re-test |
| Salt-rejection retest > 5 % below spec, FTIR amide change | Chemical attack or hydrolysis | Replace |
| Permeate-spacer imprint on PA, low NPF | Compaction | Reduce feed pressure; replace if severe |
| Cleaning recovery ≥ 90 % | CIP-treatable | Deploy proven recipe in field; schedule CIP frequency |
| Cleaning recovery < 70 % | Replace | No CIP benefit |

---

## §5 — Vendor Labs and Cost Ranges

### Independent / third-party labs (paid)

- **Avista Technologies** (Kurita) — proprietary Chromatic Elemental Imaging (CEI℠) + standard suite; specialty in TFC polyamide
- **American Water Chemicals (AWC)** — > 20 tests per autopsy; antiscalant compatibility studies
- **Genesys / PWT** (Madrid, ES + Vista, CA, US) — five tiers from screening to expert-witness
- **Ecolab / Nalco Water** — full-service water treatment provider
- **Vipanan Lab** (IN) — full autopsy suite
- **Membrane Works** (AU), **ChemEnergy** (US), **MPW** (US) — regional providers

### Vendor-affiliated (free with valid warranty claim)

- **DuPont (FilmTec)**, **Hydranautics (Nitto)**, **Toray**, **LG Chem**, **Suez/Veolia** — autopsy under RMA process
- ⚠️ Open the claim **BEFORE** removing the element

### Academic / research
- University of Twente (NL), Singapore CleanTech, university desalination centers — research-grade autopsies under collaborative arrangements (often months turnaround)

---

## §6 — Warranty Claim Workflow

### 6.1 Typical warranty terms (verify on the actual element warranty document)

Manufacturer terms vary and are shorter than industry folklore suggests:

- **DuPont FilmTec**: 3-year prorated limited warranty
- **Toray**: 3-year prorated limited warranty on RO elements
- **Hydranautics**: standard workmanship-and-materials text is **12 months**. Pre-sales agreement may extend; always check the specific PO/contract.

⚠️ The "3 yr SWRO / 5 yr BWRO" working assumption commonly seen in process literature is **not universally accurate**. Hydranautics' standard text is 12 months. Treat per-vendor PO terms as authoritative.

### 6.2 Common exclusions (consistent across vendors)

- Free chlorine or other oxidizing exposure (Hydranautics excludes any free-Cl; many vendors specify > 0.1 ppm)
- Operation outside pH range (e.g. 2–11 continuous; cleaning extremes per vendor)
- Feed water SDI > 3–5 (Hydranautics: > 3)
- Feed temperature > 45 °C
- Operation outside vendor-specified pressure, recovery, flux
- Mechanical mishandling, telescoping, hydraulic shock
- Use of non-approved cleaning chemicals
- Unauthorized modification

### 6.3 Documentation the vendor will request

- Element traceability — serial numbers, PO, install date
- Plant operating logs (T, P, feed/permeate flow, conductivity)
- Normalized performance data (NPF, NSP, ΔPn over time)
- CIP records (dates, chemistries, pH, T, contact time, recovery)
- Feed water analyses (full panel with sufficient history)
- SDI continuous or daily log
- Free chlorine and ORP continuous log (proves dechlor compliance)
- Pretreatment configuration and any upstream incident reports
- Photographs taken at removal

### 6.4 Process

1. **Open the claim BEFORE pulling the element.** Some vendors require witness or specify the disassembly procedure. Pulling first can void the claim.
2. Vendor issues RMA / return authorization
3. Ship per vendor instructions (refer to §2.2). Vendor autopsy is performed at no cost if the claim is accepted
4. Outcomes:
   - **Manufacturing defect confirmed** (glue void, PA pinhole, support delamination): warranty replacement (prorated if applicable)
   - **Operational cause confirmed** (chlorine breakthrough, pH excursion, SDI > limit, telescoping): claim denied; element returned or scrapped
   - **Inconclusive**: vendors may offer goodwill credit case-by-case
5. **Independent autopsy first** is a defensible strategy when:
   - claim is high-value (multiple elements affected)
   - or trust in vendor diagnosis is low — bring independent SEM/EDS/FTIR/Fujiwara evidence to negotiation

💡 A `warranty_workflow.md` operational SOP that codifies "open RMA before pulling element" + "ship with data package per §2.3" should live in the plant operator handbook, not just in the asset management system.

---

## §7 — Bilingual IT/EN Glossary

| EN | IT |
|---|---|
| Membrane autopsy | Autopsia (della) membrana |
| Foulant identification | Identificazione del foulant / dello sporcante |
| Dye test | Test di colorazione |
| Weight-loss test | Test di perdita di peso |
| Loss-on-ignition (LOI) | Perdita per calcinazione |
| Cross-section | Sezione trasversale |
| SEM (Scanning Electron Microscopy) | Microscopia elettronica a scansione |
| EDS (Energy-Dispersive Spectroscopy) | Spettroscopia a dispersione di energia |
| FTIR | Spettroscopia FTIR |
| ATR-FTIR | FTIR in riflettanza totale attenuata |
| Swab plate count | Conta in piastra da tampone (swab) |
| Fujiwara test | Test di Fujiwara |
| Warranty claim | Reclamo in garanzia |
| Premature failure | Guasto prematuro |
| Manufacturing defect | Difetto di fabbricazione |
| Telescoping | Telescopaggio (deformazione assiale) |
| Glue line | Linea di colla / incollaggio |
| Brine seal | Guarnizione di concentrato |
| O-ring | Guarnizione O-ring |
| Lead element | Elemento di testa |
| Tail element | Elemento di coda |
| Normalized permeate flow | Portata permeato normalizzata |
| Normalized salt passage | Passaggio sale normalizzato |
| Compaction | Compattazione |
| Biofouling | Biofouling / sporcamento biologico |
| Scaling | Incrostazione |
| CIP (clean-in-place) | Lavaggio in posto |
| Reductive cleaning | Lavaggio riducente |
| Free chlorine | Cloro libero |
| ORP | Potenziale di ossido-riduzione |
| SDI (Silt Density Index) | Indice di intasamento (SDI) |
| Independent autopsy | Autopsia indipendente / di terza parte |
| Vendor-affiliated autopsy | Autopsia presso lab del costruttore |
| RMA (Return Material Authorization) | Autorizzazione al reso |
| Witness section / coupon | Campione di riscontro |

---

## Sources

- **ASTM D6908** — Integrity Testing of Water Filtration Membrane Systems (Rhodamine WT, Red Dye #40 tracers; PDT, VDT)
- **DuPont FilmTec** 45-D01650 (Symptoms of Trouble), 45-D01652 (High Pressure Drop), 45-D01504 (Tech Manual), 45-D01569 (Chlorination/Dechlorination), 45-D01575 (Iron/Mn Prevention)
- **Hydranautics** TSB 107 (Foulants & Cleaning), TSB 207 (Cleaning Procedures); Standard Workmanship and Materials Warranty
- **Toray** RO Element Three-Year Prorated Limited Warranty
- **Avista / Kurita** — Avista Membrane Autopsy with CEI; Foulant Identification leaflet
- **American Water Chemicals** — How to Identify Damaged RO Membranes
- **Genesys / PWT** — Membrane Autopsy services (five tiers)
- **Ecolab / Nalco Water** — Water Filtration and RO Membrane Autopsies
- **Vipanan Lab** (2025) — Hidden Causes of RO Membrane Failure
- *Reverse Osmosis Membranes Oxidation by Hypochlorite and Chlorine Dioxide: Spectroscopic Techniques vs Fujiwara Test* — DeSWater
- *Membrane Works* (AU) — Identifying oxidative damage using the Fujiwara test
- *Characterization of New and Fouled SWRO Membranes by ATR/FTIR Spectroscopy* — Applied Water Science (Springer)
- *Biofilm Formation on Reverse Osmosis Membranes Is Initiated and Dominated by Sphingomonas spp* — Applied and Environmental Microbiology
- *Isolation and characterization of Sphingomonadaceae from fouled membranes* — npj Biofilms & Microbiomes
- *Molecular weight insight into critical component contributing to RO membrane fouling* — npj Clean Water
- *Autopsy of Used RO Membranes from the Largest Seawater Desalination Plant in Oman* — Membranes 2022 (PMC9322904)
- Hardy Diagnostics — R2A Agar technical sheet
- *Why there is no warranty for RO membranes* — Netsol Water (industry exclusions summary)
