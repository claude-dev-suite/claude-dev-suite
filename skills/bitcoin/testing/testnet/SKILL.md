---
name: bitcoin-testing-testnet
description: |
  Public mined test networks: testnet3 (deprecated), testnet4 (BIP94)
  and the testnet5 draft (BIP95). Chain selection, the 20-minute
  difficulty exception, block storms, and when to prefer signet.
  USE WHEN: picking a public test network, debugging testnet4 block
  behaviour, or tracking the testnet5 migration.
allowed-tools: Read, Grep, Glob
---

# testnet

Bitcoin's *mined* public test networks. Regtest is local and you mine
it yourself; signet is public but its blocks are signed by a fixed
key. Testnet blocks are won by real proof of work from whoever shows
up — which is simultaneously the point of the network and its
recurring failure mode.

Three generations exist. As of September 2026: testnet3 is deprecated
but still shipped, testnet4 is the network you actually get, and
testnet5 is a draft BIP with no genesis block mined yet.

## Chain selection

Verified against Bitcoin Core master, September 2026
(`src/kernel/chainparams.cpp`, `src/chainparamsbase.cpp`,
`src/util/chaintype.cpp`):

| Network | Flag | Config section | datadir | p2p | RPC |
|---------|------|----------------|---------|-----|-----|
| testnet3 | `-testnet` | `[test]` | `testnet3` | 18333 | 18332 |
| testnet4 | `-testnet4` | `[testnet4]` | `testnet4` | 48333 | 48332 |
| signet | `-signet` | `[signet]` | `signet` | 38333 | 38332 |
| regtest | `-regtest` | `[regtest]` | `regtest` | 18444 | 18443 |

The bech32 HRP is `tb` on testnet3, testnet4 and signet alike, so an
address does not tell you which network it belongs to. Genesis blocks
differ, so UTXO sets are disjoint and transactions cannot be replayed
across them.

```bash
bitcoind -testnet4 -daemon
bitcoin-cli -testnet4 getblockchaininfo
```

## testnet3 (2011, deprecated)

Genesis dates to February 2011 (timestamp 1296688602). Years of block
storms (see below) burned through the subsidy schedule: the tip was
height 5,130,590 on 15 September 2026, i.e. past two dozen halvings,
so the coinbase reward is dust and faucets are chronically empty.

Bitcoin Core 28.0 (October 2024) deprecated it in the same release
that shipped testnet4. As of Core master in September 2026 the
deprecation is still only a warning — `src/init.cpp` logs:

```
Warning: Support for testnet3 is deprecated and will be removed in an
upcoming release. Consider switching to testnet4.
```

The RFC issue that decides the removal, bitcoin/bitcoin#31975 ("when
to drop testnet3"), is still open (last touched June 2026). Treat
testnet3 as working-today-but-doomed and migrate.

## testnet4 (BIP94)

BIP94 (Fabian Jahr), status **Deployed**, shipped in Core 28.0
(October 2024), selected with `-testnet4`.

All mainnet consensus rules active at the time of the proposal (2024)
are enforced from block 1 — taproot being the newest — plus three
testnet-specific rules:

1. **20-minute exception**, inherited from testnet3: a block whose
   timestamp is more than 20 minutes past its parent's MUST use
   `nBits = 0x1d00ffff` (difficulty 1), regardless of the real
   network difficulty. The first block of each difficulty period is
   exempt and MUST use the real difficulty.
2. **Block-storm fix**: difficulty retargeting takes its base value
   from the *first* block of the previous period, not the last. On
   testnet3 a min-difficulty last block pinned the next period's
   difficulty to 1-4, which is what let attackers author whole
   subsidy epochs in weeks.
3. **Time-warp prevention**: for a block at height ≡ 0 (mod 2016),
   `nTime` MUST be ≥ the previous block's `nTime` − 600 seconds.
   Without it, a time warp amplifies rule 1 from difficulty 4 down
   to difficulty 1.

Network parameters: message start `0x1c163f28` (randomly generated,
no meaning), genesis timestamp 1714777860 with coinbase message
`03/May/2024 000000000000000000001ebd58c244970b3aa9d783bb001011fbe8ea8e98e00e`,
hashing to
`00000000da84f2bafbbc53dee25a72ae507ff4914b867c565be350b0da8bf043`.

### The exception is being exploited

BIP94 deliberately kept the 20-minute exception so CPU miners could
acquire coins and mine non-standard transactions. That has not held
up. Block storms are gone, but the exception is saturated: miners run
with the clock pushed forward and take the tip with difficulty-1
blocks, so the chain advances by propagation race rather than by
work, and small re-orgs are constant as exception blocks compete for
the same height.

Measured on 15 September 2026 via the mempool.space testnet4 API:
tip height 152,566; the retarget difficulty for the period beginning
at block 151,200 is ≈1.33 × 10⁹; yet 13 of the 15 blocks ending at
the tip were difficulty 1.

Anthony Towns' analysis on the bitcoin-dev list (June 2026) counted
192 real-difficulty against 1,824 min-difficulty blocks between
heights 135,072 and 137,087, i.e. roughly 90% of testnet4 blocks
confirmed without meaningful proof of work. The practical symptom
developers report is faucet transactions sitting unconfirmed for
30-60 minutes and then falling out of an almost-empty mempool.

bitcoin/bitcoin#31117 ("miner: Reorg Testnet4 minimum difficulty
blocks") proposes a mining-policy mitigation and is still open as of
September 2026.

## testnet5 (BIP95, draft)

BIP95 "Testnet 5", authors Pol Espinasa and Fabian Jahr, first
discussed on the bitcoin-dev list on 2 June 2026, assigned a number
on 22 June 2026 and merged into the BIPs repository as a draft on 25
June 2026. Status is **Draft** as of September 2026; it `Requires`
BIP54 and `Replaces` BIP94.

Three changes relative to testnet4:

- **No difficulty exception at all.** Any exception to the PoW rules
  is exploitable by a motivated attacker, so testnet5 drops the
  20-minute rule entirely and matches mainnet.
- **Higher minimum difficulty.** The PoW limit becomes `0x1a0fffff`
  in compact `nBits` encoding, a minimum difficulty of approximately
  1,000,000. This was rejected for testnet4 only because it would
  have blocked CPU miners from using the exception; with the
  exception gone, the argument lapses.
- **BIP54 (consensus cleanup) enforced from block 1.** Signet already
  enforces BIP54 via Bitcoin Inquisition, but signet cannot exercise
  a miner's own enforcement of those rules; testnet5 can.

Other parameters: message start `0x46495645` (ASCII `FIVE`), default
p2p port 18335. The genesis block is a TODO in the BIP — the values
printed there are testnet4 placeholders, and the intended `Pubkey` is
a recent mainnet block hash used as a provably-unspendable
anti-pre-mine commitment, with the coinbase `Message` left empty.

Patching testnet4 in place was considered and rejected: deploying a
change to a network whose attackers can disrupt the deployment is
slow, and anything beyond a band-aid would need a hard fork.

### Status of the implementation

bitcoin/bitcoin#35861 "Testnet 5 (BIP95)" (fjahr) has been open as a
**draft** since 1 August 2026. It is stacked on #35793 ("Implement
BIP 54 (Consensus Cleanup) without mainnet activation", darosior) and
per the PR description will not make the v32 feature freeze; the plan
is to settle review, mine a genesis block, start the network outside
a release, then ship a patched v32 with testnet5 included. As of
September 2026 there is no genesis block, no DNS seeds and no fixed
seeds, and `-testnet5` does not exist in Core master.

Do not plan on testnet5 for anything with a delivery date. Plan the
*migration* — if your software hardcodes chain parameters, the
testnet4 experience says you will be adding another set.

## Which network to pick

| Need | Use |
|------|-----|
| Deterministic unit/integration tests | regtest |
| Public peers, reliable 10-minute blocks | signet |
| Fast Lightning iteration | Mutinynet (custom signet) |
| Exercising real PoW / miner software | testnet4, with caveats |
| Testnet3 | only for legacy compatibility work |

Signet is the default recommendation for most development precisely
because it has no mining race to exploit: block production is
authorised by signature, so an attacker cannot flood the tip. Reach
for testnet4 when the thing under test *is* proof of work, difficulty
handling, or reorg behaviour — and expect the reorgs.

## Common pitfalls

- Assuming `-testnet` means testnet4. It does not; it is testnet3.
  The flag, the config section (`[test]`) and the datadir
  (`testnet3`) all disagree with each other, which is its own trap.
- Expecting a testnet3 wallet's coins to show up on testnet4. The
  genesis blocks differ, so the UTXO sets are disjoint and nothing
  replays across them.
- Trusting a `tb1...` address to identify a network. It does not.
- Writing tests that assume testnet4 confirms within N minutes.
  Confirmation there is currently unreliable; use signet or regtest
  for anything that must be deterministic.
- Treating a testnet4 block at difficulty 1 as a bug in your
  validation code. It is the 20-minute exception and it is valid.
- Hardcoding `0x1d00ffff` as "the testnet minimum". Testnet5 raises
  it to `0x1a0fffff`.

## See also

- [signet/SKILL.md](../signet/SKILL.md)
- [regtest/SKILL.md](../regtest/SKILL.md)
- [../core/operations/SKILL.md](../../core/operations/SKILL.md)
- BIP94: `https://github.com/bitcoin/bips/blob/master/bip-0094.mediawiki`
- BIP95: `https://github.com/bitcoin/bips/blob/master/bip-0095.md`
