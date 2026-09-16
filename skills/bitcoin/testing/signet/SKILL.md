---
name: bitcoin-testing-signet
description: |
  Signet: signature-based testnet alternatives. Default signet,
  custom signets (signetchallenge), Mutinynet (30-sec blocks).
  Faster + more deterministic than testnet.
  USE WHEN: testing on a public-style network, avoiding mainnet
  fees but with realistic block timing.
allowed-tools: Read, Grep, Glob
---

# signet

A test network where blocks are signed by a fixed key (or set of
keys) rather than mined competitively. Replaces testnet for many
purposes.

## Default signet

Bitcoin Core ships with a default signet (`-signet`). Block challenge
is `signetchallenge=...` provided in config.

```bash
bitcoind -signet -daemon
```

10-minute block target, similar to mainnet.

## Custom signet

You can run your own signet with custom challenge:
```ini
[signet]
signetchallenge=<output_script>
addnode=<your-seed-node>:38333
```

Block-signing key holders produce blocks; everyone else validates.

## Mutinynet

A custom signet by MutinyWallet team:
- **30-second block target** (vs default's 10 min).
- Useful for **fast Lightning testing**.
- Fast feedback loop for protocol experimentation.

```ini
[signet]
signetchallenge=512102f7561d208dd9ae99bf497273e16f389bdbd6c4742ddb8e6b216e64fa2928ad8f51ae
addnode=45.79.52.207:38333
```

(Example — check current Mutinynet docs for current challenge.)

## Use cases

- **Lightning protocol testing** with realistic block delays.
- **Multi-party experiments** without mainnet fees.
- **Wallet integration testing** more public-like than regtest.
- **Mutinynet** specifically for fast LN iteration.

## Testnet3 vs testnet4

The "testnet" that signet is usually compared against has two incarnations.
Testnet3 (genesis February 2011) was deprecated in Core 28.0 (Oct 2024),
which is the release that shipped testnet4. As of Bitcoin Core 31.1
(July 2026) testnet3 is still there, but `-testnet` is documented as
"Support for testnet3 is deprecated and will be removed in an upcoming
release" and the node logs the same warning at startup. Two removal
PRs (#31974, #35779) were opened and closed unmerged; the "when to
drop testnet3" tracking issue (#31975) is still open as of September
2026. Assume testnet3 works today and plan to migrate.

Testnet4 is specified in BIP94 (Fabian Jahr; status "Deployed" as of
September 2026) and selected with `-testnet4` / a `[testnet4]` config
section. It keeps mainnet consensus rules — every soft fork through
taproot enforced from block 1 — plus three testnet-specific rules:

1. The 20-minute minimum-difficulty exception is preserved, but the
   first block of each difficulty period must use the real difficulty.
2. Retargeting takes its base difficulty from the **first** block of
   the previous period, not the last. This is the block-storm fix: on
   testnet3 a min-difficulty last block pinned the next period's
   difficulty to 1-4, so years of blocks could be mined in weeks.
3. Time-warp prevention: the first block of a period must have
   `nTime >= previous block's nTime - 600`.

Network parameters: message start `0x1c163f28`, p2p port 48333, RPC
port 48332, datadir subdirectory `testnet4`, genesis timestamped
`03/May/2024 ...` hashing to
`00000000da84f2bafbbc53dee25a72ae507ff4914b867c565be350b0da8bf043`.
The bech32 HRP is `tb`, shared with testnet3 and signet — addresses
are indistinguishable across the three, coins are not interchangeable.
Tip height was about 152,500 in September 2026.

```bash
bitcoind -testnet4 -daemon
```

## Compared

| Aspect | regtest | testnet3 | testnet4 | signet (default) | Mutinynet |
|--------|---------|----------|----------|-------------------|-----------|
| Block production | manual | competitive | competitive | signed | signed (30s) |
| Coin scarcity | unlimited | scarce, often empty faucets | scarce, faucets exist | faucets exist | faucets exist |
| Public reachability | local-only | yes | yes | yes | yes |
| Reset | trivial | difficult | difficult | none usually | rare |
| LN testing | slow on regtest unless mock-time | OK | OK | OK | best |
| Status (Sept 2026) | current | deprecated since Core 28.0 | current | current | current |

## Faucets

- Default signet: signet.bublina.eu.org/faucet, others.
- Mutinynet: faucet.mutinynet.com.
- Testnet3: cycling faucets, often empty.
- Testnet4: coinfaucet.eu/en/btc-testnet4/ (live September 2026).

## See also

- [regtest/SKILL.md](../regtest/SKILL.md)
- [testnet/SKILL.md](../testnet/SKILL.md)
- [polar/SKILL.md](../polar/SKILL.md)
- [../core/operations/SKILL.md](../../core/operations/SKILL.md)
