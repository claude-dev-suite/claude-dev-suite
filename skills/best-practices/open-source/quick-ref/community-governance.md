# Community and Governance Quick Reference

> **Knowledge Base:** Read `knowledge/best-practices/open-source/community-governance.md` for complete documentation.

## Governance Models

| Model | Decision Making | Example Projects | Best For |
|-------|----------------|-----------------|----------|
| **BDFL** | Single person decides | Python (historically), Linux | Small projects, clear vision |
| **Meritocracy** | Earned authority via contributions | Apache projects | Established projects |
| **Liberal Contribution** | Anyone with access can merge | Node.js | Fast-moving projects |
| **Steering Committee** | Elected/appointed group | Kubernetes, Rust | Large ecosystems |
| **Foundation-Backed** | Foundation governance | CNCF, Apache, Linux Foundation | Enterprise-critical projects |

### Governance Model Decision

```
Project size?
 - Solo/small team -> BDFL (simple, fast decisions)
 - Growing community -> Liberal Contribution or Meritocracy
 - Large ecosystem -> Steering Committee
 - Enterprise-critical -> Foundation-Backed
```

## GOVERNANCE.md Template

```markdown
# Governance

## Overview

[Project Name] is governed by a [model] governance model.

## Roles

### Users
- Use the project
- Report issues
- Participate in discussions

### Contributors
- Submit pull requests
- Review code
- Help with documentation
- Requirements: signed DCO/CLA

### Committers
- Merge pull requests
- Triage issues
- Guide contributors
- Requirements: sustained contributions over [X months], nominated by existing committer

### Maintainers
- Set project direction
- Make architectural decisions
- Manage releases
- Grant/revoke committer access
- Requirements: significant long-term contributions, nominated by maintainers

## Decision Process

1. **Lazy Consensus**: Most decisions are made by lazy consensus. A proposal is
   posted and, if no one objects within 72 hours, it is accepted.

2. **Voting**: For significant decisions, a vote is called. Maintainers have
   binding votes. A simple majority is required.

3. **Conflict Resolution**: If consensus cannot be reached, the project lead
   (or steering committee) makes the final decision.

## Becoming a Committer

1. Make sustained, quality contributions over at least 3 months
2. Demonstrate understanding of project goals and standards
3. Be nominated by an existing committer
4. Receive approval from majority of maintainers

## Code of Conduct

All participants must follow our [Code of Conduct](CODE_OF_CONDUCT.md).
```

## Contributor to Maintainer Path

```
1. User
   - Uses the project
   - Reports issues

2. Contributor
   - First PR merged
   - Added to all-contributors
   - Gets "contributor" label

3. Regular Contributor
   - 5+ PRs merged
   - Helps in issues/discussions
   - Reviews other PRs

4. Triage Member
   - Can label/close issues
   - Can request reviews
   - Added to triage team on GitHub

5. Committer
   - Can merge PRs
   - Can create releases
   - Added to committers team

6. Maintainer
   - Sets project direction
   - Makes architectural decisions
   - Manages community
```

## Maintainer Guidelines

### Do
- Respond to issues within 48 hours (even if just to acknowledge)
- Be kind and constructive in reviews
- Document decisions via ADRs
- Mentor new contributors
- Share the workload (avoid single points of failure)
- Take breaks (announce planned absences)

### Do Not
- Merge your own PRs without review (except trivial fixes)
- Make breaking changes without discussion
- Ignore community feedback
- Gate-keep unnecessarily

### Maintainer Burnout Prevention
- Rotate on-call/triage responsibilities
- Set clear boundaries on response times
- Use bots for repetitive tasks (stale, welcome, labeling)
- Celebrate contributions and milestones
- Have at least 2-3 active maintainers

## Bus Factor

The **bus factor** is the number of people who would need to be unavailable before a project stalls.

### Measuring Bus Factor
```
Bus Factor = number of people who contribute to 50%+ of the codebase
```

### How to Improve

| Strategy | Description |
|----------|-------------|
| **Document everything** | Architecture decisions, processes, runbooks |
| **Shared access** | npm/PyPI publish rights, domain access, CI secrets |
| **Cross-training** | Multiple people understand each area |
| **Succession plan** | Named backup maintainers for key areas |
| **Automated releases** | Remove dependency on one person for releases |
| **CODEOWNERS** | Assign multiple owners per path |

## Communication Channels

| Channel | Best For | Tools |
|---------|----------|-------|
| **GitHub Issues** | Bug reports, feature requests | GitHub |
| **GitHub Discussions** | Q&A, ideas, community chat | GitHub |
| **Discord** | Real-time chat, community building | Discord |
| **Slack** | Team collaboration | Slack |
| **Mailing List** | Formal proposals, announcements | Google Groups, Mailman |
| **Blog** | Announcements, tutorials | GitHub Pages, Dev.to |
| **Twitter/X** | Announcements, engagement | Twitter |

### GitHub Discussions Setup
```
Categories:
- Announcements (maintainers only)
- General (open)
- Ideas (feature proposals)
- Q&A (questions and answers)
- Show and Tell (community projects)
```

## All-Contributors Specification

### Setup
```bash
npx all-contributors-cli init
```

### Configuration (`.all-contributorsrc`)
```json
{
  "projectName": "my-project",
  "projectOwner": "org",
  "repoType": "github",
  "repoHost": "https://github.com",
  "files": ["README.md"],
  "imageSize": 80,
  "commit": true,
  "commitConvention": "angular",
  "contributors": [],
  "contributorsPerLine": 7
}
```

### Add Contributors
```bash
# Add a contributor
npx all-contributors add @username code,doc,test

# Generate contributors table
npx all-contributors generate
```

### Contribution Types (33 types)

| Emoji | Type | Description |
|-------|------|-------------|
| `code` | Code | Source code contributions |
| `doc` | Documentation | Documentation writing |
| `test` | Tests | Writing tests |
| `bug` | Bug Reports | Reporting issues |
| `ideas` | Ideas | Feature suggestions |
| `review` | Review | Reviewing PRs |
| `design` | Design | Visual/UX design |
| `infra` | Infrastructure | CI/CD, DevOps |
| `translation` | Translation | Internationalization |
| `question` | Answering Questions | Community support |
| `tutorial` | Tutorials | Writing tutorials |
| `maintenance` | Maintenance | Repository maintenance |
| `platform` | Platform | Packaging, porting |
| `security` | Reporting Issues | Responsible disclosure |
| `financial` | Financial | Sponsorship |
| `example` | Examples | Code examples |
| `tool` | Tools | Developer tools |
| `content` | Content | Blog posts, talks |
| `a11y` | Accessibility | Accessibility improvements |
| `data` | Data | Contributing data |
| `mentoring` | Mentoring | Mentoring contributors |
| `projectManagement` | Project Management | Managing the project |
| `research` | Research | Academic research |
| `userTesting` | User Testing | Testing as a user |
| `video` | Video | Video content |
| `audio` | Audio | Podcasts, recordings |

### GitHub Action for All-Contributors Bot
```yaml
name: All Contributors
on:
  issue_comment:
    types: [created]
jobs:
  add-contributor:
    if: contains(github.event.comment.body, '@all-contributors')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: all-contributors/add-action@v1
        with:
          repo-token: ${{ secrets.GITHUB_TOKEN }}
```

## Community Health Indicators

| Indicator | Healthy | Warning | Concerning |
|-----------|---------|---------|-----------|
| Issue response time | < 48h | 1-2 weeks | > 1 month |
| PR merge time | < 1 week | 2-4 weeks | > 1 month |
| Open issues trend | Stable/decreasing | Slowly growing | Growing fast |
| New contributors/month | Growing | Stable | Declining |
| Bus factor | 3+ | 2 | 1 |
| Docs freshness | Updated with releases | Quarterly updates | Outdated |
| Release cadence | Regular | Irregular | Stalled |

### GitHub Community Profile
GitHub automatically checks for:
- README
- CODE_OF_CONDUCT
- CONTRIBUTING
- LICENSE
- Issue templates
- PR template
- SECURITY policy

View at: `https://github.com/ORG/REPO/community`
