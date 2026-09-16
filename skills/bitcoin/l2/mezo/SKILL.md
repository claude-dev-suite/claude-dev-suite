---
name: bitcoin-l2-mezo
description: |
  Mezo: Thesis's Bitcoin-first Cosmos SDK / CometBFT chain with EVM
  (Evmos fork), BTC for gas, tBTC bridging and a Proof-of-Authority
  validator set. Mainnet 28 May 2025. MUSD is its Bitcoin-backed CDP
  stablecoin, a Threshold USD / Liquity fork with a 110% minimum
  collateral ratio. Chain TVL ~$71.7M on 15 September 2026.
  USE WHEN: building on Mezo, integrating MUSD, evaluating a
  major downstream consumer of tBTC.
allowed-tools: Read, Grep, Glob
---

# Mezo

Built by **Thesis** (the Keep / Threshold / tBTC team). Mainnet
launched **28 May 2025**. The pitch is a "full-stack Bitcoin
economy": BTC comes in over tBTC, pays for gas, and backs a native
stablecoin.

Per the `mezo-org/mezod` README, the chain is a **Cosmos SDK chain
with EVM compatibility running on CometBFT**, forked from the LGPL
version of **Evmos** and heavily modified. Stated design goals: user
ownership, reliable bridging with tBTC, BTC for gas, a dual staking
model, EVM compatibility.

Modules in `x/`: `bridge`, `evm`, `feemarket`, `poa`.

## Validator set is Proof-of-Authority

This is the single most important thing to know and it is easy to
miss. From the `x/poa` module spec:

- The initial validator set is fixed in genesis.
- New validators submit candidate applications; **the module owner
  approves them**.
- The owner can kick a validator out.
- **All validators have equal voting power.**
- Ownership transfers in a two-step propose/accept flow.
- The module also holds an **Emergency Team** role controlling
  chain "lockdown levels".

So "dual staking" on Mezo is about rewards and economic weight, not
about permissionless validator entry. Treat Mezo as a permissioned
chain until the `poa` module is replaced.

## Bridge

`AssetsLocked` events observed on the origin side are written into
**pseudo-transactions**: at most one per block, always at index 0,
carrying at most 10 events, and rendered by JSON-RPC as if they
called the `AssetsBridge` precompile's `bridge` method so explorers
can show them. Pseudo-transactions are only persisted if a node sets
`enable-indexer = true` in `config/app.toml` — otherwise they are
invisible to JSON-RPC and to explorers. Budget for that when
building bridge monitoring.

## MUSD

Bitcoin-backed CDP stablecoin. Per `mezo-org/musd/docs`, MUSD is
**based on Threshold USD, itself a fork of Liquity** — so the trove
model, Stability Pool and redemption mechanics are Liquity's.

| Parameter | Value |
|---|---|
| Minimum collateral ratio | 110% |
| Price floor mechanism | redeem MUSD for $1 of BTC (`TroveManager.redeemCollateral`) |
| Price ceiling | ~$1.10, set by the 110% MCR |
| Borrowing rate | 0.1%, governable |
| Redemption rate | 0.75%, governable |
| Interest | simple, fixed, non-compounding |

Two Liquity divergences worth knowing:

- **Interest is per-trove and sticky.** A global governable rate
  applies to *new* troves; changing it does not touch existing ones.
  Borrowers may refinance to the current global rate at will (paying
  a refinancing fee that behaves like the borrowing rate).
- **No Stability Pool incentive token.** Liquity v1 paid LQTY to
  Stability Pool depositors; MUSD pays nothing, and the Stability
  Pool is seeded with a protocol bootstrap loan that can only leave
  via liquidations. Interest and fees flow to the MUSD Savings Rate
  vault instead.

Contracts follow Liquity naming: `BorrowerOperations.openTrove`,
`ActivePool`, `StabilityPool`, `DefaultPool`,
`TroveManager.liquidate` / `.redeemCollateral`.

## Scale

From Mezo's own H1 2026 review (fetched 15 September 2026):

| Metric | Value | Date the source gives |
|---|---|---|
| Total TVL | $110.5M | "as of July 31" |
| Trading venues | Kraken, Coinbase Exchange, Bitget, KuCoin, Bullish, Aerodrome, "among others" | "as of July 31" |
| MUSD in circulation | 28.0M (27.0M of it on Mezo) | table footnote only |
| Lifetime MUSD transfer volume | $789M | table footnote only |
| BTC locked as veBTC | 912.6 BTC | table footnote only |
| Outstanding loans | $13.1M against 826 BTC collateral | table footnote only |
| System collateralisation | 370% | table footnote only |

Note the source's self-contradiction: only Total TVL and trading
venues are labelled "as of July 31", while the table's own footnote
reads "All figures pulled onchain, as of June 31, 2026" — a date that
does not exist. Do not restate either as a single clean cutoff; the
rest of the table is somewhere around end-June to end-July 2026.

Bullish (NYSE: BLSH) is named as the anchor customer, deploying 1000
BTC through Mezo Prime.

DefiLlama put the Mezo chain at ~$71.7M TVL on 15 September 2026 —
a different metric and a later date than the $110.5M above, so do
not present them as the same series. Re-check:
https://defillama.com/chain/Mezo

The MEZO token and veMEZO were live by H1 2026 (blog posts on MEZO
emissions and veMEZO run from April 2026; the H1 review places the
token in Q1 2026). Sources disagree on the exact TGE date — do not
state one without checking Mezo's own announcement.

## Use cases

- **Borrow against BTC** without selling it, at a fixed simple
  interest rate.
- **A major tBTC destination** — DefiLlama had tBTC at ~$336.0M and
  the Mezo chain at ~$71.7M on 15 September 2026, so tBTC
  integration work often lands here.
- **EVM dApps paying gas in BTC.**

## Limitations

- **PoA validator set** — see above. Owner-gated entry, owner-driven
  removal, plus an Emergency Team with lockdown powers.
- **Bridge trust inherits tBTC's** threshold-signer assumptions on
  top of Mezo's own.
- **Liquity-derived liquidation risk** — 110% MCR is thin. A fast
  BTC drawdown liquidates troves with little buffer, and the
  Stability Pool has no yield incentive attracting depositors.
- **Bridge events are invisible by default** unless the custom
  indexer is enabled.
- Mezo published an **incident report for 2 July 2026**
  (`docs/reports/2026-07-02-leveldb-corruption.md`): the testnet
  archive node crash-looped on LevelDB corruption in the early
  morning UTC of 2 July 2026, and mainnet validator operators hit
  the same corruption in the following days. Read it before
  assuming a clean operational record.

## See also

- [threshold-tbtc/SKILL.md](../threshold-tbtc/SKILL.md)
- [rootstock-rsk/SKILL.md](../rootstock-rsk/SKILL.md)
- [bob/SKILL.md](../bob/SKILL.md)
- [core-dao/SKILL.md](../core-dao/SKILL.md)
