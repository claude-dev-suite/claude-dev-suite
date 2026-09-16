---
name: bitcoin-l2-babylon
description: |
  Babylon: native BTC staking protocol securing PoS chains. Trustless
  Bitcoin Vaults (public testnet as of September 2026), integration
  with Cosmos chains. No bridging / wrapping required.
  USE WHEN: building BTC-secured PoS chains, integrating Babylon
  staking, evaluating BTCFi yield options.
allowed-tools: Read, Grep, Glob
---

# Babylon

Bitcoin staking protocol — let BTC holders **stake BTC** to secure
external Proof-of-Stake systems (Cosmos chains, L2s, DA layers)
**without bridging** or wrapping.

Backed by Babylon Labs. Babylon Genesis mainnet live since April 2025.
**Trustless Bitcoin Vaults** were announced on BitVM3 in August 2025;
as of September 2026 they are on **public testnet only** and the
shipped protocol verifies redemption with **BABE**, not BitVM3.

## Architecture

- **Native BTC staking**: BTC stays on Bitcoin chain in special
  staking output.
- **Slashable security**: misbehavior on PoS chain → slash via
  pre-signed slashing tx.
- **No custody**: no third party holds the BTC.
- **Self-custodial**: stakers control their keys.

## Mechanism

```
1. BTC holder locks BTC in a Bitcoin staking output (specialized script).
2. Holder signs (off-chain) attestations for blocks on a PoS chain.
3. PoS chain rewards BTC stakers (in PoS chain's native token).
4. If staker double-signs / equivocates → pre-signed slashing tx
   spendable, BTC slashed from staking output.
```

Key: BTC never leaves Bitcoin. Slashing path enforced via Bitcoin
script (CSV + spending conditions).

## Trustless Bitcoin Vaults (TBV)

**History.** The 6 August 2025 announcement pitched BitVM3-based
vaults that would let BTC flow into BTC-secured PoS systems without a
custodian. Both the mechanism and the scope changed before anything
shipped — do not quote the 2025 framing as current.

**Status, 16 September 2026.** Public testnet only: Bitcoin signet
plus Ethereum testnet, with mock Sepolia borrow assets and no monetary
value. `docs.babylonlabs.io` fronts the whole site with "Public
testnet live". The 7 October 2025 vault-first roadmap post targeted
vault mainnet for "early next year"; that has not landed.

**Mechanism.** Redemption is verified with **BABE**, not BitVM3.
BABE ("Verifying Proofs on Bitcoin Made 1000x Cheaper", Garg,
Kolonelos, Sergeevitch, Sridhar, Tse — January 2026) keeps BitVM3's
on-chain cost while cutting off-chain storage and setup by three
orders of magnitude; BitVM3 needs ~42 GiB per garbled circuit. It
pairs a witness-encryption scheme for linear pairing relations with a
garbled circuit for EC scalar multiplication, making Groth16
verification practical in existing Bitcoin script. No fork required.

**Scope.** TBV is native BTC collateral for *Ethereum* DeFi, not
liquidity for BTC-secured PoS systems. The application registry lists
the Aave v4 borrowing adapter and nothing else.

**Structure:**
- BTC sits in a Taproot `BTCVault` output whose every spend path is
  pre-signed at vault creation; afterwards no party can invent a spend.
- Roles: depositor, one Vault Provider per vault, App Keepers,
  Universal Challengers, and a *transitional* Security Council. None
  of them custodies the depositor's BTC.
- Peg-out posts an SP1 proof of the Ethereum redemption event,
  verified on Bitcoin via BABE, then waits a **~3-day challenge
  window** (432 BTC blocks) before payout.
- Depositor fallbacks: self-claim using a Winternitz one-time
  signature (WOTS) committed at peg-in, and a relative-CSV refund on
  the Pre-PegIn output if activation never completes.
- Testnet caps: 0.01–0.4 BTC per vault, 0.4 BTC per position and per
  address, 10 BTC total across the Aave v4 application.

Docs: https://docs.babylonlabs.io/trustless-bitcoin-vault/

## Bridge to Cosmos

January 2025 collaboration with **Fiamma**:
- BitVM2-based trustless Bitcoin bridge to Cosmos chains.
- Babylon-secured: Cosmos chain pays BTC stakers; if Cosmos validators
  fail, BTC stakers slash Cosmos validators (not the BTC).

## Use cases

- **BTC staking yield** without giving up custody.
- **Securing new PoS chains** with Bitcoin's economic value.
- **Cross-chain Bitcoin DeFi** without wrapping.

## Status & roadmap

- **Babylon Genesis** (Phase-2) mainnet launched **10 April 2025** at
  10:00 UTC. Phase-1 BTC staking locks ran through 2024 and its caps
  closed in December 2024 with ~57 000 BTC locked.
- **Trustless Vaults** announcement 6 Aug 2025; public testnet as of
  September 2026 (see above).
- **Q2 2026** was the stated roadmap window for deeper integrations
  with multiple PoS chains — historical roadmap, and as of
  16 September 2026 no delivery is visible. The 7 October 2025
  vault-first roadmap post explicitly pushed Bitcoin-supercharged
  networks (BSNs) and EVM on Babylon Genesis behind the vaults, the
  `babylonlabs-io/babylon` CHANGELOG from v4.2.2 through v4.4.0 is
  dependency bumps, security advisories and an intentionally empty
  v4.4 upgrade, and `cosmos-bsn-contracts` / `rollup-bsn-contracts`
  have published nothing since v1.0.0-rc.3 (9 Sep 2025) and
  v1.0.0-rc.1 (13 Aug 2025) respectively.
- Latest `babylonlabs-io/babylon` release is **v4.4.0**, published
  6 August 2026. Check the tag list rather than quoting a version
  from memory: https://github.com/babylonlabs-io/babylon/releases
- DefiLlama's `babylon-protocol` series puts TVL at **$3.21B for
  15 September 2026** (and $3.11B for 16 September). Treat any single
  figure as a dated snapshot and re-read the series:
  https://api.llama.fi/protocol/babylon-protocol

## Downstream: BTC liquid staking tokens

Most BTC that reaches Babylon does so through a liquid-staking
wrapper rather than direct staking, so the wrapper's trust model —
not Babylon's — is what a holder is actually exposed to. Two matter,
and one of them has already moved off Babylon staking:

- **Lombard (LBTC)** — launched as Babylon-staked BTC, and is still
  widely described that way. It is no longer accurate: during 2026
  LBTC's yield source transitioned off Babylon staking to a
  covered-call options strategy managed by Bitwise. Lombard's own
  "Yield Model History" table dates the earlier cut-over: before
  22 July 2025 holders claimed BABY manually, and from that date all
  yield auto-compounded into the LBTC/BTC exchange rate
  (https://docs.lombard.finance/use/lbtc/understanding-yield, fetched
  16 September 2026). See [lombard/SKILL.md](../lombard/SKILL.md).
- **Solv (SolvBTC / xSolvBTC)** — multi-chain tokenized BTC behind a
  Safe multisig with a Guardian contract. See
  [solv/SKILL.md](../solv/SKILL.md).

The general lesson: "BTC liquid staking" branding outlives the
staking. Re-check where a given LST's yield comes from before
attributing it to Babylon.

## Compared to BTC wrapping

| Aspect | Babylon staking | wBTC / tBTC / etc. |
|--------|-----------------|---------------------|
| Custody | Self | Custodian / threshold |
| Bridge tx | Bitcoin only | Cross-chain bridge tx |
| Slashing | Via Bitcoin script | Via centralized authority |
| Fee | Bitcoin tx fee for stake / unstake | Bridge fee + chain fee |
| Yield source | PoS chain's emission | Bridge service fees / DeFi yield |

## Limitations

- **PoS chain dependency** — yield depends on which chain you secure.
- **Vaults are testnet-only** — as of September 2026 TBV runs on
  signet + Ethereum testnet, on BABE rather than BitVM3, with a
  transitional Security Council and small exposure caps.
- **Slashing complexity** — staker must understand penalty conditions.

## See also

- [bitvm/SKILL.md](../bitvm/SKILL.md)
- [threshold-tbtc/SKILL.md](../threshold-tbtc/SKILL.md)
- [stacks/SKILL.md](../stacks/SKILL.md)
- [bitlayer/SKILL.md](../bitlayer/SKILL.md)
- [lombard/SKILL.md](../lombard/SKILL.md)
- [solv/SKILL.md](../solv/SKILL.md)
- [core-dao/SKILL.md](../core-dao/SKILL.md)
