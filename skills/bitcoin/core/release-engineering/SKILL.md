---
name: bitcoin-core-release-engineering
disable-model-invocation: true
description: |
  Bitcoin Core release engineering: Guix reproducible builds, signed
  release tarballs, deterministic outputs, code-signing keys, the
  release process, security disclosure.
  USE WHEN: building Bitcoin Core from source for verification,
  understanding release security, contributing to consensus-critical code.
allowed-tools: Read, Grep, Glob
---

# Bitcoin Core Release Engineering

Bitcoin Core ships **reproducible builds**: anyone with the source
+ Guix can produce byte-identical binaries to the official release.
This protects against supply-chain attacks targeting the build server.

## Guix reproducible builds

[GNU Guix](https://guix.gnu.org/) is the deterministic build environment.

```bash
# In bitcoin/ source directory
./contrib/guix/guix-build
```

Outputs:
- `guix-build-<version>/output/x86_64-linux-gnu/bitcoin-<version>-x86_64-linux-gnu.tar.gz`
- (and per other platforms via cross-compile)

The hash of these tarballs is what gets signed by maintainers.

## guix.sigs

Repository: `github.com/bitcoin-core/guix.sigs`. The Guix build runs in
two stages and each stage gets its own attestation, so after each
release trusted builders publish two signed hash files:
```
<version>/<builder-name>/noncodesigned.SHA256SUMS      # stage 1: built from source
<version>/<builder-name>/noncodesigned.SHA256SUMS.asc
<version>/<builder-name>/all.SHA256SUMS                # stage 2: + code signatures
<version>/<builder-name>/all.SHA256SUMS.asc
```

Stage 2 attaches the Windows/macOS detached code signatures distributed
from `bitcoin-core/bitcoin-detached-sigs`. `all.SHA256SUMS` covers every
binary uploaded to the website and is what release downloads should be
checked against (guix.sigs README, as of September 2026).

Verifying a release: download official binaries, compute SHA256,
compare to entries from N independent builders. If they all match,
no single builder could have introduced malware.

## Release signing keys

As of Bitcoin Core v22.0 releases are signed by a set of builder keys
published in the **guix.sigs** repository, one file per signer:
```
github.com/bitcoin-core/guix.sigs → builder-keys/<signer>.gpg
```

The old `contrib/builder-keys/keys.txt` in `bitcoin/bitcoin` is gone —
it shipped through v24.0 and was removed in November 2022 (commit
`e6864fa1`, "contrib: remove builder keys"). The path 404s on `master`
and on every tag from v25.0 onward (checked September 2026).

Publication does have thresholds. `doc/release-process.md` (as of
September 2026) gates the upload step on "6 or more people [having]
guix-built and their results match", and the Windows/macOS detached
code signatures are only produced "once the Windows and macOS builds
each have 3 matching signatures". Those numbers bind the release
managers. They are not a verification rule for you — downstream you
still pick which builder keys to trust and how many matching
signatures to demand.

Core ships the supported one-command path, `contrib/verify-binaries/verify.py`:
```bash
# download SHA256SUMS(.asc) + binaries, check sigs then hashes
./contrib/verify-binaries/verify.py pub 31.1

# fetch unrecognised builder keys automatically
./contrib/verify-binaries/verify.py --import-keys pub 31.1

# demand more attestations than the default of 3
./contrib/verify-binaries/verify.py --min-good-sigs 10 pub 31.1
```

Builders rotate keys and the signer set changes between releases; read
`builder-keys/` as of the version you are verifying, not an old copy.

## Release process (high level)

1. **Feature freeze** — typically ~1 month before scheduled release.
2. **Release branch** — `NN.x` branched off `master` (e.g. `31.x`).
3. **Release candidates** (`rc1`, `rc2`, ...).
4. **Backports** — bug fixes flow from master to release branches.
5. **Final tag** — signed git tag.
6. **Guix builds** — multiple builders produce binaries.
7. **guix.sigs PR** — builders publish signed hashes.
8. **Release announcement** — per `doc/release-process.md` (as of
   September 2026): the bitcoin-dev and bitcoin-core-dev mailing lists,
   the Bitcoin Core announcements list
   (<https://bitcoincore.org/en/list/announcements/join/>) and the
   project's social account. A bitcoincore.org blog post and the
   maintained-versions table are updated in the same pass.

## Source verification

To verify a downloaded tarball before building:
```bash
# Get GPG keys
gpg --keyserver hkps://keys.openpgp.org --recv-keys <maintainer-fingerprint>

# Verify
gpg --verify SHA256SUMS.asc SHA256SUMS
sha256sum -c SHA256SUMS
```

## Code-signing for binaries

- macOS: signed via Apple's developer cert (so Gatekeeper accepts it).
- Windows: code-signed with EV certificate.
- These signatures are **separate** from the GPG signatures and
  protect against OS-level "untrusted publisher" warnings, not
  against tampering of the source tarball itself.

For Linux: no platform-level signing (rely on Guix + GPG).

## Hash verification on first run

`bitcoind` does NOT self-verify on each run. The integrity check is
done at install time:
```bash
sha256sum bitcoin-31.1-x86_64-linux-gnu.tar.gz
# compare to entries in SHA256SUMS
```

## Security disclosure

`security@bitcoincore.org` for security issues.
Embargoed disclosures: maintainers coordinate fixes across exchanges,
miners, services before public release.

Process documented in `SECURITY.md` of the repo.

Medium- and High-severity advisories are published about two weeks
after the last affected version goes EOL, so the public CVE list lags
the fix by a long way (Low severity is disclosed two weeks after the
fixed major ships; Critical is handled ad hoc). Policy as of September
2026 — see <https://bitcoincore.org/en/security-advisories/>.
CVE-2024-52911 (High; use-after-free — a background script-check thread
could read the precomputed transaction data after it was destroyed;
affects 0.14.0 through 28.x) was reported 2024-11-02, fixed in 29.0
(April 2025) and disclosed 2026-05-05, just over two weeks after 28.x
went EOL on 2026-04-19. So "no advisory against this major" is not
evidence it is safe. For the resulting version floor see
[operations/SKILL.md](../operations/SKILL.md),
"Security advisories and minimum safe version".

## Vulnerability scoring

Bitcoin uses ad-hoc severity classification:
- **Critical**: consensus split, theft, DoS that crashes nodes.
- **High**: privacy leak, low-cost DoS.
- **Medium / Low**: bugs without immediate fund impact.

Past vulnerabilities like CVE-2018-17144 (inflation bug) → fixed
silently before public disclosure.

## Branch policy

- `master` — current development.
- `NN.x` — one maintenance branch per major version.
- Backport criteria: bugfix only, no features. Documented exception:
  consensus rule changes ship first in a maintenance release (22.2,
  23.1, …) so the changeset stays small and reviewable.
- Maintenance window: the latest **three** major versions. When a new
  major is released the oldest falls out and becomes End of Life; EOL
  lines do not generally receive security fixes. Majors are targeted
  every 6 months, so a line is maintained for roughly 18 months — not a
  fixed calendar period.
- As of September 2026: latest release **31.1 (2026-07-08)**, with
  maintenance releases 30.3 and 29.4 (both 2026-07-10). Maintained lines
  are **29.x, 30.x and 31.x**; 28.x (EOL 2026-04-19) and older are not.
  `32.x` is branched for the in-flight v32.0 (`v32.0rc1` tagged
  2026-09-14); when v32.0 ships, 29.x goes EOL.
- The schedule moves every ~6 months — read it from
  <https://bitcoincore.org/en/lifecycle/> rather than trusting the list
  above.

## Common confusions

- "Bitcoin Core" vs "Bitcoin" — Bitcoin Core is one implementation.
  Others (Bitcoin Knots, btcd) exist but Bitcoin Core is the
  reference and runs on ~81–83% of public nodes (Coin Dance 82.9%,
  21,361 of 25,766; Bitnodes ~81%, 21,497 of 26,556; both 2026-09-16) —
  a large majority, not the whole network. See
  [knots/SKILL.md](../knots/SKILL.md) for the split.
- **Pre-release builds** from PRs are NOT trusted; only tagged
  releases.
- Guix builds for **non-reproducible** components (system libraries
  like libc) require Guix to be set up correctly; cross-platform
  reproducibility is maintained via Guix's bootstrap chain.

## See also

- [rpc/SKILL.md](../rpc/SKILL.md)
- [knots/SKILL.md](../knots/SKILL.md)
- [operations/SKILL.md](../operations/SKILL.md)
