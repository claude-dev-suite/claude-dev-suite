---
name: bitcoin-taproot
description: |
  Taproot soft fork: BIP340 (Schnorr signatures), BIP341 (key tweak +
  script-path), BIP342 (Tapscript). x-only pubkeys, key-path vs
  script-path spending, control block, leaf versions, taptweak math.
  Quick refs: tweak math, control block layout, sighash differences,
  building a taptree.
  USE WHEN: building/spending P2TR outputs, designing taptrees,
  reasoning about Schnorr-only contexts.
allowed-tools: Read, Grep, Glob
---

# Taproot (BIP340 / 341 / 342)

> **Quick refs**: [tweak.md](quick-ref/tweak.md), [control-block.md](quick-ref/control-block.md), [sighash-default.md](quick-ref/sighash-default.md), [taptree.md](quick-ref/taptree.md)

Activated November 2021 (block 709,632). Three BIPs:

- **BIP340** — Schnorr signatures over secp256k1.
- **BIP341** — Taproot output: P2TR scriptPubKey, key-path / script-path
  spending, taptweak.
- **BIP342** — Tapscript: rules for script-path spends. See
  [scripts/quick-ref/tapscript.md](../scripts/quick-ref/tapscript.md).

## Output construction

```
P = internal_pubkey (x-only, 32 bytes)
TaptreeRoot R = merkle root of script tree (or empty)
t = TaggedHash("TapTweak", P || R)
Q = lift_x(P) + t*G   (the "tweaked" pubkey, x-only)
scriptPubKey = OP_1 <Q>
```

If you have only a key-path (no scripts), `R = ""` and the tweak still
prevents key reuse leaking the internal key.

## Key-path spend

```
witness = [<schnorr_sig>]    # 64 bytes (SIGHASH_DEFAULT) or 65 bytes
```

Privacy-equivalent to single-sig. **The most efficient** Taproot spend.
Outsiders cannot tell whether a script-path even exists — every Taproot
output looks like a single-key output.

## Script-path spend

```
witness = [<args0>, <args1>, ..., <leaf script>, <control block>]
```

- Args 0..N: stack inputs to the leaf.
- Leaf script: the Tapscript bytes being executed.
- Control block (33 + 32×depth bytes):
  - byte 0: `0xc0 | (parity_of_Q)`. The leaf version.
  - bytes 1..33: internal pubkey P.
  - bytes 33..end: merkle path (32 bytes per level).

Validator reconstructs `taproot_root` from leaf hash + path, computes
expected `Q = P + tweak*G`, compares to `Q` in scriptPubKey. If match,
runs the leaf script per BIP342.

## x-only pubkeys

- All Schnorr keys in BIP340 are encoded as **32-byte x-coordinate
  only** (no parity byte).
- The "even Y" convention: parity is fixed to even by negating the
  private key when needed.
- For tweaked output keys (`Q`), parity bit lives in the control block
  byte 0 LSB.

## Sighash (BIP341)

`SIGHASH_DEFAULT = 0x00` is the new default and equivalent to ALL but
with the new digest. Differences from BIP143:
- Hashes commit to **all spent prevout amounts** and scriptPubKeys
  (not just the current input).
- For SINGLE: commit only to single output, but with cleaner digest.
- Annex (last witness element prefixed `0x50`) is committed.

64-byte sig if SIGHASH_DEFAULT, else 65 bytes (1-byte sighash suffix).

## Sigops budget

Tapscript replaces "fixed sigops cost" with a **budget**:
`budget = floor(witness_weight / 50)`. Each `CHECKSIG`/`CHECKSIGADD`
consumes 50 from the budget. Allows long script paths to validate
proportionally to their bytes.

## Why Taproot

1. **Privacy**: spending paths reveal **only** the path used. Cooperative
   spends (key-path) look identical to plain single-sig.
2. **Aggregation**: Schnorr's linearity → MuSig2 key aggregation
   off-chain. n parties can produce one signature for one pubkey.
3. **Smaller witnesses** for cooperative cases.
4. **Soft-fork upgrade space**: leaf versions, OP_SUCCESS opcodes,
   annex.

## See also

- [scripts/quick-ref/tapscript.md](../scripts/quick-ref/tapscript.md)
- [../../cryptography/schnorr/SKILL.md](../../cryptography/schnorr/SKILL.md)
- [../../cryptography/musig2/SKILL.md](../../cryptography/musig2/SKILL.md)
- [miniscript/SKILL.md](../miniscript/SKILL.md)
