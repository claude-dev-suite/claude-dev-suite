---
name: solid-principles
description: |
  SOLID design principles. Covers SRP, OCP, LSP, ISP, DIP.
  Use when designing classes and modules.

  USE WHEN: user mentions "SOLID", "single responsibility", "open closed", "Liskov", "interface segregation",
  "dependency inversion", "dependency injection", asks about "class design", "OOP principles",
  "extensibility", "abstraction", "how to design classes"

  DO NOT USE FOR: General code quality - use `clean-code` instead,
  Specific patterns - use design patterns skills,
  Language-specific OOP - use framework-specific skills
allowed-tools: Read, Grep, Glob
---

# SOLID Principles

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `solid-principles` for comprehensive documentation.

## When NOT to Use This Skill

This skill focuses on OOP design principles. Do NOT use for:

- **Functional programming** - SOLID is primarily for OOP, use FP-specific patterns instead
- **Simple scripts/utilities** - SOLID adds complexity; use for larger systems
- **Performance-critical code** - Abstraction overhead may impact performance
- **General code quality** - Use `clean-code` skill for naming, functions, readability

## Anti-Patterns

| Anti-Pattern | Violated Principle | Solution |
|--------------|-------------------|----------|
| **God Class** | SRP | Split into focused classes with single responsibility |
| **Switch on Type** | OCP | Use polymorphism and strategy pattern |
| **Throwing in Subclass** | LSP | Ensure subclasses honor base class contract |
| **Fat Interface** | ISP | Split into smaller, role-specific interfaces |
| **new Keyword Everywhere** | DIP | Use dependency injection, depend on abstractions |
| **Fragile Base Class** | LSP, OCP | Prefer composition over inheritance |
| **Marker Interface** | ISP | Use proper abstractions with meaningful methods |

## Quick Troubleshooting

| Issue | Principle | Fix |
|-------|-----------|-----|
| **Class changing for multiple reasons** | SRP | Extract separate classes for each responsibility |
| **Must modify class to add feature** | OCP | Make class extensible via interfaces/abstractions |
| **Subclass breaks parent's tests** | LSP | Ensure subclass can substitute parent without issues |
| **Implementing empty methods** | ISP | Split interface into smaller, focused interfaces |
| **Hard to test due to concrete deps** | DIP | Inject dependencies through interfaces |
| **Can't swap implementations** | DIP | Depend on abstractions, not concretions |

## S - Single Responsibility

```typescript
// ❌ Bad - Multiple responsibilities
class User {
  save() { /* database logic */ }
  sendEmail() { /* email logic */ }
  generateReport() { /* report logic */ }
}

// ✅ Good - Single responsibility each
class User { /* user data only */ }
class UserRepository { save(user: User) { } }
class EmailService { send(to: string, message: string) { } }
class ReportGenerator { generate(user: User) { } }
```

## O - Open/Closed

```typescript
// ❌ Bad - Modify class to add new payment
class PaymentProcessor {
  process(payment: Payment) {
    if (payment.type === 'credit') { /* ... */ }
    else if (payment.type === 'paypal') { /* ... */ }
    // Must modify to add new type
  }
}

// ✅ Good - Extend without modification
interface PaymentMethod {
  process(amount: number): Promise<void>;
}

class CreditCardPayment implements PaymentMethod { }
class PayPalPayment implements PaymentMethod { }
class CryptoPayment implements PaymentMethod { } // New, no changes needed
```

## L - Liskov Substitution

```typescript
// ❌ Bad - Square can't substitute Rectangle
class Rectangle {
  setWidth(w: number) { this.width = w; }
  setHeight(h: number) { this.height = h; }
}
class Square extends Rectangle {
  setWidth(w: number) { this.width = this.height = w; } // Breaks expectation
}

// ✅ Good - Use composition or separate abstractions
interface Shape {
  getArea(): number;
}
class Rectangle implements Shape { }
class Square implements Shape { }
```

## I - Interface Segregation

```typescript
// ❌ Bad - Fat interface
interface Worker {
  work(): void;
  eat(): void;
  sleep(): void;
}
class Robot implements Worker {
  eat() { throw new Error('Robots dont eat'); } // Forced to implement
}

// ✅ Good - Segregated interfaces
interface Workable { work(): void; }
interface Eatable { eat(): void; }
interface Sleepable { sleep(): void; }

class Human implements Workable, Eatable, Sleepable { }
class Robot implements Workable { }
```

## D - Dependency Inversion

```typescript
// ❌ Bad - High-level depends on low-level
class UserService {
  private db = new MySQLDatabase(); // Concrete dependency
}

// ✅ Good - Depend on abstractions
interface Database {
  query(sql: string): Promise<any>;
}

class UserService {
  constructor(private db: Database) { } // Injected abstraction
}

// Can use any implementation
new UserService(new MySQLDatabase());
new UserService(new PostgresDatabase());
new UserService(new MockDatabase()); // For testing
```

## Authoritative Sources
- **SOLID Principles** by Robert C. Martin - https://blog.cleancoder.com/uncle-bob/2020/10/18/Solid-Relevance.html
- **Agile Software Development** by Robert C. Martin - https://www.oreilly.com/library/view/agile-software-development/0135974445/

## Reference Documentation
- [Clean Code](../clean-code/SKILL.md)
- [Design Patterns](../design-patterns/SKILL.md)
- [Quality Principles (Consolidated)](../../quality/common/SKILL.md)
