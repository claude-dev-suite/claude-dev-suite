---
name: sonarqube
description: |
  SonarQube/SonarCloud integration for continuous code quality.
  Setup, configuration, quality gates, and CI/CD integration.

  USE WHEN: user mentions "SonarQube", "SonarCloud", "quality gates", asks about "code coverage", "technical debt", "code smells", "sonar-project.properties", "SonarScanner"

  DO NOT USE FOR: ESLint/Biome - use linting skills, OWASP security - use security skills, testing tools - use Vitest/Playwright skills
allowed-tools: Read, Grep, Glob
---

# SonarQube / SonarCloud

## When NOT to Use This Skill
- **JavaScript/TypeScript linting** - Use `eslint-biome` skill for faster feedback
- **Security scanning** - Use `owasp-top-10` or security-scanner MCP
- **Test execution** - Use Vitest/Playwright skills for running tests
- **Code coverage generation** - Use JaCoCo/Vitest skills for coverage

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `sonarqube` for comprehensive documentation.

## Official Documentation

| Resource | Link |
|----------|------|
| **SonarQube Docs** | https://docs.sonarsource.com/sonarqube/latest/ |
| **SonarCloud Docs** | https://docs.sonarsource.com/sonarcloud/ |
| **Rules Repository** | https://rules.sonarsource.com/ |
| **API Reference** | https://sonarcloud.io/web_api/ |

---

## Quick Setup

### SonarCloud (Recommended for Open Source)

```bash
# 1. Connect repo at sonarcloud.io
# 2. Create sonar-project.properties
```

```properties
# sonar-project.properties
sonar.projectKey=org_project
sonar.organization=your-org
sonar.sources=src
sonar.tests=tests
sonar.javascript.lcov.reportPaths=coverage/lcov.info
sonar.coverage.exclusions=**/*.test.ts,**/*.spec.ts
```

### SonarQube (Self-hosted)

```yaml
# docker-compose.yml
services:
  sonarqube:
    image: sonarqube:lts-community
    ports:
      - "9000:9000"
    environment:
      - SONAR_JDBC_URL=jdbc:postgresql://db:5432/sonar
    volumes:
      - sonarqube_data:/opt/sonarqube/data
```

---

## Quality Gates

### Default Quality Gate Conditions

| Metric | Condition | Target |
|--------|-----------|--------|
| Coverage | on new code | ≥ 80% |
| Duplicated Lines | on new code | ≤ 3% |
| Maintainability Rating | on new code | A |
| Reliability Rating | on new code | A |
| Security Rating | on new code | A |
| Security Hotspots Reviewed | on new code | 100% |

### Custom Quality Gate

```bash
# Create via API
curl -X POST "https://sonarcloud.io/api/qualitygates/create" \
  -H "Authorization: Bearer $SONAR_TOKEN" \
  -d "name=Strict"
```

---

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/sonar.yml
name: SonarCloud
on: [push, pull_request]

jobs:
  sonarcloud:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: SonarCloud Scan
        uses: SonarSource/sonarcloud-github-action@master
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
```

### Maven (Java)

```xml
<!-- pom.xml -->
<plugin>
    <groupId>org.sonarsource.scanner.maven</groupId>
    <artifactId>sonar-maven-plugin</artifactId>
    <version>3.10.0.2594</version>
</plugin>
```

```bash
mvn sonar:sonar \
  -Dsonar.projectKey=project \
  -Dsonar.host.url=https://sonarcloud.io \
  -Dsonar.token=$SONAR_TOKEN
```

---

## Key Metrics

| Metric | Description | Good Value |
|--------|-------------|------------|
| **Bugs** | Reliability issues | 0 |
| **Vulnerabilities** | Security issues | 0 |
| **Code Smells** | Maintainability issues | Minimize |
| **Coverage** | Test coverage % | > 80% |
| **Duplications** | Duplicated code % | < 3% |
| **Cognitive Complexity** | Code understandability | < 15/function |

---

## Language-Specific Rules

| Language | Rules | Link |
|----------|-------|------|
| JavaScript/TS | 422 | https://rules.sonarsource.com/javascript/ |
| Java | 733 | https://rules.sonarsource.com/java/ |
| Python | 300+ | https://rules.sonarsource.com/python/ |
| C# | 400+ | https://rules.sonarsource.com/csharp/ |
| Go | 100+ | https://rules.sonarsource.com/go/ |

---

## Excluding Files

```properties
# sonar-project.properties
sonar.exclusions=**/node_modules/**,**/dist/**,**/*.test.ts
sonar.coverage.exclusions=**/tests/**,**/__mocks__/**
sonar.cpd.exclusions=**/generated/**
```

---

## API Examples

```bash
# Get project status
curl "https://sonarcloud.io/api/qualitygates/project_status?projectKey=KEY" \
  -H "Authorization: Bearer $SONAR_TOKEN"

# Get issues
curl "https://sonarcloud.io/api/issues/search?componentKeys=KEY&types=BUG" \
  -H "Authorization: Bearer $SONAR_TOKEN"

# Get metrics
curl "https://sonarcloud.io/api/measures/component?component=KEY&metricKeys=coverage,bugs,vulnerabilities" \
  -H "Authorization: Bearer $SONAR_TOKEN"
```

---

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| No quality gate on PRs | Merging bad code | Enable PR decoration, block on failure |
| Excluding all tests from coverage | Inflated coverage numbers | Only exclude test utilities |
| Ignoring code smells | Technical debt accumulates | Fix or justify with comments |
| No coverage reporting | Can't track quality trends | Configure coverage reports in CI |
| Using default quality gate | Too lenient for most projects | Create custom stricter gate |
| Not reviewing Security Hotspots | Potential vulnerabilities missed | Review all hotspots before release |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Quality gate failed unexpectedly | New code coverage < 80% | Add tests or adjust coverage target |
| Analysis not running | Missing SONAR_TOKEN | Add token to CI secrets |
| Coverage always 0% | Wrong report path | Check `sonar.javascript.lcov.reportPaths` |
| Duplicated code false positives | Boilerplate code | Add to `sonar.cpd.exclusions` |
| Too many issues reported | First scan on legacy code | Use "New Code" focus, fix incrementally |
| PR decoration not working | Missing GitHub App integration | Configure SonarCloud GitHub App |

---

## Related Skills
- [Quality Principles](../common/SKILL.md)
- [GitHub Actions](../../ci-cd/github-actions/SKILL.md)
- [JaCoCo](../jacoco/SKILL.md)
