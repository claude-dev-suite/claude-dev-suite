---
name: bitcoin-vaults
description: |
  Bitcoin vault patterns: timelocked cooldown, hot/cold path with CSV,
  multisig vaults with quorum reduction over time, OP_VAULT proposal
  (BIP345), Revault architecture.
  USE WHEN: designing high-value custody, treasury setups, recovery
  schemes with publish-and-cooldown semantics.
allowed-tools: Read, Grep, Glob
---

# Bitcoin Vaults

A vault enforces a **mandatory cooldown** between announcing a spend
and the spend taking effect. During the cooldown, an alternate
"recovery" path can intervene if the spend was unauthorized.

## Pattern 1: Single-sig CSV vault

```
output script (P2WSH):

IF
  <DELAY> CSV DROP <hot_pubkey> CHECKSIG     # hot path: wait DELAY blocks
ELSE
  <cold_pubkey> CHECKSIG                     # cold path: immediate, alt key
ENDIF
```

- Daily-use spends use hot key after waiting (e.g., 144 blocks = 1 day).
- If hot key is compromised, attacker spends → broadcasts.
- Vault owner sees the broadcast, has DELAY blocks to spend with cold
  key (which redirects funds to safety).

Trade-off: if hot key is compromised AND owner is unavailable for
DELAY blocks, attacker wins.

## Pattern 2: Multisig with timelocked degradation

```
output (Tapscript taptree):

leaf_a:  3-of-3 multisig (everyday quorum)
leaf_b:  144 CSV + 2-of-3 (after 1 day, fewer signers needed)
leaf_c:  4032 CSV + 1-of-3 (after 4 weeks, single signer)
```

Recovery via gradual quorum reduction. If one key is lost permanently,
other keys can recover after timelock.

## Pattern 3: Revault architecture

Revault.dev / Revaultd: multi-stakeholder vault for organizations.

- **Stakeholders** (wealth holders): hold cold keys, must approve
  any spend.
- **Managers**: hold hot keys, propose spends within policy.
- **Cosigners**: 3rd-party watchtower-like service.
- **WatchTowers**: monitor chain for unauthorized spends, can
  trigger emergency revault tx.

Pre-signed transaction set:
- **Vault tx** — initial deposit.
- **Unvault tx** — pre-signed, broadcasts to "cooldown" output.
- **Spend tx** — pre-signed, valid only after CSV expires.
- **Cancel tx** — pre-signed, returns funds to vault if unvault was
  unauthorized.
- **Emergency tx** — pre-signed, sends everything to deep cold.

Critical: pre-signing relies on **non-malleability** of inputs (only
SegWit/Taproot inputs).

## Pattern 4: OP_VAULT proposal (BIP345)

Native vault primitive: two new opcodes that constrain which outputs
a tx can have, enabling first-class vault semantics without script
gymnastics.

```
OP_VAULT          (commit to (pubkey, recovery, delay) at output time)
OP_VAULT_RECOVER  (immediate recovery to a pre-committed cold script)
```

A vault output can be spent two ways:
- "Trigger" path: produces an output spendable only after `delay`,
  to a script committed at vault-creation time.
- "Recover" path: any input can use the recover script + branch
  immediately to deep cold storage.

**Status**: proposed, not active. Tested on signets.

## Watchtower integration

Vaults need monitoring: someone must broadcast the cancel/emergency
tx if an unauthorized unvault is observed. Two models:
- **Self-monitoring**: owner runs a watchtower process locally.
- **Outsourced**: third-party watchtower, paid in encrypted blob (no
  funds access). Used by Revault and some LN watchtowers.

## Implementation pieces

### Output script with CSV

```python
from bitcoinutils.script import Script

vault_script = Script([
    'OP_IF',
        144, 'OP_CHECKSEQUENCEVERIFY', 'OP_DROP',
        hot_pubkey_hex, 'OP_CHECKSIG',
    'OP_ELSE',
        cold_pubkey_hex, 'OP_CHECKSIG',
    'OP_ENDIF'
])
```

### Spending the hot path

```
witness = [<hot_sig>, "01"]    # "01" = TRUE pushes IF branch
```

Sequence on input must be ≥ 144 (relative locktime).

### Spending the cold path

```
witness = [<cold_sig>, "00"]   # "00" = FALSE pushes ELSE branch
```

Immediate, no sequence requirement.

## Common bugs

- Forgetting `tx.version >= 2` for relative locktimes (BIP68
  requirement).
- Setting absolute CLTV instead of CSV → relative semantics broken.
- Hot path delay too short (1 block) → owner can't react in time.
- No watchtower → no one notices unauthorized unvault.
- Cold key on same device as hot key → defeats the entire purpose.

## See also

- [timelocks/SKILL.md](../timelocks/SKILL.md)
- [../../protocol/scripts/SKILL.md](../../protocol/scripts/SKILL.md)
- [../../protocol/proposals/SKILL.md](../../protocol/proposals/SKILL.md)
- [../../hardware/multi-vendor-multisig/SKILL.md](../../hardware/multi-vendor-multisig/SKILL.md)
