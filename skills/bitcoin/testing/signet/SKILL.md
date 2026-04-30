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

## Compared

| Aspect | regtest | testnet | signet (default) | Mutinynet |
|--------|---------|---------|-------------------|-----------|
| Block production | manual | competitive | signed | signed (30s) |
| Coin scarcity | unlimited | scarce, often empty faucets | faucets exist | faucets exist |
| Public reachability | local-only | yes | yes | yes |
| Reset | trivial | difficult | none usually | rare |
| LN testing | slow on regtest unless mock-time | OK | OK | best |

## Faucets

- Default signet: signet.bublina.eu.org/faucet, others.
- Mutinynet: faucet.mutinynet.com.
- Testnet: cycling faucets, often empty.

## See also

- [regtest/SKILL.md](../regtest/SKILL.md)
- [polar/SKILL.md](../polar/SKILL.md)
- [../core/operations/SKILL.md](../../core/operations/SKILL.md)
