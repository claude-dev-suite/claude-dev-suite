---
name: isa-standards
description: ISA-5.1 tag naming, ISA-88 batch control, ISA-95 enterprise integration, ISA-18.2 alarm management, and ISA-101 HMI standards reference. Use when working with instrument tags, naming conventions, or plant hierarchy.
user-invocable: false
---

# ISA Standards Reference for Industrial Automation

## ISA-5.1: Instrumentation Symbols and Identification

### Tag Number Structure

```
[Area].[Functional ID].[Loop Number][Suffix]

Functional ID = [First Letter: measured variable] + [Succeeding Letters: function/modifier]

Examples from project:
  11301.PDI.076A   = Area 11301, Pressure Differential Indicator, loop 076, suffix A
  11301.SALL.020A  = Area 11301, Speed Alarm Low-Low, loop 020, suffix A
  11301.FIC.056A   = Area 11301, Flow Indicating Controller, loop 056, suffix A
  11301.CLWW.1A1   = Area 11301, Conveyor (equipment tag), unit 1A1
```

### First Letter (Measured/Initiating Variable)

| Letter | Variable | As Succeeding Letter |
|--------|---------|---------------------|
| A | Analysis (pH, O2, conductivity) | Alarm |
| B | Burner, Combustion | User's choice |
| C | User's Choice | Control |
| D | User's Choice | Differential |
| E | Voltage (EMF) | Sensor/Element |
| F | Flow Rate | Ratio/Fraction |
| G | User's Choice | Glass/Gauge |
| H | Hand (Manual) | High |
| I | Current (Electrical) | Indicate |
| J | Power | Scan |
| K | Time, Schedule | Time Rate of Change |
| L | Level | Light/Low |
| M | User's Choice | Middle/Intermediate |
| N | User's Choice | User's choice |
| O | User's Choice | Orifice/Restriction |
| P | Pressure, Vacuum | Point (test) |
| Q | Quantity | Totalize/Integrate |
| R | Radiation | Record |
| S | Speed, Frequency | Switch/Safety |
| T | Temperature | Transmit |
| U | Multivariable | Multifunction |
| V | Vibration, Mechanical Analysis | Valve/Damper |
| W | Weight, Force | Well/Probe |
| X | Unclassified | Unclassified |
| Y | Event, State, Presence | Relay/Compute |
| Z | Position, Dimension | Actuator/Driver |

### Common Tag Combinations

**Flow:**
FE (element), FT (transmitter), FI (indicator), FIC (indicating controller), FCV (control valve), FAH (alarm high), FAL (alarm low), FAHH (alarm high-high), FALL (alarm low-low), FSH (switch high), FSL (switch low), FQI (quantity indicator/totalizer), FR (recorder)

**Level:**
LT, LI, LIC, LCV, LAH, LAL, LAHH, LALL, LSH, LSL, LSHH, LSLL, LG (gauge glass)

**Pressure:**
PT, PI, PIC, PCV, PAH, PAL, PAHH, PALL, PDI (differential indicator), PDIC, PDT, PSH, PSL, PSV (safety valve), PG (gauge)

**Temperature:**
TE (element), TT, TI, TIC, TCV, TAH, TAL, TSH, TSL, TR (recorder), TW (thermowell)

**Position/Valve:**
ZT (position transmitter), ZI, ZIC, ZAH (open alarm), ZAL (closed alarm), ZSH (open switch), ZSL (closed switch), ZSHH, ZSLL

**Speed:**
ST, SI, SIC, SAH, SAL, SAHH, SALL

**Current (Electrical):**
II (current indicator), IIC (current indicating controller), IAH, IAHH

**Vibration:**
VI (vibration indicator), VAH, VAHH

### Equipment Tags (Non-ISA, Plant-Specific)

| Code | Equipment Type | Example |
|------|---------------|---------|
| K | Kiln/Equipment | 11301.K.9 |
| N | Pump | 11301.N.3A |
| F | Feeder | 11301.F.4 |
| WG | Weighing belt | 11301.WG.8 |
| SR | Screen/Separator | 11301.SR.9A |
| CL/CLWW | Conveyor (weigh) | 11301.CLWW.1A1 |
| KC | Crusher | 11301.KC.F.4 |
| EL | Elevator | 11301.EL.AA |
| Z | Silo/Storage | 11301.Z.2A |

### Tag Naming Variations by Region/Vendor

| Convention | Format | Example |
|-----------|--------|---------|
| ISA Pure | FIC-101A | American standard |
| European (this project) | 11301.FIC.101A | Area.Function.LoopSuffix |
| Siemens/KKS | +FIC101A= | German power plant standard |
| DeltaV path | FIC-101A/PV | With parameter path |
| Honeywell | FIC101A.PV | With point parameter |

---

## ISA-88: Batch Control (S88)

### Physical Model Hierarchy

```
Enterprise
  +-- Site
       +-- Area
            +-- Process Cell
                 +-- Unit
                      +-- Equipment Module (EM)
                           +-- Control Module (CM)
```

### Mapping to DCS Engineering

| ISA-88 Concept | DCS Implementation | Example |
|----------------|-------------------|---------|
| Control Module | Function block instance | Motor block, valve block, PID loop |
| Equipment Module | Sequence/SFC | Reactor filling sequence |
| Unit | Process unit with sequences | Reactor R-101 |
| Process Cell | Group of units | Production Line A |

### Control Module Types (Standard Templates)

- **Motor CM**: Start/Stop, feedback, interlock, mode selection
- **On/Off Valve CM**: Open/Close, position feedback, interlock
- **Modulating Valve CM**: Analog output, position feedback, PID output
- **PID Loop CM**: AI input, PID algorithm, AO output
- **Analog Input CM**: Scaling, filtering, alarm limits
- **Digital Input CM**: State detection, alarm on state

---

## ISA-95: Enterprise-Control Integration

### Equipment Hierarchy (extends ISA-88 upward)

```
Enterprise > Site > Area > Work Center > Work Unit
```

### Relevance to Tag Naming

Tags should encode the hierarchy. Example: `11301.FIC.056A`
- `11301` = Area identifier (maps to ISA-95 Area)
- `FIC` = Function (ISA-5.1)
- `056` = Loop number (unique within area)
- `A` = Suffix (parallel instance)

---

## ISA-18.2: Alarm Management

### Alarm Priority Distribution (Guideline)

| Priority | Percentage | Response Time |
|----------|-----------|--------------|
| Critical (1) | ~5% | Immediate |
| High (2) | ~15% | < 5 minutes |
| Medium (3) | ~30% | < 30 minutes |
| Low (4) | ~50% | Next round |

### Alarm Tag Properties for Bulk Engineering

Each alarm tag requires: Priority, Setpoint (limit), Deadband, On-delay, Off-delay, Alarm class (Process/Safety/Equipment), Shelving capability.

### Naming Convention for Alarms

```
{Area}.{Variable}{AlarmType}.{Loop}{Suffix}
  PAH  = Pressure Alarm High
  PAHH = Pressure Alarm High-High
  PAL  = Pressure Alarm Low
  PALL = Pressure Alarm Low-Low

In Freelance EAM: XA1 = primary alarm, XA2 = secondary alarm
```

---

## ISA-101: Human Machine Interfaces

### Display Hierarchy

| Level | Name | Content | Quantity |
|-------|------|---------|---------|
| 1 | Plant Overview | Entire plant, KPIs | 1-3 |
| 2 | Area Overview | One process area | 5-20 |
| 3 | Unit Detail | One unit operation | 20-100 |
| 4 | Faceplate/Detail | One control loop | Auto-generated |

### High-Performance HMI Principles

- Gray backgrounds (not black)
- Analog representations (bar graphs, sparklines, not just numbers)
- Minimal animation (no rotating equipment, no flowing pipes)
- Color reserved for abnormal states (alarms, deviations)
- Consistent navigation (plant hierarchy)
- Situational awareness focus
