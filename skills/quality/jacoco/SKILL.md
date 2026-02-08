---
name: jacoco
description: |
  JaCoCo Java code coverage tool

  USE WHEN: user mentions "JaCoCo", "Java coverage", "code coverage", asks about "coverage threshold", "jacoco-maven-plugin", "coverage report", "LINE coverage", "BRANCH coverage"

  DO NOT USE FOR: JavaScript/TypeScript coverage - use Vitest skill, SonarQube analysis - use `sonarqube` skill, test execution - use testing skills
allowed-tools: Read, Grep, Glob
---
# JaCoCo - Quick Reference

## When to Use This Skill
- Configure code coverage in Java/Maven projects
- Set coverage thresholds
- Integrate coverage in CI/CD

## When NOT to Use This Skill
- **JavaScript/TypeScript coverage** - Use Vitest skill for frontend coverage
- **SonarQube configuration** - Use `sonarqube` skill for quality gates
- **Test writing** - Use Spring Boot Test or JUnit skills
- **Gradle projects** - JaCoCo works but syntax differs from Maven

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `jacoco` for comprehensive documentation.

## Essential Patterns

### Maven Configuration
```xml
<plugin>
    <groupId>org.jacoco</groupId>
    <artifactId>jacoco-maven-plugin</artifactId>
    <version>0.8.12</version>
    <executions>
        <execution>
            <id>prepare-agent</id>
            <goals><goal>prepare-agent</goal></goals>
        </execution>
        <execution>
            <id>report</id>
            <phase>test</phase>
            <goals><goal>report</goal></goals>
        </execution>
        <execution>
            <id>check</id>
            <goals><goal>check</goal></goals>
            <configuration>
                <rules>
                    <rule>
                        <element>BUNDLE</element>
                        <limits>
                            <limit>
                                <counter>LINE</counter>
                                <value>COVEREDRATIO</value>
                                <minimum>0.80</minimum>
                            </limit>
                        </limits>
                    </rule>
                </rules>
            </configuration>
        </execution>
    </executions>
</plugin>
```

### Exclusions
```xml
<excludes>
    <exclude>com.company.config.*</exclude>
    <exclude>com.company.dto.*</exclude>
    <exclude>com.company.entity.*</exclude>
    <exclude>com.company.mapper.*Impl</exclude>
</excludes>
```

### Commands
```bash
mvn clean verify           # Test + coverage check
mvn jacoco:report          # Generate report
open target/site/jacoco/index.html  # View report
```

## Counter Types
| Counter | Description |
|---------|-------------|
| `LINE` | Lines of code |
| `BRANCH` | Branch if/switch |
| `METHOD` | Methods |

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Aiming for 100% coverage | Diminishing returns, test bloat | Target 80% LINE, 70% BRANCH |
| Including DTOs/entities in coverage | Inflates numbers, no logic to test | Exclude with `<excludes>` |
| Only checking LINE coverage | Misses untested branches | Check both LINE and BRANCH |
| No coverage threshold in CI | Can't enforce quality | Add `<check>` goal with minimums |
| Excluding too much code | False sense of security | Only exclude generated/config code |
| Not versioning jacoco.exec | Can't track coverage trends | Archive reports in CI |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Coverage report shows 0% | Tests not running with agent | Ensure `prepare-agent` goal runs before tests |
| Build fails on coverage check | Coverage below threshold | Add tests or adjust minimum in `<limit>` |
| Report excludes nothing | Wrong exclude pattern | Use fully qualified names (com.company.dto.*) |
| Report missing classes | Classes not loaded during tests | Add integration tests to cover them |
| Coverage lower in CI than local | Different test execution | Ensure CI runs all test phases |
| SonarQube shows no coverage | Wrong report path | Check `sonar.coverage.jacoco.xmlReportPaths` |

## Further Reading
> For advanced configurations: `mcp__documentation__fetch_docs`
> - Technology: `jacoco` (not yet in MCP - use official docs)
> - [JaCoCo Docs](https://www.jacoco.org/jacoco/trunk/doc/)
