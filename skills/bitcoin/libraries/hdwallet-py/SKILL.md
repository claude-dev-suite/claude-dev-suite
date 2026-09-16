---
name: bitcoin-libraries-hdwallet-py
description: |
  hdwallet (Python): HD wallet generator + key derivation. Multi-coin,
  BIP32/39/44/49/84/86/141.
  USE WHEN: deriving keys for many cryptocurrencies, scripting key
  generation in Python.
allowed-tools: Read, Grep, Glob
---

# hdwallet (Python)

Pure Python HD wallet library supporting many BIP standards across
many cryptocurrencies.

Repo: `github.com/hdwallet-io/python-hdwallet` (homepage
`hdwallet.io`). The project moved out of the author's personal
namespace into the `hdwallet-io` org; the pre-v3 URL
`github.com/meherett/python-hdwallet` is today a fork of that repo
rather than upstream (checked September 2026).

Latest release: v3.6.1 (August 2025); still maintained, with commits
on `master` through February 2026 (checked September 2026).

## Install

```bash
pip install 'hdwallet>=3'      # 3.6.1 as of September 2026
pip install 'hdwallet[cli]>=3' # plus the `hdwallet` CLI
```

v3.0.0 (November 2024) was a full rewrite and broke the v2 API. Code
written against v2 needs `pip install 'hdwallet<3'` (last v2 release:
2.2.1, December 2022) or a port to the v3 API below.

## Quick example

```python
from hdwallet import HDWallet
from hdwallet.cryptocurrencies import Bitcoin
from hdwallet.hds import BIP84HD
from hdwallet.mnemonics import BIP39Mnemonic
from hdwallet.derivations import BIP84Derivation, CHANGES

hdwallet: HDWallet = HDWallet(
    cryptocurrency=Bitcoin,
    hd=BIP84HD,
    network=Bitcoin.NETWORKS.MAINNET
).from_mnemonic(
    mnemonic=BIP39Mnemonic(mnemonic="abandon abandon ... about")
).from_derivation(
    derivation=BIP84Derivation(
        coin_type=Bitcoin.COIN_TYPE,
        account=0,
        change=CHANGES.EXTERNAL_CHAIN,
        address=0
    )
)

print(hdwallet.address())       # bc1q... (BIP84HD defaults to P2WPKH)
print(hdwallet.private_key())
print(hdwallet.public_key())
```

## Features

- BIP32 derivation (any path, via `CustomDerivation(path=...)`).
- BIP39 mnemonic (plus Algorand, Electrum-V1/V2, Monero mnemonics).
- BIP44/49/84/86 standard accounts, plus BIP141 semantics.
- Cardano (CIP1852), Electrum and Monero hierarchies.
- WIF, xprv/xpub serialization; BIP38 only via the `[cli]` extra
  (separate `bip38` package, not the `hdwallet` import surface).
- Multi-currency: 200+ chains (project's own count, v3.6.1).
- Address types: P2PKH, P2SH, P2TR, P2WPKH, P2WPKH-in-P2SH, P2WSH,
  P2WSH-in-P2SH, plus non-Bitcoin encodings.

## Use cases

- Tooling for key derivation across multiple chains.
- Educational / quick prototypes.
- Server-side bulk key generation (NOT recommended for production
  signing; use HW or HSM).

## Common pitfalls

- Server-side key generation has obvious risks (random source,
  memory leakage, etc.).
- Multi-currency = different default paths per chain; verify yours.
- v2 idioms (`from hdwallet.symbols import BTC`,
  `HDWallet(symbol=BTC)`, `from_path(...)`, `p2wpkh_address()`) do not
  work on v3. `hdwallet/symbols.py` still exists in 3.6.1, so the
  import succeeds and the failure surfaces later, at the constructor.
- `from_mnemonic()` takes a mnemonic *object* (`BIP39Mnemonic(...)`),
  not a bare string.
- No BIP85: the library has never shipped sub-seed derivation (absent
  from the 2.2.1, 3.6.1 and `master` source trees, checked September
  2026). Use a dedicated BIP85 implementation.
- `master` bumped the PyNaCl floor to `>=1.6.2` citing
  CVE-2025-69277 (January 2026); no tagged release carries that bump
  as of September 2026.

## See also

- [python-bitcoinlib/SKILL.md](../python-bitcoinlib/SKILL.md)
- [bdk-python/SKILL.md](../bdk-python/SKILL.md)
- [../../wallets/hd/SKILL.md](../../wallets/hd/SKILL.md)
- [../../cryptography/bip32/SKILL.md](../../cryptography/bip32/SKILL.md)
