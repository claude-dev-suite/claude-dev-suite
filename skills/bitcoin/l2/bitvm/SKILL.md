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
- **Fiamma**, whose BitVM2 bridge lists Babylon as its Wasm-VM target
  chain (Fiamma's own docs, last updated January 2026). Babylon's
  trustless-vault docs do not credit Fiamma as of September 2026.

## BitVM3

- Further efficiency improvements. The academic write-up — "BitVM3:
  Efficient Bitcoin Bridges via Garbled Circuits" (Robin Linus Woll,
  Alexopoulos, Aumayr, Avarikioti, Maffei, Tse; IACR eprint 2026/933,
  received May 2026, revised June 2026) — has the challenger evaluate a
  **garbled circuit** entirely off-chain, which the paper reports as a
  nearly 1000x saving: total on-chain cost ~$9, with the challenge
  transaction itself ~$0.20, against a ~$16,000 worst-case dispute cost
  under BitVM2.
- **Babylon's Trustless Vaults** were announced on BitVM3 (whitepaper,
  August 2025). As of September 2026 Babylon's own docs describe the
  vaults as public *testnet* — not mainnet.
- **The RSA-based BitVM3 line was reported broken (by July 2025).**
  Alpen Labs' post "Glock: A new standard for verification on Bitcoin"
  (15 July 2025) reports that Liam Eagen and Fairgate Labs found
  "separate core flaws in its RSA-based construction, rendering it
  unsafe to build upon", and that Alpen's "direction now fully orients
  towards Glock in the development of the Alpen ZK rollup and the
  Strata bridge" (Glock: Garbled Locks for Bitcoin, IACR eprint
  2025/1485, August 2025). Strata's bridge moved off BitVM2 to
  Glock/Mosaic (as of September 2026) — see `strata/SKILL.md`.
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
- **Fiamma** — BitVM2 bridge to Cosmos; Babylon is its Wasm-VM
  target chain (Fiamma docs, January 2026).
- Multiple research forks for variations.

## Limitations

- **Complex** — hard to audit, may have bugs.
- **Setup overhead** — large pre-signed tx tree.
- **Latency** — challenge windows mean peg-out is not instant.
- **Non-trivial economics** — bond sizing matters for security.

## Status (as of September 2026)

- BitVM2: production — Citrea's Clementine bridge on Citrea mainnet
  (clementine v0.6.6, June 2026; citrea node v2.8.0, September 2026).
- BitVM3: research / preprint, not deployed. Announced for Babylon's
  Trustless Vaults in August 2025; Babylon's vault-first roadmap
  (October 2025) targeted mainnet "early next year", and as of
  September 2026 the vaults are still public testnet. No primary
  source confirms BitVM3 live on mainnet anywhere.
- Active research on further efficiency.

## See also

- [citrea/SKILL.md](../citrea/SKILL.md)
- [babylon/SKILL.md](../babylon/SKILL.md)
- [strata/SKILL.md](../strata/SKILL.md)
- [../../protocol/proposals/SKILL.md](../../protocol/proposals/SKILL.md)
