# Code signing policy

> **Status:** application to the SignPath Foundation open-source program in preparation. Until it is approved,
> the installers are **unsigned** and this page describes the policy the signed builds will follow. When the
> first signed release ships, the attribution line below goes live and this note is removed.

<!-- On approval, replace the status note with:
Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by
[SignPath Foundation](https://signpath.org/).
-->

## What is signed

Only the **Windows installer** (`Dev-Suite.Dashboard.Setup.<version>.exe`, and its fixed-name copy
`dev-suite-windows-x64-setup.exe`) published on
[GitHub Releases](https://github.com/claude-dev-suite/claude-dev-suite/releases). The macOS and Linux builds
are not signed.

Every signed binary is built by the [`Release` workflow](../.github/workflows/release.yml) on GitHub-hosted
runners, from a tagged commit of this repository, and from this repository's source only. No binary built on a
developer machine is ever submitted for signing.

## Team roles

| Role | Members |
|------|---------|
| Committers and reviewers | [@claude-dev-suite](https://github.com/claude-dev-suite) |
| Approvers | [@claude-dev-suite](https://github.com/claude-dev-suite) |

- **Committers** may change the source without an additional review.
- **Reviewers** review every change from a contributor who is not a committer before it is merged. `main` is
  protected by a ruleset: changes arrive through pull requests that must pass CI (`build-and-test`) and CodeQL
  code scanning. The two exceptions are the repository admin, who can bypass the ruleset, and the weekly
  [`metrics` workflow](../.github/workflows/metrics.yml), which commits traffic data files to `docs/metrics/`
  and nothing else.
- **Approvers** approve each signing request, after checking that it comes from the `Release` workflow for a
  tag on `main`.

Every member is required to use multi-factor authentication on GitHub and on SignPath.

## Privacy policy

This program will not transfer any information to other networked systems unless specifically requested by
the user or the person installing or operating it, with these exceptions, which carry no personal data and no
project content:

- **Update check.** The desktop app asks GitHub Releases
  (`github.com/claude-dev-suite/claude-dev-suite`) whether a newer version exists, shortly after start and
  periodically while it runs. It sends nothing beyond the HTTP request itself. A newer version is downloaded
  only when the user clicks to download it.

Everything else happens only on the user's request:

- **Anthropic API** — code review, workflows and code generation run the model with the credential the user
  entered; the usage panel reads the user's own Anthropic Admin API.
- **Git** — clone, fetch and push to the remotes the user configured.
- **MCP servers installed into a project** run under the user's AI assistant, not under this app. The
  documentation server fetches the public knowledge base from
  `github.com/claude-dev-suite/knowledge_base` when the assistant calls it.

The app keeps its settings and credentials on the user's machine under `~/.dev-suite/`, and its logs there too
(under `%APPDATA%\@dev-suite\` on Windows), and sends them nowhere.
