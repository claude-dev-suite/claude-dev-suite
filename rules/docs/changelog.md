---
id: changelog
name: Changelog Maintenance
description: Every meaningful change gets a [Unreleased] entry in CHANGELOG.md before it is considered done
category: docs
recommended: true
---

# Changelog Maintenance

This project maintains a `CHANGELOG.md` following [Keep a Changelog](https://keepachangelog.com/).

**Rules:**
- Every feature, bug fix, or breaking change must have an entry under `## [Unreleased]` before it is considered complete
- Use subsections: `### Added`, `### Fixed`, `### Changed`, `### Removed`, `### Security`
- Write entries for humans, not machines — describe the impact, not the implementation detail
- At release time: rename `[Unreleased]` to `[x.y.z] - YYYY-MM-DD` and add a new blank `[Unreleased]` above it
- If the project has no CHANGELOG yet, create one before the next meaningful commit
