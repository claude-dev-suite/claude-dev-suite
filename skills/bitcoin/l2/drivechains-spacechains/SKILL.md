---
name: bitcoin-l2-drivechains-spacechains
description: |
  Drivechains (BIP300/301) and Spacechains (Ruben Somsen): proposals
  for sidechains pegged via miner-validated locks or via OP_CAT-like
  primitives. Status: NOT activated on mainnet.
  USE WHEN: evaluating proposed sidechain mechanisms, understanding
  why they're not live, comparing with federated/trustless bridges.
allowed-tools: Read, Grep, Glob
---

# Drivechains and Spacechains

Two **proposed** sidechain mechanisms for Bitcoin. **Neither is
active on mainnet**.

## Drivechains (BIP300/301)

Proposed by Paul Sztorc.

### BIP300: Hashrate Escrow

- New tx types for "deposits" and "withdrawals" between Bitcoin and
  a sidechain.
- Withdrawals require **miner approval** via signaling over a
  multi-block window.
- Funds locked in a special multisig that miners can release based
  on the signaling.

### BIP301: Blind Merge Mining

- Miners merge-mine sidechain blocks via Bitcoin coinbase commitments.
- No additional hashpower required.
- Blind: miners need not run the sidechain to participate.

### Critique

- **Trusts miners implicitly** with all sidechain funds.
- A 51% mining cartel could approve fraudulent withdrawals.
- Miners might **want** to be paid for this service, creating a
  dependency.

### Status

- Not activated on Bitcoin mainnet (as of September 2026).
- Proposed since 2017, debate ongoing.
- **LayerTwo Labs** runs two drivechain testnets (as of September
  2026): a custom signet on stock Bitcoin Core, and **ForkNet** on
  their out-of-tree `bitcoin-patched` Core fork, whose `drivechain=1`
  option only the patched build recognises. On both, the rules are
  enforced out of consensus by their `bip300301_enforcer` sidecar,
  which drives an unpruned Bitcoin Core node over RPC + ZMQ (Core
  majors 29, 30 and 31 supported as of September 2026) - no upstream
  Bitcoin Core or Bitcoin Knots release implements BIP-300/-301
  itself, and the patched fork's `-drivechain` flag activates
  ForkNet's difficulty reset, not the peg rules.

## Spacechains

Proposed by Ruben Somsen.

### Concept

- Sidechain that uses `OP_CAT` + `OP_CHECKSIGFROMSTACK` (also
  proposed) to enable arbitrary-script verification of side-chain
  outputs.
- Lighter trust model: relies on script primitives, not miner
  votes.
- Specific design proposes "tagged hashes for cross-chain anchoring".

### Status

- Concept paper, no formal BIP.
- Depends on `OP_CAT` re-enabling, which is itself a proposal.
- Even more dependent on unactivated soft forks than drivechains.

## Compared to federated / trustless bridges

| Aspect | Drivechains | Spacechains | Federation | BitVM2 |
|--------|-------------|-------------|------------|--------|
| Active on mainnet | no | no | yes | yes (Citrea) |
| Trust assumption | miner majority | OP_CAT correctness + economic | n-of-m signers | 1-of-n challenger |
| Soft fork required | yes (BIP300/301) | yes (OP_CAT) | no | no (uses existing script) |
| Maturity | testnet only | concept only | many in production | Citrea live |

## Why these matter

- They represent **different visions** for Bitcoin sidechains.
- Drivechains have advocates who want simpler peg semantics.
- Spacechains push for more script primitives in Tapscript.
- Today's reality: federations (Liquid, RSK) and BitVM-based
  bridges (Citrea) dominate while these proposals remain theory.

## Common confusions

- "Sidechain" is a generic term; **drivechains** specifically
  refers to BIP300/301.
- **Drivechain testnet activity ≠ mainnet activity**.
- Spacechains are NOT the same as **Ark** (which uses a different,
  non-fork mechanism).

## See also

- [../../protocol/proposals/SKILL.md](../../protocol/proposals/SKILL.md)
- [bitvm/SKILL.md](../bitvm/SKILL.md)
- [liquid/SKILL.md](../liquid/SKILL.md)
- [rootstock-rsk/SKILL.md](../rootstock-rsk/SKILL.md)
