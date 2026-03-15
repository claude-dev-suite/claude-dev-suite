# Metrics and Inclusivity Quick Reference

> **Knowledge Base:** Read `knowledge/best-practices/open-source/metrics-inclusivity.md` for complete documentation.

## CHAOSS Metrics

[CHAOSS](https://chaoss.community/) (Community Health Analytics in Open Source Software) defines standardized metrics for open source community health.

### Metric Categories

| Category | Focus | Key Metrics |
|----------|-------|-------------|
| **Community Activity** | Volume and velocity of contributions | Commits, PRs, issues, review cycles |
| **Community Diversity** | Representation across organizations | Org diversity, geo distribution |
| **Community Inclusiveness** | Welcoming environment | Response time, mentorship, onboarding |
| **Evolution** | Growth and sustainability | New contributors, retention, bus factor |

### Key Metrics

#### Community Activity
| Metric | Description | How to Measure |
|--------|-------------|----------------|
| **Active Contributors** | People who contributed in last 90 days | `git shortlog --since="90 days ago" -sn` |
| **Commit Frequency** | Commits per week/month | Git log analysis |
| **PR Merge Rate** | Percentage of PRs merged vs opened | GitHub API |
| **PR Review Time** | Time from PR open to first review | GitHub API |
| **Issue Response Time** | Time from issue open to first comment | GitHub API |
| **Issue Close Rate** | Percentage of issues resolved | GitHub API |
| **Release Cadence** | Frequency of releases | GitHub Releases |

#### Community Diversity
| Metric | Description | Target |
|--------|-------------|--------|
| **Organizational Diversity** | Contributors from different orgs | 3+ organizations |
| **Geographic Distribution** | Contributors from different regions | Multiple timezones |
| **Contributor Demographics** | New vs returning contributors | Healthy mix |
| **Bus Factor** | People contributing to 50%+ of code | 3+ |

#### Community Inclusiveness
| Metric | Description | Target |
|--------|-------------|--------|
| **First Response Time** | Time to first response on issues | Less than 48 hours |
| **Newcomer PR Merge Rate** | First-time contributor PR success rate | More than 50% |
| **Good First Issues** | Available starter issues | 5+ at all times |
| **Documentation Quality** | Completeness and clarity | Up to date |
| **Code of Conduct** | Enforcement actions taken | Documented process |

### Tools for Measuring

| Tool | Type | Description |
|------|------|-------------|
| **GrimoireLab** | Self-hosted | Full CHAOSS implementation, dashboards |
| **Augur** | Self-hosted | CHAOSS metrics, ML-powered insights |
| **Cauldron.io** | SaaS | Free for open source, CHAOSS metrics |
| **DevStats** | Self-hosted | CNCF project analytics |
| **GitHub Insights** | Built-in | Basic contributor and traffic stats |
| **OSS Insight** | SaaS | GitHub data analysis, comparisons |
| **Orbit** | SaaS | Community management platform |

### GrimoireLab Quick Start
```bash
# Using Docker
docker-compose -f docker-compose.yml up -d

# Configuration (projects.json)
{
  "my-project": {
    "git": ["https://github.com/org/repo.git"],
    "github": ["org/repo"],
    "github:issue": ["org/repo"],
    "github:pull": ["org/repo"]
  }
}
```

## Bus Factor (Contributor Absence Factor)

### How to Calculate
```bash
# Simple bus factor calculation
# Count authors contributing to 50%+ of files
git log --format='%aN' --since="1 year ago" | sort | uniq -c | sort -rn

# More precise: use git-fame
pip install git-fame
git-fame --sort=loc --excl="*.lock,dist/*" .
```

### Improvement Strategies

| Strategy | Impact | Effort |
|----------|--------|--------|
| Document all processes and decisions | High | Medium |
| Pair programming / code reviews | High | Ongoing |
| Rotate responsibilities (releases, triage) | High | Low |
| Onboard new maintainers actively | High | High |
| Write ADRs for architectural decisions | Medium | Low |
| Cross-train on critical subsystems | High | Medium |
| Share access credentials (npm, domain, CI) | Critical | One-time |
| Automate manual processes | High | Medium |

### Bus Factor Assessment

| Bus Factor | Risk Level | Action |
|------------|-----------|--------|
| 1 | Critical | Immediately recruit and train backup maintainers |
| 2 | High | Actively work on knowledge sharing |
| 3-4 | Medium | Maintain documentation and cross-training |
| 5+ | Low | Continue good practices |

## Inclusive Language

### Terms to Avoid and Replacements

| Avoid | Use Instead | Context |
|-------|------------|---------|
| master/slave | primary/replica, leader/follower, main/secondary | Database, architecture |
| master branch | main, trunk, default | Git |
| whitelist/blacklist | allowlist/denylist, permit/block | Access control |
| sanity check | validation, confidence check, coherence check | Testing |
| dummy value | placeholder, sample, example | Code |
| grandfathered | legacy, exempted, pre-existing | Policy |
| man-hours | person-hours, engineer-hours | Estimation |
| guys | folks, everyone, team, y'all | Communication |

### Git Configuration for Inclusive Defaults
```bash
# Set default branch name to 'main'
git config --global init.defaultBranch main

# Rename existing master to main
git branch -m master main
git push -u origin main
# Update default branch in GitHub settings
```

### Inclusive Documentation Practices
- Use gender-neutral pronouns (they/them or "the user")
- Avoid cultural idioms that may not translate
- Provide alt text for images
- Use clear, simple language
- Define acronyms on first use
- Use descriptive link text (not "click here")

## Documentation Accessibility

### Writing Accessible Documentation
- Use proper heading hierarchy (h1 > h2 > h3, no skipping)
- Add alt text to all images: `![Description of image](image.png)`
- Use descriptive link text: `[Contributing guide](CONTRIBUTING.md)` not `[Click here](CONTRIBUTING.md)`
- Provide text alternatives for diagrams (use Mermaid for accessible diagrams)
- Ensure sufficient color contrast in diagrams
- Use tables with headers for tabular data
- Keep line length under 120 characters for readability

### README Accessibility Checklist
- [ ] All images have alt text
- [ ] Links have descriptive text
- [ ] Headings follow hierarchy
- [ ] Code blocks have language identifiers
- [ ] No information conveyed by color alone
- [ ] Complex diagrams have text descriptions

## Multilingual Support

### Strategies for Multilingual Docs

| Approach | Complexity | Best For |
|----------|-----------|----------|
| **Separate folders** (`docs/en/`, `docs/es/`) | Low | Static sites |
| **i18n framework** (Docusaurus i18n) | Medium | Large doc sites |
| **Community translations** (Crowdin, Transifex) | Medium | Community-driven |
| **README translations** (`README.es.md`, `README.ja.md`) | Low | READMEs only |

### Docusaurus i18n Setup
```bash
# Configure in docusaurus.config.js
module.exports = {
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es', 'ja', 'zh-CN'],
  },
};

# Generate translation files
npx docusaurus write-translations --locale es
```

### README Translation Convention
```
README.md          (English - primary)
README.es.md       (Spanish)
README.ja.md       (Japanese)
README.zh-CN.md    (Simplified Chinese)
README.ko.md       (Korean)
README.pt-BR.md    (Brazilian Portuguese)
```

Add language links at top of README:
```markdown
[English](README.md) | [Espanol](README.es.md) | [Japanese](README.ja.md) | [Chinese](README.zh-CN.md)
```

## GitHub Features for Open Source

### GitHub Discussions
- Enable: Settings > Features > Discussions
- Categories: Announcements, General, Ideas, Q&A, Show and Tell
- Pin important discussions
- Convert issues to discussions when appropriate

### GitHub Pages
```yaml
# .github/workflows/pages.yml
name: Deploy Docs

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  deploy:
    environment:
      name: github-pages
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci && npm run build:docs
      - uses: actions/upload-pages-artifact@v3
        with:
          path: docs/build
      - uses: actions/deploy-pages@v4
```

### GitHub Environments
- Use for deployment approvals (staging, production)
- Set environment-specific secrets
- Configure required reviewers for production deployments
- Set wait timers between environments

## Shields.io Badge Best Practices

### Essential Badges (in order)
```markdown
<!-- Build Status -->
[![CI](https://github.com/ORG/REPO/actions/workflows/ci.yml/badge.svg)](...)

<!-- Version -->
[![npm](https://img.shields.io/npm/v/PACKAGE)](https://www.npmjs.com/package/PACKAGE)

<!-- License -->
[![License](https://img.shields.io/github/license/ORG/REPO)](LICENSE)

<!-- Coverage -->
[![codecov](https://codecov.io/gh/ORG/REPO/graph/badge.svg)](https://codecov.io/gh/ORG/REPO)

<!-- Downloads -->
[![Downloads](https://img.shields.io/npm/dm/PACKAGE)](https://www.npmjs.com/package/PACKAGE)

<!-- Security -->
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/ORG/REPO/badge)](...)

<!-- Community -->
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![All Contributors](https://img.shields.io/github/all-contributors/ORG/REPO)](README.md)
```

### Custom Badges
```markdown
<!-- Static badge -->
[![Custom](https://img.shields.io/badge/Label-Message-Color)]()

<!-- Dynamic badge from JSON endpoint -->
[![Dynamic](https://img.shields.io/badge/dynamic/json?url=URL&query=JSONPATH&label=LABEL)]()
```

### Badge Ordering Convention
1. CI/Build status
2. Version/Release
3. License
4. Code coverage
5. Downloads/Popularity
6. Security/Quality
7. Community (PRs welcome, all-contributors)
8. Other (chat, docs)

> **Tip**: Keep badges on one or two lines. Too many badges create visual noise. Focus on the most informative ones for your project.
