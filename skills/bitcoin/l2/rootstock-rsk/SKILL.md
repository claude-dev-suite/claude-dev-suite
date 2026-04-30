---
name: bitcoin-l2-rootstock-rsk
description: |
  Rootstock (RSK): EVM-compatible Bitcoin sidechain with merge mining
  and federation peg. RBTC native token, 30-second blocks, Solidity
  smart contracts.
  USE WHEN: building Bitcoin DeFi via EVM contracts, integrating
  RSK peg, comparing with Stacks / Liquid.
allowed-tools: Read, Grep, Glob
---

# Rootstock (RSK)

RSK is a Bitcoin sidechain with **EVM compatibility**, secured by
merge mining + a federation peg. Launched 2018 by IOV Labs / RSK
Labs.

## Architecture

- **Federation**: Powpeg n-of-m multisig holds bridged BTC.
- **Merge mining**: Bitcoin miners can simultaneously mine RSK
  blocks for additional reward (no extra hashpower needed).
- **EVM**: full Solidity smart contract support.
- **30-second blocks** (vs Bitcoin's 10 min).
- **Native token**: RBTC = 1:1 BTC-pegged.

## Peg architecture (Powpeg)

Federation members hold:
- Bitcoin multisig keys.
- HSM (Hardware Security Module) attestation hardware.
- Special PowPeg software signing peg-out only when proof-of-work
  threshold is met.

Peg-out (RBTC → BTC):
1. User sends RBTC to special bridge address on RSK.
2. Federation observes, schedules release.
3. After ~100 RSK blocks (~50 min), federation's HSMs sign release.
4. BTC sent to user's destination on Bitcoin.

## RIF (RSK Infrastructure Framework)

Companion ecosystem:
- **RIF Storage** — IPFS-like.
- **RIF Communications** — secure messaging.
- **RIF Naming** — domain names on RSK.
- **RIF Marketplace**.

Powered by RIF token (separate from RBTC).

## Major projects

- **Sovryn** — DEX, lending, derivatives on RSK.
- **MoneyOnChain** — stablecoin (DoC, BPRO).
- **Beexo** — wallet.
- **RIF Wallet**.

## Comparison

| Aspect | RSK | Stacks | Liquid |
|--------|-----|--------|--------|
| Smart contracts | EVM (Solidity) | Clarity | Limited |
| Block time | 30s | ~Bitcoin (10 min before Nakamoto) | 2 min |
| Peg | Federation + merge mining | sBTC threshold | Federation |
| Maturity | 2018, mature | 2021, Nakamoto 2024 | 2018, mature |

## Use cases

- **Bitcoin DeFi** with familiar Ethereum tooling.
- **Stable coins** (DoC, USDS).
- **Cross-chain bridges** to Ethereum/BSC via Sovryn.

## Implementations

- **rskj** — Java reference node.
- **Web3 client compat** — most Ethereum tools work (web3.js,
  ethers.js).
- **MetaMask compatible** with custom RPC.

## Limitations

- **Federation trust** for peg.
- **Merge mining** depends on Bitcoin miners' participation.
- **Solidity vulnerabilities** inherited from EVM.

## See also

- [stacks/SKILL.md](../stacks/SKILL.md)
- [botanix/SKILL.md](../botanix/SKILL.md)
- [bsquared/SKILL.md](../bsquared/SKILL.md)
- [bitlayer/SKILL.md](../bitlayer/SKILL.md)
