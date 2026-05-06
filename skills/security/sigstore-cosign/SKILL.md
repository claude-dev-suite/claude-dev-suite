---
name: sigstore-cosign
description: |
  Sigstore — keyless signing for software artifacts using OIDC identities and
  short-lived certificates from Fulcio CA, with Rekor transparency log. Cosign
  is the CLI for signing/verifying containers, OCI artifacts, blobs, and
  attestations (SBOMs, provenance). Covers GitHub Actions OIDC integration,
  policy enforcement (cosign-policy-controller, Kyverno), Notary v2 vs Cosign,
  and supply-chain attestation patterns (SLSA).

  USE WHEN: user mentions "Sigstore", "Cosign", "Fulcio", "Rekor", "keyless signing",
  "OIDC signing", "cosign sign", "cosign verify", "SLSA provenance",
  "OCI artifact signing", "attestation cosign"

  DO NOT USE FOR: GPG-style signing - use GPG-specific docs
  DO NOT USE FOR: Code signing certificates (Apple Developer ID, Authenticode) - platform-specific
  DO NOT USE FOR: Reproducible builds spec - use `infrastructure/reproducible-builds`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Sigstore + Cosign — Keyless Artifact Signing

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `sigstore` or `cosign`.

## Why Sigstore

Traditional signing requires long-lived private keys: distribute, secure, rotate, audit. Sigstore replaces the model with **keyless signing**:

1. CI proves identity via OIDC (e.g., GitHub Actions has built-in OIDC token)
2. **Fulcio** issues short-lived (10 min) X.509 cert bound to that identity
3. Sign artifact, attach signature + cert to artifact
4. **Rekor** transparency log records the signing event (Merkle tree)
5. Verifier checks: cert chain is valid, identity matches expected, log entry exists

No keys to manage. Identity-based trust. Public auditability via Rekor.

**Sigstore project includes**:
- **Cosign** — CLI for sign/verify (most-used component)
- **Fulcio** — Code-signing CA
- **Rekor** — Transparency log (https://search.sigstore.dev/)
- **Gitsign** — Sign git commits with sigstore (replaces GPG)

Adopted by Kubernetes, npm (since 2023), GitHub container registry, JFrog, Wolfi/Chainguard images.

## Install Cosign

```bash
# macOS
brew install cosign

# Linux
curl -LO https://github.com/sigstore/cosign/releases/latest/download/cosign-linux-amd64
chmod +x cosign-linux-amd64 && sudo mv cosign-linux-amd64 /usr/local/bin/cosign

# Verify
cosign version
```

## Sign a Container Image (Keyless)

```bash
# Push image first
docker push ghcr.io/bhodl/api:1.0.0

# Sign with keyless OIDC (browser opens for OAuth)
cosign sign ghcr.io/bhodl/api:1.0.0

# In CI (no interactive auth — uses ambient OIDC):
COSIGN_EXPERIMENTAL=1 cosign sign --yes ghcr.io/bhodl/api:1.0.0
```

The signature is stored as a separate OCI artifact next to the image (`<image>:<digest>.sig`).

## Verify

```bash
cosign verify ghcr.io/bhodl/api:1.0.0 \
    --certificate-identity-regexp="^https://github\.com/bhodl/api/" \
    --certificate-oidc-issuer="https://token.actions.githubusercontent.com"
```

`--certificate-identity-regexp` constrains who could have signed (the workflow URL). `--certificate-oidc-issuer` constrains the OIDC provider.

For a specific workflow:

```bash
cosign verify ghcr.io/bhodl/api:1.0.0 \
    --certificate-identity="https://github.com/bhodl/api/.github/workflows/release.yml@refs/heads/main" \
    --certificate-oidc-issuer="https://token.actions.githubusercontent.com"
```

## Sign with a Key (Traditional)

If you must use a key (e.g., air-gapped CI):

```bash
# Generate keypair (encrypted private key)
cosign generate-key-pair
# → cosign.key, cosign.pub

# Sign
cosign sign --key cosign.key ghcr.io/bhodl/api:1.0.0

# Verify
cosign verify --key cosign.pub ghcr.io/bhodl/api:1.0.0
```

For HSM/KMS-backed keys:

```bash
cosign sign --key azurekms://my-vault.vault.azure.net/my-key ghcr.io/bhodl/api:1.0.0
cosign sign --key gcpkms://projects/PROJ/locations/LOC/keyRings/RING/cryptoKeys/KEY ...
cosign sign --key awskms://us-east-1/KEY-UUID ...
cosign sign --key hashivault://my-key ...
```

## Sign Blobs (Files, Not Containers)

```bash
# Sign a binary
cosign sign-blob --yes my-app.tar.gz \
    --output-signature my-app.tar.gz.sig \
    --output-certificate my-app.tar.gz.pem

# Verify
cosign verify-blob my-app.tar.gz \
    --signature my-app.tar.gz.sig \
    --certificate my-app.tar.gz.pem \
    --certificate-identity-regexp="^https://github\.com/bhodl/" \
    --certificate-oidc-issuer="https://token.actions.githubusercontent.com"
```

For a release: sign the SHA-256 of the artifact:

```bash
cosign sign-blob --yes <(sha256sum my-app.tar.gz | cut -d' ' -f1)
```

## Attestations (Verifiable Metadata)

Attach SBOM, provenance, or custom predicates to an artifact:

```bash
# Generate SBOM (e.g., with syft)
syft ghcr.io/bhodl/api:1.0.0 -o spdx-json > sbom.spdx.json

# Attach as attestation
cosign attest --yes \
    --predicate sbom.spdx.json \
    --type spdxjson \
    ghcr.io/bhodl/api:1.0.0

# Verify attestation
cosign verify-attestation \
    --type spdxjson \
    --certificate-identity-regexp="^https://github\.com/bhodl/" \
    --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
    ghcr.io/bhodl/api:1.0.0
```

Predicate types:
- `slsaprovenance` — build provenance (SLSA spec)
- `spdxjson`, `cyclonedx` — SBOM formats
- `vuln` — vulnerability scan
- `custom` — your own JSON schema

## SLSA Provenance

SLSA (Supply-chain Levels for Software Artifacts) — framework for build attestation. Generate provenance via SLSA GitHub action:

```yaml
# .github/workflows/release.yml
permissions:
  id-token: write
  contents: read
  packages: write

jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      digest: ${{ steps.build.outputs.digest }}
    steps:
      - uses: actions/checkout@v4
      - id: build
        run: |
          docker buildx build --push --tag ghcr.io/bhodl/api:${{ github.sha }} . > digest.txt
          echo "digest=$(cat digest.txt)" >> $GITHUB_OUTPUT

  provenance:
    needs: build
    permissions:
      actions: read
      id-token: write
      packages: write
    uses: slsa-framework/slsa-github-generator/.github/workflows/generator_container_slsa3.yml@v2.0.0
    with:
      image: ghcr.io/bhodl/api
      digest: ${{ needs.build.outputs.digest }}
      registry-username: ${{ github.actor }}
    secrets:
      registry-password: ${{ secrets.GITHUB_TOKEN }}
```

Attestation auto-pushed alongside image, signed by Sigstore.

## GitHub Actions OIDC Setup

Cosign keyless requires GitHub's `id-token` permission:

```yaml
permissions:
  id-token: write          # required for OIDC
  contents: read
  packages: write          # if pushing to ghcr.io

jobs:
  sign:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build & push
        run: |
          docker build -t ghcr.io/bhodl/api:${{ github.sha }} .
          docker push ghcr.io/bhodl/api:${{ github.sha }}

      - name: Install cosign
        uses: sigstore/cosign-installer@v3.7.0

      - name: Sign image
        env:
          COSIGN_EXPERIMENTAL: "true"
        run: cosign sign --yes ghcr.io/bhodl/api:${{ github.sha }}
```

## Policy Enforcement (Kubernetes)

### Cosigned (deprecated) → policy-controller

```bash
helm install policy-controller \
    sigstore/policy-controller \
    --version 0.10.0 \
    -n cosign-system --create-namespace
```

Define policy:

```yaml
apiVersion: policy.sigstore.dev/v1beta1
kind: ClusterImagePolicy
metadata:
  name: bhodl-images-must-be-signed
spec:
  images:
    - glob: ghcr.io/bhodl/**
  authorities:
    - keyless:
        url: https://fulcio.sigstore.dev
        identities:
          - issuer: https://token.actions.githubusercontent.com
            subjectRegExp: ^https://github\.com/bhodl/api/\.github/workflows/release\.yml@refs/heads/main$
```

Pods using `ghcr.io/bhodl/*` images that aren't signed by the right workflow → rejected.

### Kyverno Equivalent

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: verify-signatures
spec:
  validationFailureAction: Enforce
  rules:
    - name: check-image-signatures
      match:
        any:
        - resources:
            kinds: [Pod]
      verifyImages:
        - imageReferences:
            - "ghcr.io/bhodl/*"
          attestors:
            - entries:
                - keyless:
                    subject: "https://github.com/bhodl/*"
                    issuer: "https://token.actions.githubusercontent.com"
```

## Sign Git Commits — Gitsign

Sigstore replacement for GPG commit signing.

```bash
brew install gitsign

git config --global commit.gpgsign true
git config --global tag.gpgsign true
git config --global gpg.x509.program gitsign
git config --global gpg.format x509

# Sign a commit (browser opens for OAuth)
git commit -m "feat: add wallet sync"

# View signature
git log --show-signature -1
```

## Inspect Sigstore Records

```bash
# Search Rekor for transparency log entries
rekor-cli search --email user@example.com
rekor-cli search --artifact my-app.tar.gz
rekor-cli get --uuid 24296fb24b8ad77a...

# Search via web UI
open https://search.sigstore.dev
```

## Cosign vs Notary v2

| Feature | Cosign (Sigstore) | Notary v2 |
|---|---|---|
| Backed by | OpenSSF | CNCF |
| Standard for OCI signature | Yes (de facto) | Yes (formal) |
| Keyless (OIDC) | ✅ Native | Plugin |
| Transparency log | ✅ Rekor | Optional |
| Adoption | Wider (npm, GitHub, k8s) | Growing (registry vendors) |
| Key-based fallback | ✅ | ✅ |
| Attestations | ✅ in-toto, SBOMs | ✅ |

For most users: **Cosign**. For enterprise registries (JFrog Artifactory, Harbor) that prefer Notary v2 spec: both supported, often interoperable.

## Mobile App Signing (BHODL-style)

For wallet apps shipping APKs/IPAs/binaries publicly:

```yaml
# .github/workflows/release.yml
jobs:
  release:
    runs-on: macos-14
    permissions:
      id-token: write
      contents: write
    steps:
      - uses: actions/checkout@v4
      - name: Build APK
        run: ./gradlew :apps:android:bundleRelease

      - name: Build XCFramework
        run: ./gradlew :shared:assembleSharedXCFramework

      - uses: sigstore/cosign-installer@v3.7.0

      - name: Sign artifacts
        run: |
          cosign sign-blob --yes apps/android/app/build/outputs/bundle/release/app-release.aab \
              --output-signature app-release.aab.sig \
              --output-certificate app-release.aab.pem

          cosign sign-blob --yes Bhodl.xcframework.zip \
              --output-signature Bhodl.xcframework.zip.sig \
              --output-certificate Bhodl.xcframework.zip.pem

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: |
            apps/android/app/build/outputs/bundle/release/app-release.aab
            app-release.aab.sig
            app-release.aab.pem
            Bhodl.xcframework.zip
            Bhodl.xcframework.zip.sig
            Bhodl.xcframework.zip.pem
```

Users verify before installing:

```bash
cosign verify-blob app-release.aab \
    --signature app-release.aab.sig \
    --certificate app-release.aab.pem \
    --certificate-identity="https://github.com/bhodl/wallet/.github/workflows/release.yml@refs/tags/v1.0.0" \
    --certificate-oidc-issuer="https://token.actions.githubusercontent.com"
```

Pair with reproducible builds (see `infrastructure/reproducible-builds`) for full chain: code → reproducible build → signed → verifiable.

## Anti-Patterns

| Anti-pattern | Why it's bad | Correct approach |
|---|---|---|
| Sharing private signing key in CI secrets | Single point of compromise | Use keyless OIDC |
| Skipping `--certificate-identity-regexp` on verify | Any signer accepted | Always pin identity |
| Signing on dev workflows | Pollutes Rekor with non-release signs | Sign only on tag/release workflows |
| Storing `cosign.key` in repo | Even encrypted, exposes ciphertext | Use HSM/KMS or keyless |
| `cosign verify` without `--certificate-oidc-issuer` | Accepts any issuer | Pin issuer |
| Bundling signatures inside the artifact | Can't verify externally | Distribute alongside (`.sig`, `.pem`) |
| No attestation for build provenance | Can't trace artifact → source | Use SLSA provenance |
| Signing only the latest tag, not each release | Old releases unverifiable | Sign every release |
| Ignoring Rekor inclusion proof during verify | Could miss tampering | `cosign verify` checks by default |
| Trusting `latest` tag | Mutable | Sign + verify by digest |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Error: getting signer: getting key from KMS provider: getting OIDC token` | Missing OIDC permission | Add `id-token: write` to workflow |
| `verifying signature: no matching signatures` | Wrong certificate-identity-regexp | Loosen regex or check actual identity in Rekor |
| `cosign sign` opens browser locally but fails | Behind firewall, no OAuth callback | Use `--identity-token` flag with pre-fetched token |
| Signature pushed but `cosign verify` fails | Image moved/retagged | Verify by digest, not tag |
| `unsupported predicate type` | Custom predicate, no built-in type | Use `--type custom` and provide schema |
| Slow verify in CI | Network round trip to Rekor | Cache Rekor public key, use `--rekor-url` to point to mirror if needed |
| `policy-controller` denies known-good image | Identity regex too strict | Test with `cosign verify` first, match regex |
| `Error reading signing key` | Encrypted key + missing password | `COSIGN_PASSWORD` env or `--password-file` |
| Build artifact hash mismatch on verify | Artifact modified after signing | Re-sign; ensure no post-build mutation |

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| Apple Developer ID code signing | `mobile/ios-native` (build & distribution) |
| Android APK signing for Play Store | Android Gradle signing (`signingConfigs`) |
| Authenticode (Windows EXE/MSI) | Windows-specific signing tooling |
| GPG-style signing for legacy systems | GPG docs |
| Reproducible builds spec | `infrastructure/reproducible-builds` |
