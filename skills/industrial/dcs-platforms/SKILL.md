---
name: dcs-platforms
description: Reference for major DCS/PLC platforms - ABB Freelance, Siemens PCS7/TIA Portal, Emerson DeltaV, Honeywell Experion. Use when comparing platforms, mapping function blocks across vendors, or designing cross-platform solutions.
user-invocable: false
---

# Major DCS/PLC Platforms Reference

## Platform Overview

| Platform | Vendor | Primary Use | Engineering Tool | HMI |
|----------|--------|------------|-----------------|-----|
| Freelance | ABB | Small-mid process | Control Builder F / EWP | DigiVis |
| PCS 7 | Siemens | Large process | SIMATIC Manager + CFC/SFC | WinCC |
| TIA Portal | Siemens | PLC/HMI unified | TIA Portal | WinCC Unified |
| DeltaV | Emerson | Process DCS | DeltaV Explorer + Control Studio | DeltaV Operate/Live |
| Experion PKS | Honeywell | Large process | Control Builder | HMIWeb |

---

## ABB Freelance

### Key Characteristics
- Compact DCS for small-medium plants
- FBD/LAD primary programming
- File-based engineering (PRT, DMF, CSV)
- BST_LIB (standard) + BST_USER (custom) function block libraries
- MSR points as primary addressable entities
- DigiVis for operator displays
- DIGI protocol for internal communication

### Motor Control: IDF_1 + MOT_T1

```
MOTOR1 Structure (11 signals):
  IN:  AC (auto cmd), PR0 (safety), MA (req auto), MM (req manual)
  OUT: ILK (interlock), RDY (ready), RUN (running), LOC (local), AUT (auto), FLR (fault), SDS (shutdown)
```

### Automation Approach
- PRT file templating (text replacement)
- CSV project parsing/generation
- No public API (file manipulation is the standard approach)
- Checksum can be set to 0; Freelance recalculates on import

---

## Siemens PCS 7

### Project Hierarchy
```
PCS 7 Project
  +-- OS (Operator Station - WinCC)
  +-- AS (Automation Station - S7-400/1500)
  |     +-- CFC Charts (Continuous Function Charts)
  |     +-- SFC Charts (Sequential Function Charts)
  +-- Hardware Configuration
  +-- Plant Hierarchy (technological view)
  +-- Process Tag Management
```

### Motor Control: MotL Block (APL)

```
Inputs:  ModLiOp, AutModOp, ManModOp, FbkRun, Protect, Intlock01, CmdStrt, CmdStop, MonTiRun, MonTiStp
Outputs: ModLiOp_Out, StartOut, RunOut, StopOut, Trip, SwiToLoc
```

Other APL blocks: MotR (reversing), MotSpdL (speed), VlvL (valve), PIDConL (PID), Intlk02/04/08/16 (interlock), MonDi/MonAn (monitoring)

### File Formats
- `.s7p` / `.s7l` - S7 project/library
- `.pdl` - WinCC display
- `.xml` - SimaticML block export (proprietary schema)
- `.aml` - AutomationML (PCS 7 V9+)
- `.scl` / `.awl` - ST / IL source

### Automation: TIA Portal Openness API (.NET)

```csharp
using Siemens.Engineering;
TiaPortal tia = new TiaPortal(TiaPortalMode.WithUserInterface);
Project project = tia.Projects.Open(new FileInfo(@"Project.ap17"));
PlcSoftware sw = device.GetService<PlcSoftware>();
sw.BlockGroup.Blocks.Import(new FileInfo(@"Block.xml"), ImportOptions.Override);
```

Capabilities: create projects, import/export blocks as XML, create tags, generate HMI screens, compile, download.

### HMI: SiVArc
Rules-based auto-generation: "For every MotL instance, create a faceplate." Reads PLC structure, generates WinCC elements.

---

## Emerson DeltaV

### Architecture
```
DeltaV System
  +-- Plant Areas
  |     +-- Control Modules (CM) - individual loops
  |     +-- Equipment Modules (EM) - sequences
  |     +-- Phases - ISA-88 batch
  +-- Controllers (M-series, S-series)
  +-- I/O Subsystem
  +-- Module Templates (reusable designs)
```

### Motor Control: DC (Device Control) Block

```
Inputs:  MODE_BLK.TARGET, IN_D1 (running fbk), IN_D2 (stopped fbk), IN_D3 (fault), IN_D4 (available), INTERLOCK, PERMIT
Outputs: OUT_D1 (start), OUT_D2 (stop), SP_D (setpoint), PV_D (process value)
Config:  IO_OPTS, FBK_STRATEGY, FBK_TIMEOUT
```

### Automation: Class-Based + Bulk Edit
- **Module Templates**: Define once, instantiate many. Change propagation on template update.
- **Bulk Edit**: Export to Excel, modify, import back.
- **FHX Files**: Text-based config format, parseable and generatable.

```
MODULE TEMPLATE "MT_MOTOR_1SPD" /
  MODULE_CLASS = DEVICE /
{
  FUNCTION_BLOCK "DC-1" / DEFINITION = "DC" /
  { ATTRIBUTE MODE_BLK.TARGET = AUTO ; ... }
}
```

### Tag Structure
```
Area/ControlModule/FunctionBlock/Parameter
Example: PLANT/M_101/DC-1/PV_D
```

---

## Honeywell Experion PKS

### Motor Control: MOTOR Block

```
Inputs:  SP (cmd), MODE, INTLK, FB_RUN, FB_STOP, FB_TRIP, LOCAL
Outputs: OP (output), STATUS, ALARM
Config:  FB_TIME (monitor time), STRATEGY
```

### Programming
- **CL (Control Language)**: Proprietary ST-like language
- **FBD**: Graphical function blocks
- **Custom Algorithms (CA)**: Complex logic

### Automation
- CSV/Excel bulk point import
- COM-based API (Experion PKS API)
- OPC DA/UA interface

---

## Cross-Platform Motor Block Mapping

| Concept | ABB Freelance | Siemens PCS 7 | Emerson DeltaV | Honeywell |
|---------|--------------|---------------|----------------|-----------|
| Block | IDF_1 / MOT_T1 | MotL | DC | MOTOR |
| Start Input | AC | CmdStrt | SP_D | SP |
| Run Feedback | RUN | FbkRun | IN_D1 | FB_RUN |
| Fault | FLR | Protect/Trip | IN_D3 | FB_TRIP |
| Interlock | ILK | Intlock01 | INTERLOCK | INTLK |
| Auto/Manual | AUT/MA/MM | AutModOp/ManModOp | MODE_BLK | MODE |
| Local/Remote | LOC | ModLiOp | IO_OPTS | LOCAL |
| Monitor Time | Lz (T#5s) | MonTiRun | FBK_TIMEOUT | FB_TIME |
| Data Structure | DBS:RECORD (MOTOR1) | Instance DB | Module params | Point params |

## Cross-Platform Function Block Mapping

| Function | ABB Freelance | Siemens PCS 7 | Emerson DeltaV | Honeywell |
|----------|--------------|---------------|----------------|-----------|
| Motor | IDF_1 / MOT_T1 | MotL / MotR | MOTOR_BASIC / DC | MOTOR |
| On/Off Valve | VLV_1 | Valve | DEVICE_DISCR | DVALVE |
| Mod. Valve | VLV_2 | AnlgValve | DEVICE_AO | AVALVE |
| PID | PID | PIDConL | PID_PLUS | PID |
| Analog In | M_ANA | MEAS_MON | AI | AI |
| Digital In | M_BIN | MON_DIGI | DI | DI |

## IEC 61131-3 Support Comparison

| Language | ABB Freelance | Siemens PCS7/TIA | Emerson DeltaV | Honeywell | Schneider |
|----------|--------------|------------------|----------------|-----------|-----------|
| LD | Yes | Yes (KOP) | No | Via ControlEdge | Yes |
| FBD | Yes (primary) | Yes (FUP/CFC) | Yes (primary) | Yes | Yes |
| ST | Yes | Yes (SCL) | Partial (CALC) | CL (similar) | Yes |
| IL | No | Yes (AWL) | No | No | Yes (deprecated) |
| SFC | Limited | Yes (S7-GRAPH) | Yes | Yes | Yes |
| OOP | No | TIA V16+ | No | No | No |
| PLCopen XML | No | Partial | No | No | Yes |

## Bulk Engineering Comparison

| Approach | ABB Freelance | Siemens TIA | Emerson DeltaV | Honeywell |
|----------|--------------|-------------|----------------|-----------|
| Primary | PRT file templating | Openness API (.NET) | Class-based + Bulk Edit | CSV point import |
| File format | PRT/CSV (text) | XML (SimaticML) | FHX (text) | CSV |
| API | None (file-based) | TIA Openness (.NET) | COM API | COM API |
| Scripting | Python file manipulation | C#/VB.NET | Python + FHX | VBScript |
| HMI gen | DMF templating | SiVArc rules | Auto-faceplates | Template displays |
