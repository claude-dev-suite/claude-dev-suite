---
name: bitcoin-core-release-engineering
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

Repository: `github.com/bitcoin-core/guix.sigs`. After each release,
trusted builders publish their signed hashes:
```
<version>/<builder-name>/all.SHA256SUMS
<version>/<builder-name>/all.SHA256SUMS.asc
```

Verifying a release: download official binaries, compute SHA256,
compare to entries from N independent builders. If they all match,
no single builder could have introduced malware.

## Release signing keys

`contrib/builder-keys/keys.txt` lists trusted builder GPG keys (with
fingerprints). The release process requires N-of-M signed attestations
before the binary is published.

Maintainers' keys are also rotated periodically; check the current
list before trusting an older key.

## Release process (high level)

1. **Feature freeze** — typically ~1 month before scheduled release.
2. **Release branch** — `0.X` branched off `master`.
3. **Release candidates** (`rc1`, `rc2`, ...).
4. **Backports** — bug fixes flow from master to release branches.
5. **Final tag** — signed git tag.
6. **Guix builds** — multiple builders produce binaries.
7. **guix.sigs PR** — builders publish signed hashes.
8. **Release announcement** — on bitcoin.org, mailing list,
   bitcoincore.org.

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
sha256sum bitcoin-28.0-x86_64-linux-gnu.tar.gz
# compare to entries in SHA256SUMS
```

## Security disclosure

`security@bitcoincore.org` for security issues.
Embargoed disclosures: maintainers coordinate fixes across exchanges,
miners, services before public release.

Process documented in `SECURITY.md` of the repo.

## Vulnerability scoring

Bitcoin uses ad-hoc severity classification:
- **Critical**: consensus split, theft, DoS that crashes nodes.
- **High**: privacy leak, low-cost DoS.
- **Medium / Low**: bugs without immediate fund impact.

Past vulnerabilities like CVE-2018-17144 (inflation bug) → fixed
silently before public disclosure.

## Branch policy

- `master` — current development.
- `26.x`, `27.x`, `28.x` — maintenance branches.
- Backport criteria: bugfix only, no features.
- Maintenance EOL: typically ~2 years from a major version.

## Common confusions

- "Bitcoin Core" vs "Bitcoin" — Bitcoin Core is one implementation.
  Others (Bitcoin Knots, btcd) exist but Bitcoin Core is the
  reference and runs on >95% of nodes.
- **Pre-release builds** from PRs are NOT trusted; only tagged
  releases.
- Guix builds for **non-reproducible** components (system libraries
  like libc) require Guix to be set up correctly; cross-platform
  reproducibility is maintained via Guix's bootstrap chain.

## See also

- [rpc/SKILL.md](../rpc/SKILL.md)
- [knots/SKILL.md](../knots/SKILL.md)
- [operations/SKILL.md](../operations/SKILL.md)
