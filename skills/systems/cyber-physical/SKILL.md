---
name: cyber-physical
description: |
  Cyber-physical / industrial control system (ICS-SCADA) architecture in general:
  the Purdue model levels, control loops, IT/OT convergence, OT security
  (IEC 62443, segmentation, zero-trust for OT), safety, determinism, and
  redundancy. Architect-level, beyond any specific DCS/PLC product.

  USE WHEN: designing/evaluating industrial control, SCADA, robotics, energy,
  automotive, or IoT-at-scale systems, "OT security", "Purdue model", "PLC/RTU/
  SCADA architecture", "IT/OT convergence", "IEC 62443", "control loop", safety
  instrumented systems.

  DO NOT USE FOR: specific DCS platforms / IEC 61131 / ISA formats (use the
  `industrial/*` skills); pure RTOS scheduling (use `embedded-rtos`); app
  security (use `security-architecture`).
allowed-tools: Read, Grep, Glob
---
# Cyber-Physical / ICS-SCADA Architecture (general)

Generalizes the product-specific `industrial/*` skills (DCS, IEC 61131, ISA) into
engine-agnostic control-system design. A cyber-physical system couples
**computation with physical processes** through sensors and actuators in
closed control loops, where a software fault can have physical consequences.

## The Purdue reference model (segment by level)

```
L5/4  Enterprise / MES / ERP         (IT)
------------------- IT/OT boundary (DMZ) -------------------
L3    Operations / historians / engineering workstations
L2    SCADA / HMI / supervisory control
L1    Controllers: PLC / RTU / DCS
L0    Field devices: sensors, actuators, drives  (physical process)
```

Architecture is organized by these levels; the **IT/OT boundary** is the
critical trust boundary to design and defend.

## Defining constraints

- **Determinism & real-time**: control loops have hard cycle times and deadlines
  (see `embedded-rtos`); jitter degrades control.
- **Safety**: safety-instrumented systems (SIS) are separated from control;
  fail-safe/fail-operational design, redundancy (TMR), and standards like
  IEC 61508 / 61511.
- **Availability over confidentiality**: unlike IT, OT prioritizes uptime and
  safety — you cannot just patch/reboot a running plant.

## OT security (IT/OT convergence)

- The **air gap is largely a myth** now — connectivity for analytics/remote ops
  is pervasive. Design for it.
- **IEC 62443** is the reference standard. Apply **zone-and-conduit
  segmentation**, an IT/OT DMZ, least-privilege, and increasingly **zero-trust
  for OT** (authenticate every cross-zone flow). Pairs with
  `security-architecture`.
- Legacy devices have weak/no auth → compensate with network segmentation,
  monitoring, and protocol-aware firewalls rather than assuming endpoint security.

## Guidance
Treat the IT/OT boundary as the primary trust boundary; segment by Purdue level;
keep safety functions independent and redundant; design for determinism and
availability first; and assume connectivity — secure it (IEC 62443) rather than
relying on isolation.
