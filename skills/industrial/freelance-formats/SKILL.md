---
name: freelance-formats
description: Complete ABB Freelance DCS file format reference for DMF, PRT, and CSV project files. Use when analyzing, parsing, or generating Freelance engineering files.
user-invocable: false
---

# ABB Freelance File Formats Reference

## Encoding

All Freelance files use **UTF-16LE** with BOM (`FF FE`). Semicolon-delimited. CRLF line endings.

```python
import codecs
with codecs.open(filepath, 'r', 'utf-16') as f:
    content = f.read()
```

When writing back, use `encoding='utf-16-le'` and prepend BOM `\ufeff`.

## DUMP_FILETYPE Values

| Value | Meaning |
|-------|---------|
| 101 | Full project CSV export |
| 102 | Partial project (.prt) |

## PRT Files (Partial Project, DUMP_FILETYPE 102)

Self-contained export of one or more function block sheets.

### Structure

```
[Program-Generated File -- DO NOT MODIFY]
[DUMP_VERSION];2400
[DUMP_FILETYPE];102
[BEGIN_PARTIALPROJECTHEADER];<version>;<timestamps>
[END_PARTIALPROJECTHEADER]

[BEGIN_NODESECTION]
  [PB:NODE];1;<container_type>;<node_name>
  [PB:NO_NODE];0
[END_NODESECTION]

[UID:ACCNODE];<access_control_data>

[BEGIN_DBSSECTION]
  [DBS:RECORD];flags;struct_name;description;in_count;out_count
  [DBS:COMPREC];flags;pin_name;data_type;description;index;initial_value;
  [DBS:NO_COMP];0
  [DBS:NO_RECORD];0
[END_DBSSECTION]

[BEGIN_EAMSECTION]
  [EAM:RECORD];flags;eam_name;is_structured;type_or_struct;description;active;direction
  [EAM:NO_RECORD];0
[END_EAMSECTION]

[BEGIN_EAMINITSECTION]
  [EAMINIT:NO_RECORD];0
[END_EAMINITSECTION]

[BEGIN_OPCADDRESSSECTION]
  [OPCADDRESS:NO_RECORD];0
[END_OPCADDRESSSECTION]

[BEGIN_MSRSECTION]
  [MSR:RECORD];flags;msr_name;fb_library;fb_type;parent_path;description;;cycle_time;priority;;;;;redundancy
  [UID:ACCMSR];0
  [MSR:NO_RECORD];0
[END_MSRSECTION]

[BEGIN_MAKROSECTION]
  [MAKRO:NOMOREMAKRO];0
[END_MAKROSECTION]

[BEGIN_PBAUMSECTION]
  [PBV:OBJPATH];flags;container;fb_name
  [POM:BLTHDR];;year;month;day;hour;minute;second;version
  [DOC:FOOTERB1-3];...
  [DOC:FOOTERP];...
  [DOC:FOOTERF1-3];...
  [POM:CRVERS];timestamp_data
  [POM:OBJCOMM];0;
  [UID:ACCNODE];0
  [START_LFBS]
    [LAD:HEADER];width;height;cols;rows;grid_size
    [LAD:SIGN];x1;y1;x2;y2;data_type;flags
    [LAD:BSINST];x;y;fb_name;fb_library;flags;params...
    [LAD:PINDESCR];direction;row;index;flags;data_type;p1;p2;p3
    [LAD:MSR_REF];msr_reference
    [PARA:PARADATA];param_count;name1;type_id;type_name;size;value;...
    [PATCHTABLE:RECORD];flags;name;library;param_count;data...
    [LAD:LADINST];type;row;col_count;direction;flags...
    [LAD:PARA_REF];variable_name;data_type;ref_flags
  [STOP_LAD]
  [PBV:NO_BLATT];0
[END_PBAUMSECTION]

[START_EAM2GWY]
  [EAM2GWY:HEADER];count
  [GWY:ACCEAM];eam_name;flags;SRVT;type;flags;SRVO;rw;params
[STOP_EAM2GWY]

[START_MSR2GWY]
  [MSR2GWY:HEADER];count
  [GWY:ACCMSR];msr_name;flags;SRVT;type;flags;SRVO;rw;params
[STOP_MSR2GWY]

[CHECKSUM];value
```

### DBS Section (Data Block Structure)

Defines structured data types (like a typedef):

```
[DBS:RECORD];1;MOTOR1;STANDARD MOTOR STRUCTURE;11;11
[DBS:COMPREC];1;AC;BOOL;AUTOMATIC START COMMAND (IN);0;0;
[DBS:COMPREC];1;RUN;BOOL;MOTOR RUNNING (OUT);5;0;
```

Fields: `flags;name;type;description;index;initial_value`

### EAM Section (External Access Manager)

Signals published to HMI/SCADA:

```
[EAM:RECORD];1;11301CLWW1A1;1;MOTOR1;PHO RCK EXTR CNVR-1;1;1
```

- `is_structured=1` references DBS structure, `is_structured=0` is simple type
- Sub-signal naming: `XA1<name>`=Alarm1, `XA2<name>`=Alarm2, `XB1<name>`=BinaryStatus, `XL<name>`=Status/Running, `XS1<name>`=StartCmd, `XS2<name>`=StopCmd

### MSR Section (Measurement/Control Points)

```
[MSR:RECORD];1;11301.CLWW.1A1;BST_LIB_MSR;IDF_1;11301.CW.1A1;PHO RCK EXTR CNVR-1;;16384;1;;;;;2
```

Fields: `flags;msr_name;fb_library;fb_type;parent_path;description;;cycle_time;priority;;;;;redundancy`

### Function Block Libraries

| Library | Type | Description |
|---------|------|-------------|
| BST_LIB_FB | Standard FB | Built-in blocks (AND, OR, TIMER) |
| BST_LIB_EXT | Standard Extended | IDF_1 (motor), M_BIN, M_ANA, PID |
| BST_LIB_MSR | Standard MSR | Standard control point types |
| BST_USER_FB | User FB | Custom blocks (MOT_T1) |
| BST_USER_MSR | User MSR | Custom MSR types |

### Ladder Diagram Encoding

- `[LAD:HEADER];width;height;cols;rows;grid_size` - Canvas dimensions
- `[LAD:SIGN];x1;y1;x2;y2;type;flags` - Wire segments (signal connections)
- `[LAD:BSINST];x;y;name;library;...` - Function block placement
- `[LAD:PINDESCR];dir;row;idx;flags;type;...` - Pin descriptions (0=input, 1=output)
- `[LAD:LADINST];type;row;...` - Ladder instructions (1=contact, 46=comment, 96=output)
- `[LAD:PARA_REF];varname;type;...` - Variable binding
- `[LAD:MSR_REF];msr_name` - Link to MSR definition

### PARA:PARADATA Type IDs

| ID | Type | Example |
|----|------|---------|
| 3 | INT | Numeric values |
| 4 | TIME/WORD/BYTE | Timer values |
| 5 | CHECK/MTEXT/MPRIO | Boolean (j/n), Text, Priority |
| 7 | DMSTIME | DMS timestamp |
| 13 | CUSTSELLIST | Custom selection list |

### Gateway Sections

```
[GWY:ACCEAM];11301CLWW1A1;1;SRVT;1;1;SRVO;3;0;1
```

- SRVT = Service Type (1=read, 3=read/write)
- SRVO = Service Object access level

### Checksum

`[CHECKSUM];0000045529` - Set to `0000000000` when generating; Freelance recalculates on import.

---

## DMF Files (Display Macro File)

HMI operator display definition.

### Structure

```
[DMF, version, "name", flags]
{
  MFV,<major_version>;     // Macro File Version (61)
  EDV,<editor_version>;    // Editor Version
}

[TXL, id, "name", flags]   // Text List (lookup table)
{
  TXT <index>,"<string>";  // Indexed text entries
}

[ODB, id, "name", flags]   // Object Data Block (variable bindings)
{
  TXL,<txl_ref>;
  VAR <type>,<varname>, EXT,"<protocol>" <index>,"<label>", <x>,<y>, <flags>;
}

// Graphical elements:
[BUT, id, "name", flags] { ... }   // Buttons
[AA, id, "name", flags] { ... }    // Analog displays
[GS, id, "name", flags] { ... }    // Group switches
[TXT, id, "name", flags] { ... }   // Static text
[LIN, id, "name", flags] { ... }   // Lines
[PLG, id, "name", flags] { ... }   // Polygons
[SGM, id, "name", flags] { ... }   // Segments
[TCN, id, "name", flags] { ... }   // Technical containers
[MSL, id, "name", flags] { ... }   // MSR List
[PIL, id, "name", flags] { ... }   // Process Image List
[AML, id, "name", flags] { ... }   // Alarm List
```

### ODB Variable Binding

```
VAR BOOL,11301K9.RUN, EXT,"DIGI,26429440,2642,131" 0,"" , -1,-1, 3,1, 6;
VAR REAL,11301IICLWW1A1.PV, EXT,"DIGI,26429440,2780,131" 5,"" , -1,-1, 4,1;
```

DIGI protocol: `"DIGI,<server_id>,<point_id>,<node_id>"`

Variable suffixes: `.RUN` (running), `.FLR` (fault), `.ILK` (interlock), `.AUT` (auto), `.LOC` (local), `.SDS` (shutdown), `.PV` (process value), `.HH/.H/.L/.LL` (alarm limits), `.BQ` (bad quality)

### Graphical Element Properties

- `POS,x1,y1,x2,y2;` - Bounding rectangle (0-16000 range)
- `ODB,id;` - Reference to ODB section
- `TXL,id;` / `TI1,idx;` / `TI2,idx;` - Text references
- `COL,c1,c2,c3,c4;` - Colors
- `VAR,var_index;` - ODB variable binding
- `ACC,level,group;` - Access control
- `ATR,"font",size,style;` - Text attributes
- `AK1 p1,p2,...;` - Button action definition

---

## CSV Full Project Export (DUMP_FILETYPE 101)

Same section-based format as PRT but contains entire project:

```
[BEGIN_PROJECTHEADER];project_name;;controller_type;...timestamps
[BEGIN_AREADEFINITION];area_count
  [AREA];1;letter;name_length;area_name
[END_AREADEFINITION]
[START_COLTAB]
  [COLTAB];params
  [COLINFO];color1;color2;flags;index
```

Then ALL DBS, EAM, MSR, and PBAUMSECTION entries for every function block in the project.

---

## Template Replacement Map for Motor Instances

| Element | Template Pattern | Replace With |
|---------|-----------------|-------------|
| Node name | `11301CLWW1A1` | `{area}{equip_code}{number}` |
| MSR primary | `11301.CLWW.1A1` | `{area}.{msr_prefix}.{number}` |
| MSR short | `11301.CW.1A1` | `{area}.{msr_short}.{number}` |
| Graph ref | `g11301CLWW1A1` | `g{area}{equip_code}{number}` |
| Description | `PHO RCK EXTR CNVR-1` | `{description}` |
| EAM Fault | `XA111301CLWW1A1` | `XA1{node_name}` |
| EAM SDS | `XA211301CLWW1A1` | `XA2{node_name}` |
| EAM Local | `XB111301CLWW1A1` | `XB1{node_name}` |
| EAM Running | `XL11301CLWW1A1` | `XL{node_name}` |
| EAM Start | `XS111301CLWW1A1` | `XS1{node_name}` |
| EAM Stop | `XS211301CLWW1A1` | `XS2{node_name}` |
