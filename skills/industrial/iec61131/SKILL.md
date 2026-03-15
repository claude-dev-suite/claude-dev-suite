---
name: iec61131
description: IEC 61131-3 programming languages reference (LD, FBD, ST, IL, SFC), PLCopen standards, program organization units, data types. Use when discussing PLC programming standards or cross-platform compatibility.
user-invocable: false
---

# IEC 61131-3 Programming Languages Reference

## Overview

IEC 61131-3 defines 5 programming languages for PLCs, all interchangeable:

| Language | Type | Best For | Status |
|----------|------|----------|--------|
| LD (Ladder Diagram) | Graphical | Discrete logic, motor interlocks | Active |
| FBD (Function Block Diagram) | Graphical | Continuous control, PID, analog | Active (DCS primary) |
| ST (Structured Text) | Textual | Complex calculations, algorithms | Active (most expressive) |
| IL (Instruction List) | Textual | Low-level, assembly-like | Deprecated (3rd ed. 2013) |
| SFC (Sequential Function Chart) | Graphical | Sequences, batch, state machines | Active |

## Program Organization Units (POUs)

### PROGRAM
Top-level executable, associated with a task (scan cycle).

### FUNCTION_BLOCK (FB)
Reusable block with **persistent internal state** (memory between calls). Used for motors, PID, timers, counters.

```
FUNCTION_BLOCK MotorControl
VAR_INPUT
    StartCmd : BOOL;
    StopCmd  : BOOL;
    FbkRun   : BOOL;
    Interlock: BOOL;
END_VAR
VAR_OUTPUT
    StartOut : BOOL;
    Running  : BOOL;
    Fault    : BOOL;
END_VAR
VAR
    MonTimer : TON;
    State    : INT;
END_VAR
```

### FUNCTION (FC)
Stateless, no memory. Always returns same output for same input.

## Data Types

### Elementary
BOOL, BYTE, WORD, DWORD, LWORD, SINT, INT, DINT, LINT, USINT, UINT, UDINT, ULINT, REAL, LREAL, TIME, DATE, TIME_OF_DAY, DATE_AND_TIME, STRING, WSTRING

### Derived (User-Defined)
```
TYPE MotorData :
STRUCT
    Running  : BOOL;
    Fault    : BOOL;
    Speed    : REAL;
    Runtime  : TIME;
END_STRUCT
END_TYPE
```

## Variable Scopes

| Scope | Keyword | Description |
|-------|---------|-------------|
| Local | VAR | Internal to POU |
| Input | VAR_INPUT | Read-only input parameter |
| Output | VAR_OUTPUT | Output parameter |
| In/Out | VAR_IN_OUT | Bidirectional parameter |
| Global | VAR_GLOBAL | Accessible by all POUs |
| External | VAR_EXTERNAL | Reference to global |
| Temp | VAR_TEMP | No persistence |
| Config | VAR_CONFIG | Set at download |
| Constant | CONSTANT | Named constant |

## Language Details

### ST (Structured Text) - Most Relevant for Code Generation

```
IF Motor.FbkRunning AND NOT Motor.Fault THEN
    Motor.Status := RUNNING;
    Motor.Runtime := Motor.Runtime + T#1s;
ELSIF Motor.Fault THEN
    Motor.Status := FAULTED;
    Motor.AlarmActive := TRUE;
END_IF;

CASE State OF
    0: (* IDLE *)
        IF StartCmd AND NOT Interlock THEN State := 1; END_IF;
    1: (* STARTING *)
        StartOut := TRUE;
        MonTimer(IN:=TRUE, PT:=T#10s);
        IF FbkRun THEN State := 2; END_IF;
        IF MonTimer.Q THEN State := 99; END_IF;
    2: (* RUNNING *)
        IF StopCmd THEN State := 3; END_IF;
    3: (* STOPPING *)
        StartOut := FALSE;
    99: (* FAULT *)
        StartOut := FALSE;
        Fault := TRUE;
END_CASE;
```

### SFC (Sequential Function Chart)

Elements: Steps, Transitions, Actions
- Steps contain actions (in any language)
- Transitions are boolean conditions
- Action qualifiers: N (non-stored), S (set), R (reset), L (time limited), D (delayed), P (pulse)
- Parallel branches (simultaneous), Alternative branches (selective)

### FBD (Function Block Diagram)

Signal flow left-to-right. Blocks represent functions. Wires connect outputs to inputs. Primary language in DCS (PCS 7 CFC, DeltaV Control Studio, ABB Freelance).

### LD (Ladder Diagram)

Based on relay logic. Contacts (NO/NC), coils, timers, counters. Left/right power rails. Rungs top-to-bottom.

## PLCopen Standards

| TC | Topic | Description |
|----|-------|-------------|
| TC1 | Standards | IEC 61131-3 compliance testing |
| TC2 | Motion Control | MC_MoveAbsolute, MC_Stop, MC_Home, etc. |
| TC3 | Software Engineering | Coding guidelines |
| TC4 | Communications | OPC UA mapping |
| TC5 | Safety | IEC 61508 extensions |
| TC6 | XML Exchange | Vendor-neutral program interchange format |

## PLCopen XML Format (TC6)

```xml
<project xmlns="http://www.plcopen.org/xml/tc6_0201">
  <types>
    <pous>
      <pou name="MotorControl" pouType="functionBlock">
        <interface>
          <inputVars>
            <variable name="Start"><type><BOOL/></type></variable>
          </inputVars>
          <outputVars>
            <variable name="Running"><type><BOOL/></type></variable>
          </outputVars>
        </interface>
        <body>
          <ST><xhtml><!-- Structured Text --></xhtml></ST>
        </body>
      </pou>
    </pous>
  </types>
</project>
```

Supported by: CODESYS, ABB AC500, Schneider, Beckhoff, B&R.
NOT supported by: ABB Freelance (uses PRT), Emerson DeltaV (uses FHX), Siemens (uses SimaticML).

## Other Exchange Formats

| Format | Standard | Used By |
|--------|----------|---------|
| PLCopen XML | IEC 61131-10 | CODESYS, Schneider, Beckhoff |
| SimaticML | Siemens proprietary | TIA Portal |
| AutomationML | IEC 62714 | Siemens PCS 7 V9+, multi-vendor |
| FHX | Emerson proprietary | DeltaV |
| PRT/CSV | ABB proprietary | Freelance |
| DEXPI | ISO 15926 | P&ID exchange |
