---
name: bitcoin-libraries-rust-dlc
description: |
  rust-dlc: Rust DLC implementation. Funding, CET construction, oracle
  attestation handling, refund logic.
  USE WHEN: building DLC apps in Rust, integrating oracle-driven
  Bitcoin contracts.
allowed-tools: Read, Grep, Glob
---

# rust-dlc

Rust implementation of Discreet Log Contracts. Maintained by Crypto
Garage et al.

Repo: `github.com/p2pderivatives/rust-dlc`.

## Install

```toml
[dependencies]
dlc = "0.7"
dlc-manager = "0.7"
dlc-messages = "0.7"
```

## Components

- `dlc` — primitives (CETs, oracle messages, contract types).
- `dlc-manager` — orchestrates the full lifecycle.
- `dlc-messages` — wire-format messages.
- `dlc-trie` — efficient CET tree for numerical outcomes.

## High-level flow

```rust
use dlc_manager::Manager;
use dlc_manager::contract::offered_contract::OfferedContract;

let manager = Manager::new(blockchain, wallet, ...);

// Offer side
let offer = manager.send_offer(&counter_party_pubkey, &contract_input)?;

// Accept side (counterparty)
let accept = manager.accept_contract(offer)?;

// Sign side (offerer)
let sign = manager.process_accept(accept)?;

// Confirm
manager.process_sign(sign)?;
manager.broadcast_funding()?;

// At settlement, oracle publishes attestation, manager picks CET
manager.close_contract(...)?;
```

## Oracle integration

Oracles publish nonces upfront, attestations at settlement. rust-dlc
handles:
- Nonce verification.
- Attestation-to-CET mapping.
- Adapter signature application.

## Use cases

- **Sports betting** apps.
- **BTC/USD hedging** derivatives.
- **Parametric insurance**.
- **Lava, Atomic Finance**, other DLC products use rust-dlc.

## Common pitfalls

- Oracle availability: contract is locked until oracle attests
  (or refund timeout).
- CET storage: numerical contracts can have thousands of pre-signed
  CETs; persist properly.
- Fee management: pre-signed CETs have fixed fees; mempool may
  reject if fee rates spike.

## See also

- [rust-bitcoin/SKILL.md](../rust-bitcoin/SKILL.md)
- [../../cryptography/dlcs/SKILL.md](../../cryptography/dlcs/SKILL.md)
- [../../cryptography/adaptor-sigs/SKILL.md](../../cryptography/adaptor-sigs/SKILL.md)
