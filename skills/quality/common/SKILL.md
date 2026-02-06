---
name: quality-common
description: |
  Universal code quality principles applicable to all languages.
  Covers Clean Code, SOLID, complexity metrics, and quality standards.

  USE WHEN: user mentions "clean code", "SOLID", "code smells", "refactoring", "complexity", asks about "cyclomatic complexity", "cognitive complexity", "code review", "maintainability"

  DO NOT USE FOR: language-specific linting - use ESLint/Biome skills, security - use OWASP skills, testing - use testing skills
allowed-tools: Read, Grep, Glob
---

# Universal Code Quality Principles

## When NOT to Use This Skill
- **Language-specific rules** - Use TypeScript/Java/Python skills for syntax/idioms
- **Security issues** - Use `owasp-top-10` for vulnerabilities
- **Testing strategies** - Use Vitest/Playwright skills for test quality
- **Linting configuration** - Use ESLint/Biome skills for tool setup

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `clean-code` for comprehensive documentation.

## Authoritative References

| Principle | Source | Link |
|-----------|--------|------|
| Clean Code | Robert C. Martin | [Clean Code Book](https://www.oreilly.com/library/view/clean-code-a/9780136083238/) |
| SOLID | Robert C. Martin | [SOLID Principles](https://blog.cleancoder.com/uncle-bob/2020/10/18/Solid-Relevance.html) |
| Refactoring | Martin Fowler | [Refactoring Catalog](https://refactoring.com/catalog/) |
| Cognitive Complexity | SonarSource | [Whitepaper (PDF)](https://www.sonarsource.com/docs/CognitiveComplexity.pdf) |

---

## Clean Code Principles

### Naming
- **Intention-revealing**: Names should explain purpose
- **Pronounceable**: Avoid abbreviations
- **Searchable**: Avoid single letters except loops

### Functions
- **Small**: 20 lines max, ideally < 10
- **Single purpose**: Do one thing well
- **Few arguments**: 0-2 ideal, 3 max

### Comments
- **Code should be self-documenting**
- Comments explain "why", not "what"
- Avoid redundant comments

---

## SOLID Principles

| Principle | Description | Violation Sign |
|-----------|-------------|----------------|
| **S**ingle Responsibility | One reason to change | Class does too much |
| **O**pen/Closed | Open for extension, closed for modification | Switch statements on type |
| **L**iskov Substitution | Subtypes must be substitutable | Override throws exception |
| **I**nterface Segregation | Many specific interfaces | Unused interface methods |
| **D**ependency Inversion | Depend on abstractions | `new` in business logic |

---

## Code Metrics & Thresholds

### Complexity Metrics

| Metric | Description | Threshold | Tool |
|--------|-------------|-----------|------|
| **Cyclomatic Complexity** | Number of independent paths | < 10 | SonarQube, ESLint |
| **Cognitive Complexity** | How hard to understand | < 15 | SonarQube |
| **Lines per Function** | Function length | < 30 | All linters |
| **Parameters** | Function arguments | < 4 | All linters |
| **Nesting Depth** | If/loop nesting | < 4 | SonarQube |

### Quality Gates (SonarQube Standard)

| Metric | Condition | Target |
|--------|-----------|--------|
| Coverage | on new code | > 80% |
| Duplications | on new code | < 3% |
| Maintainability Rating | overall | A |
| Reliability Rating | overall | A |
| Security Rating | overall | A |

---

## Code Smells Categories

### Bloaters
- Long Method
- Large Class
- Long Parameter List
- Data Clumps

### Object-Orientation Abusers
- Switch Statements
- Refused Bequest
- Alternative Classes with Different Interfaces

### Change Preventers
- Divergent Change
- Shotgun Surgery
- Parallel Inheritance Hierarchies

### Dispensables
- Dead Code
- Duplicate Code
- Lazy Class
- Speculative Generality

### Couplers
- Feature Envy
- Inappropriate Intimacy
- Message Chains

---

## Refactoring Patterns

| Smell | Refactoring | Description |
|-------|-------------|-------------|
| Long Method | Extract Method | Break into smaller functions |
| Duplicate Code | Extract Method/Class | Create reusable unit |
| Long Parameter List | Introduce Parameter Object | Group related params |
| Switch on Type | Replace with Polymorphism | Use strategy pattern |
| Feature Envy | Move Method | Put behavior with data |
| God Class | Extract Class | Split responsibilities |

**Full Catalog:** https://refactoring.com/catalog/

---

## Quick Checklist

```markdown
## Code Review Checklist

### Readability
- [ ] Clear, intention-revealing names
- [ ] Functions are small and focused
- [ ] No magic numbers/strings
- [ ] Appropriate abstraction level

### Maintainability
- [ ] Single Responsibility followed
- [ ] No code duplication (DRY)
- [ ] Dependencies injected, not created
- [ ] Easy to test in isolation

### Reliability
- [ ] Edge cases handled
- [ ] Errors handled appropriately
- [ ] No null pointer risks
- [ ] Resources properly closed

### Performance
- [ ] No N+1 queries
- [ ] Appropriate data structures
- [ ] No premature optimization
- [ ] Caching where appropriate
```

---

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| God Class (1000+ lines) | Violates SRP, hard to test | Split into focused classes |
| Magic numbers everywhere | Unclear meaning, hard to change | Use named constants |
| Deep nesting (5+ levels) | Hard to understand | Extract methods, early returns |
| Long parameter lists (6+ params) | Hard to remember order | Use parameter objects/builders |
| Copy-paste programming | Duplication, maintenance nightmare | Extract shared logic to functions |
| No error handling | Silent failures | Explicit error handling with logging |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Function has complexity > 20 | Too many branches/loops | Extract sub-functions, use strategy pattern |
| Class over 500 lines | Multiple responsibilities | Apply SRP, split into multiple classes |
| Tests hard to write | Tight coupling, no DI | Use dependency injection |
| Same code in 3+ places | No abstraction | Extract to shared function/class |
| Function takes 10+ parameters | Poor abstraction | Create parameter object or builder |
| Code hard to understand | Poor naming, no abstraction | Refactor with intention-revealing names |

---

## Related Skills

- Language-specific rules: `languages/typescript`, `languages/java`, `languages/python`
- Security: `security/owasp-top-10`
- Design Patterns: `best-practices/design-patterns`
