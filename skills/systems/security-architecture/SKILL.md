---
name: security-architecture
description: |
  System-level security architecture: threat modeling, secure-by-design,
  defense-in-depth, zero-trust, trust boundaries, TEE/confidential computing,
  and secure boot / chain of trust. Architect-level — designing the security of
  a system, not app-level OWASP bug fixing.

  USE WHEN: designing a system's security architecture, "threat model",
  "zero-trust", "defense in depth", "trust boundary", "TEE", "enclave",
  "confidential computing", "secure boot", "attack surface", security design review.

  DO NOT USE FOR: fixing app vulnerabilities / OWASP code issues (use the
  security agent/skills); auth library wiring (use authentication skills).
allowed-tools: Read, Grep, Glob
---
# Security Architecture

Design security into the system shape — not bolt it on after.

## Start with a threat model
1. **What are we protecting?** (assets, data classifications)
2. **From whom?** (threat actors, capabilities)
3. **Trust boundaries** — draw them: where does data/control cross between
   differently-trusted components? Each crossing is where to authenticate,
   authorize, validate, and encrypt.
4. **Enumerate threats** (STRIDE: Spoofing, Tampering, Repudiation, Info
   disclosure, DoS, Elevation) per boundary; rank by risk; design mitigations.

## Architectural principles
- **Defense in depth**: independent layers so one failure isn't catastrophic.
- **Least privilege** + **least authority**: minimal scope per component;
  capability-based over ambient authority where possible.
- **Minimize attack surface & TCB**: fewer entry points, smaller trusted base
  (favors microkernel/microVM isolation — see `os-kernel-architecture`,
  `virtualization`).
- **Fail securely**: deny by default; errors don't open access.
- **Secure by design/default**: safe defaults, secrets never in code, encryption
  in transit + at rest.

## Zero-trust
Drop implicit network trust. Authenticate + authorize **every** request
(identity, device posture, policy) regardless of network location;
micro-segment; assume breach. Replaces the "hard perimeter, soft interior" model.

## Hardware / platform security
- **TEE / enclaves** (SGX, TrustZone, SEV-SNP, TDX): run/seal sensitive
  computation isolated from the OS/host — for untrusted-host or
  confidential-computing scenarios.
- **Secure boot / chain of trust**: each stage verifies the next from a hardware
  root of trust; measured boot + attestation for remote trust.
- **Key management**: HSM/KMS, rotation, envelope encryption; never hand-roll crypto.

## When to invoke this
- New system/platform design, multi-tenant or untrusted-input systems,
  regulated data, anything internet-facing or handling secrets/PII. Produce a
  threat model + trust-boundary diagram + mitigations as part of the ADR.
