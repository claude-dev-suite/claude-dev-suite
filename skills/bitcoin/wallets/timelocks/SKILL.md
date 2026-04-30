---
name: bitcoin-timelocks
description: |
  Bitcoin time-locks: nLockTime (BIP65 absolute), nSequence (BIP68/112
  relative), CLTV/CSV opcodes, MTP rule (BIP113). Block-height vs
  unix-time, encoding rules.
  USE WHEN: building HTLCs, vaults, scheduled payments, escrow with
  cooldown, refund paths.
allowed-tools: Read, Grep, Glob
---

# Bitcoin Time-Locks

Two locking dimensions: **absolute** (lock until time/block T) and
**relative** (lock for N blocks/seconds after parent confirms).

## Absolute time-lock — `nLockTime` field + CLTV opcode

`nLockTime` (4 bytes, in tx):
- `0` → tx is valid immediately.
- `< 500_000_000` → tx valid only at/after block height N.
- `≥ 500_000_000` → tx valid only at/after unix timestamp.

For `nLockTime` to be enforced, **at least one input** must have
`nSequence < 0xffffffff`.

### CLTV (BIP65)

```
<TARGET_HEIGHT_OR_TIME> OP_CHECKLOCKTIMEVERIFY OP_DROP <... rest of script>
```

`OP_CLTV` aborts the script if `tx.nLockTime < target`. Doesn't pop
the value, so `OP_DROP` follows.

Use case: scheduled payment that becomes valid after a date.

### MTP rule (BIP113)

When comparing time-based (`≥ 500M`) lock against block timestamps,
use **median time past** of the last 11 blocks, not the current block's
timestamp. Mitigates miner fudging.

## Relative time-lock — `nSequence` field + CSV opcode

`nSequence` (4 bytes, per input):
- bit 31 = 1 (`0x80000000`) → relative locktime DISABLED for this
  input. Required for legacy txs (`nSequence = 0xfffffffe` or
  `0xffffffff`).
- bit 31 = 0 → relative locktime ENABLED.
- bit 22 (`0x00400000`):
  - 0 → low 16 bits are **block units**.
  - 1 → low 16 bits × 512 seconds.

Requires `tx.version ≥ 2` for relative timelock to be enforced.

### CSV (BIP112)

```
<DELAY> OP_CHECKSEQUENCEVERIFY OP_DROP <... rest of script>
```

`OP_CSV` checks the input's sequence against the encoded delay value
in the same format (block-height / 512s units). Aborts if input's
`nSequence` < delay (with bit conventions matched).

Use case: vault cooldown, HTLC timeout path, channel commitment delay.

## Block-height vs time encoding

Block-based:
```
DELAY = 144                      # ≈ 1 day
nSequence = DELAY                # bit 22 = 0, low 16 = 144
```

Time-based:
```
DELAY_SECONDS = 86400 / 512 = 169   # ≈ 1 day in 512s units
nSequence = (1 << 22) | 169         # 0x004000A9
```

In script: `<DELAY> CSV` where DELAY uses the same encoding.

## Common patterns

### HTLC (Lightning, atomic swaps)

```
IF
    <preimage_hash> OP_HASH160 OP_EQUALVERIFY <recipient_pubkey> OP_CHECKSIG
ELSE
    <timeout> OP_CHECKLOCKTIMEVERIFY OP_DROP <sender_pubkey> OP_CHECKSIG
ENDIF
```

Recipient redeems with preimage; sender refunds after timeout.

### Vault cooldown (relative locktime)

```
IF
    <144> OP_CSV OP_DROP <hot_pubkey> OP_CHECKSIG
ELSE
    <cold_pubkey> OP_CHECKSIG
ENDIF
```

### Scheduled payment

```
<2_500_000> OP_CLTV OP_DROP <recipient_pubkey> OP_CHECKSIG
```

Becomes spendable at block 2,500,000.

## Tapscript variants

In Tapscript, opcodes work the same. CSV / CLTV are valid in leaf
scripts. Combine with `OP_CHECKSIGADD` for multisig + timelock:

```
<DELAY> CSV DROP <pkA> CHECKSIG <pkB> CHECKSIGADD <2> NUMEQUAL
```

(2-of-2 with cooldown.)

## Common bugs

- **Forgetting `tx.version = 2`** — relative timelocks don't apply.
- **Sequence high bit set on input meant to use relative locktime**
  → relative lock disabled.
- **Confusing block-height vs unix-time** in CLTV value (the 500M
  boundary is hard).
- **Final-input sequence (`0xfffffffe`)** — disables RBF and disables
  relative timelock for that input.
- **MTP vs block timestamp** for time-based locks — always use MTP.

## See also

- [vaults/SKILL.md](../vaults/SKILL.md)
- [../../protocol/scripts/quick-ref/opcodes.md](../../protocol/scripts/quick-ref/opcodes.md)
- [../../protocol/transactions/SKILL.md](../../protocol/transactions/SKILL.md)
- [../../lightning/htlcs/SKILL.md](../../lightning/htlcs/SKILL.md)
