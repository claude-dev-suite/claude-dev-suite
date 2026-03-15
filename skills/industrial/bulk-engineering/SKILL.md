---
name: bulk-engineering
description: Bulk engineering approaches, tools, and implementation strategies for mass-generating PLC/DCS control logic, HMI displays, and I/O configurations from engineering databases. Use when planning or implementing automation of DCS engineering workflows.
user-invocable: false
---

# Bulk Engineering for DCS/PLC Automation

## The Problem

Typical mid-size plant: 200-500 motors, 100-300 valves, 500-2000 analog loops, 200-1000 discrete I/O. Manual configuration: 15-60 min/instance. Bulk engineering reduces months to days.

## General Pipeline

```
[Instrument Index / Motor List / Valve List]  (Excel/CSV input)
        |
        v
[Engineering Database]  (SQLite / structured data)
        |
        v
[Template Library]  +  [Configuration Rules]
        |
        v
[Code Generator]  (Python + Jinja2 / string replacement)
        |
        v
[DCS/PLC Project Files]  (PRT, XML, FHX, etc.)
        |
        v
[Validation]  (cross-reference check, naming, completeness)
        |
        v
[Import to DCS Engineering Tool]
```

## Input Documents

| Document | Contains | Used For |
|----------|---------|---------|
| Instrument Index (I/O List) | Every tag, type, range, units, alarms, P&ID ref | Tag creation, scaling, alarms |
| Motor List | Motors with power, starter type, protections, interlocks | Motor block generation |
| Valve List | Valves with type, fail position, actuator | Valve block generation |
| Control Narrative | Control logic descriptions per unit | Logic implementation |
| Cause & Effect Matrix | Safety/interlock logic in tabular form | Interlock logic generation |

## Output Artifacts

1. Controller programs (function block instances + logic + parameters)
2. I/O assignments (channel-to-tag mapping)
3. HMI/operator displays (graphics, faceplates, navigation)
4. Alarm configuration (priorities, limits, deadbands)
5. Historian tags (trend definitions, storage rates)
6. OPC server configuration

---

## ABB Freelance Bulk Engineering (Primary Target)

### Method 1: PRT File Templating (Recommended)

1. Create a "golden" template PRT for each type (motor, valve, analog, etc.)
2. Export as .prt file
3. Programmatically for each new instance:
   - Read template with UTF-16 encoding
   - Replace all identifiers (node name, MSR name, EAM signals, descriptions)
   - Update parameters
   - Set checksum to `0000000000`
   - Write output .prt file
4. Import each .prt into target project in Freelance Engineering Workplace

### Template Replacement Map (Motor)

| Element | Template | Replace With |
|---------|----------|-------------|
| Node name | `11301CLWW1A1` | `{area}{equip}{num}` |
| MSR primary | `11301.CLWW.1A1` | `{area}.{prefix}.{num}` |
| MSR short | `11301.CW.1A1` | `{area}.{short}.{num}` |
| Graph ref | `g11301CLWW1A1` | `g{area}{equip}{num}` |
| Description | `PHO RCK EXTR CNVR-1` | `{description}` |
| EAM signals | `XA1/XA2/XB1/XL/XS1/XS2` + node | Same prefixes + new node |

### Method 2: CSV Full Project Manipulation

Parse full project CSV, add new sections, re-import. More powerful but higher risk.

### Method 3: DMF Display Templating

1. Create template display in DigiVis
2. Export as .DMF
3. For each new display:
   - Replace TXL text entries (tag names, descriptions, units)
   - Replace ODB variable bindings (DIGI addresses)
   - Update display navigation references

### Key Challenges

1. **UTF-16 encoding**: Must read/write correctly
2. **Internal cross-references**: EAM, MSR, LAD:PARA_REF must be consistent
3. **Checksum**: Set to 0, Freelance recalculates
4. **Unique naming**: No duplicates allowed
5. **Area mapping**: Tags must map to correct area codes

---

## Siemens TIA Portal Bulk Engineering

### TIA Openness API (.NET)

```csharp
using Siemens.Engineering;
using Siemens.Engineering.SW;

TiaPortal tia = new TiaPortal(TiaPortalMode.WithUserInterface);
Project project = tia.Projects.Open(new FileInfo(@"Project.ap17"));
PlcSoftware sw = device.GetService<PlcSoftware>();
sw.BlockGroup.Blocks.Import(new FileInfo(@"MotorFB.xml"), ImportOptions.Override);
PlcTagTable table = sw.TagTableGroup.TagTables.Create("Motors");
```

### SiVArc (HMI Auto-Generation)

Rules-based: define rules like "For every MotL FB, create faceplate." Reads PLC structure, auto-generates WinCC displays.

---

## Emerson DeltaV Bulk Engineering

### Class-Based Configuration (Most Powerful)

Define module template (class) -> instantiate many -> template changes propagate to all instances.

### FHX File Generation

```
MODULE TEMPLATE "MT_MOTOR_1SPD" /
  MODULE_CLASS = DEVICE /
{
  FUNCTION_BLOCK "DC-1" / DEFINITION = "DC" /
  { ATTRIBUTE MODE_BLK.TARGET = AUTO ; ... }
}
```

Text-based, parseable, generatable with Python.

---

## Recommended Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Language | Python 3.10+ | Core automation |
| Excel I/O | openpyxl, pandas | Read input spreadsheets |
| Templates | Jinja2 / string.Template | Generate output files |
| Database | SQLite | Engineering database |
| File I/O | codecs (UTF-16) | Read/write Freelance files |
| XML | lxml | PLCopen XML, SimaticML |
| Validation | pydantic | Data validation |
| GUI (opt) | Streamlit / PyQt6 | User interface |
| VCS | Git | Version control |

## Python Template Approach

```python
import codecs
import re
import pandas as pd

# Read motor list
motors = pd.read_excel('motor_list.xlsx')

# Read template
with codecs.open('MOT_template.prt', 'r', 'utf-16') as f:
    template = f.read()

# Generate for each motor
for _, motor in motors.iterrows():
    output = template
    output = output.replace('11301CLWW1A1', motor['node_name'])
    output = output.replace('11301.CLWW.1A1', motor['msr_name'])
    output = output.replace('PHO RCK EXTR CNVR-1', motor['description'])
    # ... more replacements

    # Reset checksum
    output = re.sub(r'\[CHECKSUM\];.*', '[CHECKSUM];0000000000', output)

    with codecs.open(f"{motor['node_name']}.prt", 'w', 'utf-16-le') as f:
        f.write('\ufeff' + output)
```

---

## NAMUR NE 148 Requirements

The NAMUR standard for automation engineering tools mandates:

1. **Single data source** - one instrument defined once, used everywhere
2. **Template-based engineering** - define once, instantiate many
3. **Bulk operations** - create/modify/delete in mass
4. **Consistency checking** - validate cross-references
5. **Import/export** - Excel and P&ID tool integration
6. **Version management** - track changes
7. **Multi-user** - concurrent engineering
8. **Target independence** - generate for multiple DCS targets

---

## Third-Party Tools

| Tool | Vendor | Description |
|------|--------|-------------|
| SmartPlant Instrumentation | AVEVA | Central instrument DB, generates DCS configs for all vendors |
| COMOS | Siemens | P&ID to PLC code, TIA Portal integration |
| Engineering Base | AUCOTEC | Object-oriented, multi-DCS output |
| Unity App Generator | Schneider | Excel-based Modicon PLC generation |
| Ignition | Inductive Automation | Database-driven SCADA/HMI with Python scripting |

---

## Asset-Centric vs Signal-Centric

**Signal-Centric (Traditional):** Start from I/O signals. AI_Card1_Ch3 -> create tag -> configure. Matches hardware but disconnected from equipment.

**Asset-Centric (Modern):** Start from physical equipment. Pump P-101A includes motor, flow, pressure, vibration, protection. Easier to template. Aligned with ISA-88/95.

| Approach | ABB Freelance | Siemens PCS 7 | Emerson DeltaV |
|----------|--------------|---------------|----------------|
| Support | Moderate (MSR hierarchy) | Moderate (plant hierarchy) | Strong (class-based) |
