---
name: bitcoin-mining-stratum-v1
description: |
  Stratum V1: TCP/JSON protocol between mining pool and miners.
  Subscribe, authorize, mining.notify, mining.submit. Most-used
  protocol but security/decentralization weaknesses.
  USE WHEN: integrating mining hardware, building pool / proxy
  software, debugging hash submission.
allowed-tools: Read, Grep, Glob
---

# Stratum V1

The dominant protocol between pool servers and mining hardware
(ASIC). Plain TCP, line-based JSON-RPC. Ad-hoc spec; no formal RFC.

## Connection

```
[Miner] ──── TCP connect ────► [Pool]
       ──── mining.configure ─►   (optional, BIP 310)
       ◄── extension results ──
       ──── mining.subscribe ──►
       ◄── subscription_id ────
       ──── mining.authorize ─►
       ◄── true ─────────────
       ◄── mining.set_difficulty ─
       ◄── mining.notify ────────
       ──── mining.submit ────►
       ◄── true ─────────────
```

## Key methods

### `mining.configure` (BIP 310)

Feature negotiation, specified by BIP 310 "Stratum protocol
extensions" (Informational, assigned 10 March 2018, still Draft as of
September 2026). It SHOULD be the miner's first message. Its
Specification section lists three extension codes - `version-rolling`,
`minimum-difficulty`, `subscribe-extranonce` - and a fourth, `info`,
gets a section of its own.

```json
{"method": "mining.configure", "id": 1,
 "params": [["version-rolling"],
            {"version-rolling.mask": "1fffe000",
             "version-rolling.min-bit-count": 2}]}
```

The pool answers with the intersection `server_mask & miner_mask`.
Once `version-rolling` is active:
- `mining.submit` carries a 6th parameter `version_bits`.
- The pool recomputes
  `nVersion = (job_version & ~last_mask) | (version_bits & last_mask)`.
- `mining.set_version_mask` can change the mask mid-session, effective
  immediately.

Which bits a pool may offer tracks the reserved `nVersion` range:
BIP 320 reserves bits 13-28 (`0x1fffe000`, 16 bits); BIP 323 (assigned
22 April 2026, `Replaces: 320`) reserves bits 5-28 (`0x1fffffe0`,
24 bits). Both are still Draft as of September 2026.

Without version rolling a miner can only roll the 32-bit nonce plus
`extranonce2`; BIP 320's motivation notes hardware exhausts the nonce
field in under 200 ms, which is why the extension exists.

### `mining.subscribe`

Initial handshake. Miner gets:
- `extranonce1` — pool-specific session prefix.
- `extranonce2_size` — bytes the miner controls in coinbase.

### `mining.authorize`

Miner sends username (typically `wallet_address.worker_name`).

### `mining.set_difficulty`

Pool tells miner the share difficulty. Lower than actual block
difficulty so miners find shares frequently and pool can track
contribution.

### `mining.notify` (push)

```json
[
    "<job_id>",
    "<prev_hash>",
    "<coinbase_part_1>",
    "<coinbase_part_2>",
    [<merkle_branches>],
    "<version>",
    "<nbits>",
    "<ntime>",
    <clean_jobs>     // boolean
]
```

Miner builds:
- `coinbase = part1 || extranonce1 || extranonce2 || part2`.
- `coinbase_hash = SHA256d(coinbase)`.
- `merkle_root = merge(coinbase_hash, merkle_branches)`.
- `header = version || prev_hash || merkle_root || ntime || nbits || nonce`.
- Iterate `nonce` looking for hash ≤ target.
- Periodically iterate `extranonce2` too, plus the masked `nVersion`
  bits where `version-rolling` was negotiated.

### `mining.submit`

When miner finds valid share:
```
mining.submit(["<worker>", "<job_id>", "<extranonce2>", "<ntime>", "<nonce>"])
```

With `version-rolling` negotiated, a 6th parameter `version_bits`
follows `<nonce>` (BIP 310).

Pool verifies; rewards miner per share.

## Pool decides everything

The fundamental issue: **pool constructs the coinbase** (including
which transactions to include in the block). Miner just hashes what
the pool sends. This means:
- Miner has no control over which txs are mined.
- Pool can censor txs.
- Miner can be tricked into signing for a different reward script.

## Pool fraud risks

- Pool could lie about share difficulty (rare but possible).
- Pool could withhold rewards (very rare; reputation-driven).
- Pool could censor txs (sometimes done; OFAC compliance scenarios).

## Miner endpoint config

```
stratum+tcp://pool.example.com:3333
username: <wallet>.<worker>
password: anything (typically "x")
```

## Status

- **Dominant**: as of September 2026 Stratum V1 is still the default
  endpoint at essentially every pool and on every shipping ASIC; no
  published measurement pins the exact share down.
- **Aging**: clear weaknesses; Stratum V2 designed to replace.
- **Compatibility**: every ASIC/pool understands V1.

## See also

- [stratum-v2/SKILL.md](../stratum-v2/SKILL.md)
- [pool-architectures/SKILL.md](../pool-architectures/SKILL.md)
- [decentralized-pools/SKILL.md](../decentralized-pools/SKILL.md)
