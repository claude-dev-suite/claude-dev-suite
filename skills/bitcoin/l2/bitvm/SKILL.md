---
name: bitcoin-l2-bitvm
description: |
  BitVM, BitVM2, BitVM3: off-chain computation framework using
  optimistic challenge games on Bitcoin script. Foundation for
  trust-minimized bridges to L2s and PoS chains.
  USE WHEN: building trust-minimized bridges, understanding ZK
  rollup peg-out mechanisms, evaluating bridge security models.
allowed-tools: Read, Grep, Glob
---

# BitVM

BitVM is a paradigm for **off-chain computation with on-chain
verification challenges** on Bitcoin. Allows arbitrary programs to
be verified via fraud proofs in Bitcoin script — without OP_CTV,
OP_CAT, or other unactivated opcodes.

Original paper: Robin Linus, 2023.
Refined versions: BitVM, BitVM2, BitVM3.

## Core idea

```
1. Prover commits to a program execution (via cryptographic commitments
   to step states / hashes).
2. Verifier challenges: "what's the state after step k?".
3. Prover responds with state values + proofs.
4. Iterate via binary search over disagreement.
5. Final challenge runs on Bitcoin: a 1-step micro-computation
   verifiable in Bitcoin script.
```

If prover can't respond honestly, verifier wins funds (Prover's
bond is slashed).

## BitVM (original)

Single prover-verifier pair. Setup is heavy (lots of pre-committed
hashes); single use per setup.

## BitVM2

- **Multi-prover**: multiple challengers can dispute.
- **Permissionless verification**: anyone can challenge.
- **Smaller setup**: more efficient hashing schemes.

Used by:
- **Citrea** mainnet bridge.
- **Babylon's** trustless Bitcoin bridge (Fiamma collaboration).

## BitVM3

- Further efficiency improvements.
- **Babylon's Trustless Vaults** use BitVM3.
- Reduces interactive challenge rounds.

## Use cases

- **Trustless bridges** for L2 peg-out.
- **Optimistic rollup** verification on Bitcoin.
- **Decentralized custody** without federation trust.

## Trade-offs

- **Verification cost**: large setup tx + many bytes for challenges.
- **Challenge windows**: 24+ hours typical → peg-out delay.
- **Liveness**: requires at least one honest challenger online.

## Compared to other trust models

| Model | Trust | Liveness req |
|-------|-------|--------------|
| Federation multisig | n-of-m honest | none for spending |
| Threshold (FROST) | k-of-n honest | k-of-n online to sign |
| BitVM2 | 1-of-n honest challenger | challenger online during window |
| ZK rollup direct | math | proof verifiers must be online |

BitVM is the "1-of-n watchtower" of bridges.

## Implementations

- **bitvm-rs** (research) — Rust BitVM implementation.
- **Citrea bridge** uses BitVM2 in production.
- **Fiamma** — BitVM2 bridge to Cosmos for Babylon.
- Multiple research forks for variations.

## Limitations

- **Complex** — hard to audit, may have bugs.
- **Setup overhead** — large pre-signed tx tree.
- **Latency** — challenge windows mean peg-out is not instant.
- **Non-trivial economics** — bond sizing matters for security.

## Status (early 2026)

- BitVM2: production (Citrea bridge).
- BitVM3: deployed for Babylon Vaults (Aug 2025).
- Active research on further efficiency.

## See also

- [citrea/SKILL.md](../citrea/SKILL.md)
- [babylon/SKILL.md](../babylon/SKILL.md)
- [strata/SKILL.md](../strata/SKILL.md)
- [../../protocol/proposals/SKILL.md](../../protocol/proposals/SKILL.md)
