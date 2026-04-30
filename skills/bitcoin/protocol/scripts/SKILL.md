---
name: bitcoin-scripts
description: |
  Bitcoin Script language: stack execution model, opcodes, all output
  types (P2PK, P2PKH, P2SH, P2WPKH, P2WSH, P2TR, Tapscript), witness
  construction, sig encoding (DER/Schnorr).
  Quick refs: opcode reference, output-type construction, Tapscript
  diff vs legacy.
  USE WHEN: writing/decoding scriptPubKey, building scriptSig/witness,
  understanding "what does this script do", reading raw txs.
allowed-tools: Read, Grep, Glob
---

# Bitcoin Script

> **Quick refs**: [opcodes.md](quick-ref/opcodes.md), [output-types.md](quick-ref/output-types.md), [tapscript.md](quick-ref/tapscript.md)

Bitcoin Script is a **stack-based**, **non-Turing-complete** (no loops),
forth-like language. Each opcode pushes/pops bytes from a stack. Validity
= stack contains a single non-zero element after execution.

## Execution model

1. Initialize empty stack.
2. Concatenate `scriptSig + scriptPubKey` (legacy) — execute
   serialized. *(Disabled post-BIP16 P2SH for the segwit/taproot path.)*
3. (For SegWit/Taproot) Witness stack pushes are pre-loaded onto the
   stack, then `scriptPubKey` (or witness script) executes.
4. After execution: top of stack must be non-zero / true.

## Output type catalogue

| Type | scriptPubKey | Address |
|------|--------------|---------|
| **P2PK** | `<33 or 65-byte pubkey> OP_CHECKSIG` | none (uses P2PKH addr) |
| **P2PKH** | `OP_DUP OP_HASH160 <20-byte hash> OP_EQUALVERIFY OP_CHECKSIG` | `1...` (Base58) |
| **P2SH** | `OP_HASH160 <20-byte hash> OP_EQUAL` | `3...` (Base58) |
| **P2WPKH** (v0) | `OP_0 <20-byte hash>` | `bc1q...` (Bech32) |
| **P2WSH** (v0) | `OP_0 <32-byte hash>` | `bc1q...` (Bech32) |
| **P2TR** (v1) | `OP_1 <32-byte tweaked x-only pubkey>` | `bc1p...` (Bech32m) |

P2PK, P2PKH = pre-2012 patterns, still consensus-valid. Mainnet wallets
should use SegWit v0 (P2WPKH/P2WSH) as default and Taproot (P2TR) where
feasible.

## Sig encoding

- **ECDSA** (legacy/segwit v0): DER-encoded signature + 1-byte sighash
  flag suffix (`<r,s>` low-s only since BIP146).
- **Schnorr** (Taproot): 64-byte raw signature. Optional 1-byte sighash
  if not `SIGHASH_DEFAULT` (0x00) → 65 bytes.

## Witness construction (SegWit v0)

For P2WPKH spending:
```
witness:
  <signature DER + sighash byte>
  <pubkey 33 bytes>
```

For P2WSH spending:
```
witness:
  <stack items consumed by witnessScript>
  ...
  <witnessScript bytes>           ← last element, hashed for verification
```

## Witness construction (Taproot)

Two paths:
- **Key path** (default, cheapest, indistinguishable from single-sig):
  ```
  witness: [<schnorr sig>]
  ```
- **Script path**:
  ```
  witness: [<args for leaf script> ... <leaf script> <control block>]
  ```
  Control block: `0xc0 | parity` + internal pubkey (32) + merkle path.

## Standardness

Mempool policy enforces:
- No `OP_RETURN` outputs > 80 bytes data (configurable, default).
- No multi-sig with > 3 keys via "bare" multisig (post-P2SH only).
- No non-canonical signatures (low-s, DER strict).
- Tapscript opcodes: `OP_CHECKSIGADD` is consensus-active; new opcodes
  added per leaf-version policy.

## See also

- [taproot/SKILL.md](../taproot/SKILL.md)
- [miniscript/SKILL.md](../miniscript/SKILL.md) — script policy compiler
- [descriptors/SKILL.md](../descriptors/SKILL.md)
