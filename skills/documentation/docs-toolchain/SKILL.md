---
name: docs-toolchain
description: |
  Documentation toolchain for multi-language projects: mdBook (Markdown books with
  Rust ecosystem support — used by Bitcoin Core, Rust Book), rustdoc (Rust API
  docs auto-gen), Dokka (Kotlin API docs, JVM + KMP + multiplatform sections),
  Showkase (Compose component browser). Covers single-source-of-truth setup, CI
  publication to GitHub Pages, cross-linking between API docs and prose books,
  versioning strategies for releases.

  USE WHEN: user mentions "mdBook", "Dokka", "rustdoc", "Showkase",
  "API documentation", "documentation site", "GitHub Pages docs",
  "docs.rs", "docs publishing", "Kotlin API docs"

  DO NOT USE FOR: Code-level inline docs syntax (KDoc, rustdoc comments) - that's part of language skills
  DO NOT USE FOR: README authoring - generic markdown
  DO NOT USE FOR: Sphinx (Python) - separate Python docs skill
  DO NOT USE FOR: TypeDoc (TS) - already in `documentation` (typedoc-specific)
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Documentation Toolchain (mdBook + Dokka + rustdoc)

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `mdbook`, `dokka`, or `rustdoc`.

## Tool Selection

| Tool | Best for | Output |
|---|---|---|
| **mdBook** | Long-form prose docs (book/handbook style) | Static HTML site, searchable |
| **rustdoc** | Rust API reference (auto-generated from `///` comments) | docs.rs-style HTML |
| **Dokka** | Kotlin/JVM/KMP API reference | HTML or Markdown |
| **Showkase** | Compose UI component browser (interactive previews) | Embedded in app or live site |

For BHODL-style multi-language project (Rust core + Kotlin/Swift mobile + Compose UI), use **all four** — each auto-targets its language.

## mdBook — Prose Documentation

Used by Bitcoin Core docs, The Rust Book, RustNomicon, BDK book.

### Install

```bash
cargo install mdbook

# Or via binstall (faster)
cargo binstall mdbook

# Plugins (popular)
cargo install mdbook-mermaid           # Mermaid diagrams
cargo install mdbook-toc               # auto table of contents
cargo install mdbook-linkcheck         # validate links
cargo install mdbook-katex             # LaTeX math rendering
```

### Initialize

```bash
mdbook init my-docs
cd my-docs
```

Creates:
```
my-docs/
├── book.toml
└── src/
    ├── SUMMARY.md           # nav structure
    ├── chapter_1.md
    └── README.md
```

### Configuration

```toml
# book.toml
[book]
authors = ["BHODL Team"]
language = "en"
multilingual = false
src = "src"
title = "BHODL Handbook"
description = "Self-custodial Bitcoin wallet handbook"

[output.html]
default-theme = "light"
preferred-dark-theme = "navy"
git-repository-url = "https://github.com/bhodl/bhodl"
git-repository-icon = "fa-github"
edit-url-template = "https://github.com/bhodl/bhodl/edit/main/docs/{path}"
site-url = "/bhodl/"
cname = "docs.bhodl.app"

[output.html.search]
enable = true
limit-results = 30
heading-split-level = 2

[output.html.fold]
enable = true
level = 1

[preprocessor.mermaid]
command = "mdbook-mermaid"

[preprocessor.toc]
command = "mdbook-toc"
renderer = ["html"]

[output.linkcheck]
follow-web-links = false
warning-policy = "error"
```

### SUMMARY.md (Navigation)

```markdown
# Summary

[Introduction](README.md)

# User Guide
- [Quick Start](user/quick-start.md)
- [Create a Wallet](user/create-wallet.md)
- [Backup & Recovery](user/backup.md)
- [Send & Receive](user/send-receive.md)

# Architecture
- [Overview](arch/overview.md)
- [Bitcoin Core Layer](arch/bitcoin.md)
- [Lightning Layer](arch/lightning.md)
- [FFI & Mobile](arch/ffi.md)

# Developer Guide
- [Build From Source](dev/build.md)
- [Reproducible Build](dev/reproducible.md)
- [Contributing](dev/contributing.md)

# Reference
- [API](reference/api.md)
- [Configuration](reference/config.md)

[Glossary](glossary.md)
[Changelog](changelog.md)
```

### Build & Serve

```bash
mdbook build                  # generates book/ directory
mdbook serve                  # live reload at localhost:3000
mdbook test                   # run code blocks as tests (Rust by default)
mdbook clean
```

### Custom CSS / JS

```toml
# book.toml
[output.html]
additional-css = ["theme/bhodl.css"]
additional-js = ["theme/copy-code.js"]
```

For brand consistency, override mdBook's default theme with BHODL colors.

## rustdoc — Rust API Documentation

```rust
//! Crate-level docs go here.
//!
//! # Examples
//!
//! ```
//! let wallet = bhodl::Wallet::new("abandon abandon ...");
//! ```

/// Creates a new wallet from a BIP39 mnemonic.
///
/// # Arguments
/// * `mnemonic` - The BIP39 seed phrase (12 or 24 words)
///
/// # Errors
/// Returns [`WalletError::InvalidMnemonic`] if the mnemonic is malformed.
///
/// # Example
/// ```
/// use bhodl::Wallet;
/// let wallet = Wallet::new("abandon abandon abandon ...")?;
/// # Ok::<(), bhodl::WalletError>(())
/// ```
pub fn new(mnemonic: &str) -> Result<Wallet, WalletError> {
    // ...
}
```

### Build

```bash
cargo doc                     # build docs for current crate
cargo doc --open              # build and open in browser
cargo doc --no-deps           # only your crate, not deps
cargo doc --workspace         # all workspace crates
cargo doc --document-private-items
```

Output in `target/doc/<crate_name>/`.

### Doc Tests

Code blocks in `///` comments are run as tests:

```bash
cargo test --doc
```

Catches docs that drift out of sync with code. Use `# ` prefix to hide setup lines.

### Cargo.toml Metadata

```toml
[package]
name = "bhodl"
version = "0.1.0"
authors = ["BHODL Team"]
description = "Self-custodial Bitcoin wallet"
documentation = "https://docs.rs/bhodl"
repository = "https://github.com/bhodl/bhodl"
keywords = ["bitcoin", "wallet", "lightning"]
categories = ["cryptography"]

[package.metadata.docs.rs]
all-features = true
rustdoc-args = ["--cfg", "docsrs"]
```

For docs.rs publishing: ensure `Cargo.toml` metadata is rich. The site auto-builds on each crates.io release.

### Publish to docs.rs

```bash
cargo publish                 # auto-triggers docs.rs build
```

For private projects: host rustdoc output on GitHub Pages.

## Dokka — Kotlin API Documentation

For KMP / Android / JVM Kotlin code.

### Setup

```kotlin
// build.gradle.kts (root)
plugins {
    id("org.jetbrains.dokka") version "1.9.20"
}

allprojects {
    apply(plugin = "org.jetbrains.dokka")
}

// Per module
tasks.dokkaHtml.configure {
    outputDirectory.set(layout.buildDirectory.dir("dokka"))
    dokkaSourceSets.configureEach {
        documentedVisibilities.set(setOf(Visibility.PUBLIC, Visibility.PROTECTED))
        skipDeprecated.set(false)
        suppressInheritedMembers.set(true)
        sourceLink {
            localDirectory.set(file("src"))
            remoteUrl.set(URL("https://github.com/bhodl/shared/tree/main/src"))
            remoteLineSuffix.set("#L")
        }
        externalDocumentationLink {
            url.set(URL("https://kotlinlang.org/api/latest/jvm/stdlib/"))
        }
    }
}

tasks.dokkaHtmlMultiModule.configure {
    outputDirectory.set(rootDir.resolve("docs/api"))
}
```

### KDoc Syntax

```kotlin
/**
 * Manages a Bitcoin wallet with BIP39 backup.
 *
 * @property network The Bitcoin network (mainnet, testnet, etc.)
 * @constructor Creates a wallet from a mnemonic.
 *
 * @sample WalletSamples.basicUsage
 */
class Wallet(
    val network: Network,
    mnemonic: String,
) {
    /**
     * Returns the next unused receive address.
     *
     * @param index Address index in the derivation path. Defaults to next unused.
     * @return BIP-encoded address.
     * @throws WalletException if descriptor is invalid.
     */
    fun nextAddress(index: Int? = null): String { /* ... */ }
}
```

### Build

```bash
./gradlew dokkaHtml                              # one module HTML
./gradlew dokkaHtmlMultiModule                   # combined for all modules
./gradlew dokkaGfm                                # GitHub-flavored Markdown output
./gradlew dokkaJavadoc                            # legacy Javadoc-style HTML
```

### Multiplatform Source Sets

Dokka understands KMP source sets — generates per-platform docs:

```kotlin
dokkaSourceSets {
    named("commonMain") {
        displayName.set("Common")
    }
    named("androidMain") {
        displayName.set("Android")
        platform.set(org.jetbrains.dokka.Platform.jvm)
    }
    named("iosMain") {
        displayName.set("iOS")
        platform.set(org.jetbrains.dokka.Platform.native)
    }
}
```

Output shows expect/actual relationships, per-platform availability.

### Publishing

```kotlin
publishing {
    publications.withType<MavenPublication> {
        artifact(tasks.dokkaJar.get())
    }
}

tasks.register<Jar>("dokkaJar") {
    dependsOn(tasks.dokkaHtml)
    archiveClassifier.set("javadoc")
    from(tasks.dokkaHtml.get().outputDirectory)
}
```

For Maven Central: include `dokkaJar` artifact alongside JAR.

## Showkase — Compose Component Browser

Auto-discovers `@Preview` composables and renders them in a browsable UI (in-app or static site).

```kotlin
// build.gradle.kts
implementation("com.airbnb.android:showkase:1.0.4")
ksp("com.airbnb.android:showkase-processor:1.0.4")
```

```kotlin
@ShowkaseRoot
class MyShowkaseRootModule : ShowkaseRootModule

// Annotate composables for browser
@ShowkaseComposable(name = "WalletItem", group = "Wallet")
@Composable
fun WalletItemPreview() {
    BhodlTheme {
        WalletItem(testWallet())
    }
}
```

```kotlin
// In MainActivity (debug build only)
@Composable
fun ShowkaseEntry() {
    val context = LocalContext.current
    Button(onClick = {
        context.startActivity(Showkase.getBrowserIntent(context))
    }) { Text("Component browser") }
}
```

For static site export (in CI):

```kotlin
// Use showkase-screenshot-testing or manual export
```

Pair with **Paparazzi** for snapshots — see `testing/compose-snapshot`.

## Combining All Tools — Project Layout

```
bhodl/
├── docs/
│   ├── book.toml                                # mdBook config
│   └── src/
│       ├── SUMMARY.md
│       ├── user/...
│       ├── arch/...
│       └── reference/
│           ├── rust-api.md                       # links to rustdoc
│           └── kotlin-api.md                     # links to Dokka
├── crates/
│   └── bhodl-core/
│       ├── Cargo.toml
│       └── src/                                  # rustdoc auto-generated
├── shared/                                       # KMP module (Dokka auto-generated)
│   └── src/
└── .github/workflows/
    └── docs.yml                                  # publish all to GitHub Pages
```

## Single Site Deployment

Combine all outputs into one site:

```
docs-site/
├── /                                            # mdBook output
├── /api/rust/                                    # cargo doc output
├── /api/kotlin/                                  # Dokka multiModule output
└── /components/                                  # Showkase static export
```

Cross-link from book chapters to API docs:

```markdown
For details see the [`Wallet` Rust API](api/rust/bhodl/struct.Wallet.html)
or the [Kotlin API](api/kotlin/-shared/com.bhodl/-wallet/).
```

## CI Publication — GitHub Pages

```yaml
# .github/workflows/docs.yml
name: Publish docs

on:
  push:
    branches: [main]
  release:
    types: [published]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: actions/setup-java@v4
        with: { java-version: '17', distribution: 'temurin' }
      - uses: gradle/actions/setup-gradle@v4

      - name: Install mdBook
        run: cargo binstall -y mdbook mdbook-mermaid mdbook-toc mdbook-linkcheck

      - name: Build mdBook
        run: cd docs && mdbook build

      - name: Build rustdoc
        run: cargo doc --workspace --no-deps --all-features
        env:
          RUSTDOCFLAGS: "-D warnings"

      - name: Build Dokka
        run: ./gradlew dokkaHtmlMultiModule

      - name: Combine output
        run: |
          mkdir -p public
          cp -r docs/book/* public/
          mkdir -p public/api/rust
          cp -r target/doc/* public/api/rust/
          mkdir -p public/api/kotlin
          cp -r docs/api/* public/api/kotlin/

      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./public
          cname: docs.bhodl.app
```

## Versioning Strategy

For each release, archive docs:

```
/                            # latest stable
/v0.1.0/                      # historical
/v0.2.0/
/dev/                         # rolling main branch
```

Use `mike` (mkdocs versioning) or roll-your-own with workflow that copies to versioned subdir.

For Rust: docs.rs handles this automatically per crate version.

For Kotlin: Dokka's `moduleVersion` parameter sets version label; archive output dirs.

## Custom Branding

mdBook theme override:

```
docs/theme/
├── index.hbs                 # custom HTML template
├── bhodl.css                 # custom CSS
└── favicon.svg
```

```toml
[output.html]
theme = "theme"
preferred-dark-theme = "ayu"
additional-css = ["theme/bhodl.css"]
```

## Inline Doc Linting

For consistent doc style, integrate with linters:

```toml
# Cargo.toml
[lints.rust]
missing_docs = "warn"

[lints.rustdoc]
broken_intra_doc_links = "deny"
private_doc_tests = "warn"
```

```kotlin
// detekt.yml
documentation:
  CommentOverPrivateFunction: { active: true }
  EndOfSentenceFormat: { active: true }
  UndocumentedPublicClass: { active: true, searchInNestedClass: true }
  UndocumentedPublicFunction: { active: true }
  UndocumentedPublicProperty: { active: true }
```

## Anti-Patterns

| Anti-pattern | Why it's bad | Correct approach |
|---|---|---|
| Manual `docs/api/` HTML files | Drift with code | Auto-generate from comments |
| `pub fn foo() -> u32` with no docs | Silent acceptance | Enable `missing_docs` lint |
| Code blocks in docs that don't compile | Outdated examples | Use `cargo test --doc` and Dokka samples |
| Mixing language tutorials in API docs | Confusing | mdBook for prose, rustdoc/Dokka for API |
| One huge `README.md` for everything | Unsearchable | Split into mdBook chapters |
| No search in docs site | Hard to navigate | Enable `[output.html.search] enable = true` |
| Hardcoded version in docs | Goes stale | Use template substitution via mdBook preprocessors |
| Skipping linkcheck | Dead links accumulate | `mdbook-linkcheck` in CI |
| Hosting docs but no `cname` | URL changes | Set custom domain |
| No `edit on GitHub` link | Can't fix typos easily | Configure `edit-url-template` |
| API docs without examples | Hard to onboard | Always include `# Example` blocks |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `mdbook serve` not refreshing | Plugin caching | Restart, check plugin output |
| `cargo doc` slow | Recompiling deps | Use `--no-deps` for dev |
| Dokka memory error | Large multimodule | Increase Gradle heap (`-Xmx4g`) |
| Doc links broken in rustdoc | Wrong syntax | Use `[Wallet]` for intra-doc, full URL for external |
| Showkase shows empty browser | KSP not running | Verify `ksp` config |
| Mermaid diagrams not rendering | Plugin not enabled | `[preprocessor.mermaid]` config + `cargo install mdbook-mermaid` |
| GitHub Pages 404 after deploy | `_config.yml` missing | Add `theme: jekyll-theme-cayman` or use `.nojekyll` to bypass Jekyll |
| Dokka multiplatform source sets missing | Wrong source set name | Match Gradle sourceSet name exactly |
| Custom CSS not loading | Path wrong | mdBook resolves relative to `book.toml` dir |
| `cargo doc` warns about broken intra-doc | Bad link syntax | Use `[Wallet]` or `[crate::Wallet]` |

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| Inline doc syntax | Language-specific (rustdoc / KDoc / TSDoc skills) |
| README authoring | Generic markdown |
| Sphinx (Python) | Python docs skill |
| TypeDoc (TypeScript) | `documentation/typedoc` |
| API design (OpenAPI) | `api-design/openapi` |
| Storybook (React/Vue) | Storybook docs |
