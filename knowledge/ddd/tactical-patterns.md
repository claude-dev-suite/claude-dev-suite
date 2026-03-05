# Tactical Patterns in Domain-Driven Design

## Overview

Tactical patterns are the building blocks for implementing a domain model inside a bounded context. While strategic patterns address macro structure, tactical patterns address micro structure: how you model individual concepts in code.

```
+-----------+     uses      +----------------+
|  Entity   |-------------->| Value Object   |
| (identity)|               | (no identity)  |
+-----------+               +----------------+
     |  delegates to              |  composed into
     v                            v
+----------------+         +----------------+
|Domain Service  |         |  Specification |
|(stateless logic)|        | (business rule)|
+----------------+         +----------------+
+----------------+
|    Factory     |  Creates complex Entities / Aggregates
+----------------+
```

## Entities

An entity is defined by its **identity**, not its attributes. Two entities with identical attributes but different IDs are different objects.

### Java Implementation

```java
public class Customer {
    private final CustomerId id;
    private String name;
    private EmailAddress email;
    private CustomerStatus status;

    private Customer(CustomerId id, String name, EmailAddress email) {
        this.id = Objects.requireNonNull(id);
        this.name = Objects.requireNonNull(name);
        this.email = Objects.requireNonNull(email);
        this.status = CustomerStatus.ACTIVE;
    }

    public static Customer register(String name, EmailAddress email) {
        return new Customer(CustomerId.generate(), name, email);
    }

    public void suspend(String reason) {
        if (this.status != CustomerStatus.ACTIVE)
            throw new IllegalStateException("Can only suspend active customers");
        this.status = CustomerStatus.SUSPENDED;
    }

    @Override
    public boolean equals(Object o) {
        if (!(o instanceof Customer other)) return false;
        return this.id.equals(other.id); // Identity-based equality
    }

    @Override
    public int hashCode() { return id.hashCode(); }
}
```

### TypeScript Implementation

```typescript
class Customer {
  private _status = CustomerStatus.ACTIVE;

  private constructor(
    private readonly _id: CustomerId,
    private _name: string,
    private _email: EmailAddress
  ) {}

  static register(name: string, email: EmailAddress): Customer {
    return new Customer(CustomerId.generate(), name, email);
  }

  suspend(reason: string): void {
    if (this._status !== CustomerStatus.ACTIVE)
      throw new DomainError(`Can only suspend active customers`);
    this._status = CustomerStatus.SUSPENDED;
  }

  equals(other: Customer): boolean { return this._id.equals(other._id); }
}
```

### Strongly-Typed IDs

Never use raw `string` or `long` for entity IDs:

```java
public record CustomerId(UUID value) {
    public static CustomerId generate() { return new CustomerId(UUID.randomUUID()); }
    public static CustomerId from(String raw) { return new CustomerId(UUID.fromString(raw)); }
}
```

```typescript
type CustomerId = string & { readonly __brand: "CustomerId" };
function createCustomerId(value?: string): CustomerId {
  return (value ?? crypto.randomUUID()) as CustomerId;
}
```

## Value Objects

A value object has **no identity**. It is defined entirely by its attributes, is immutable, and self-validating.

### Java Implementation

```java
public record Money(BigDecimal amount, Currency currency) {
    public Money {
        Objects.requireNonNull(amount);
        Objects.requireNonNull(currency);
    }
    public Money add(Money other) {
        assertSameCurrency(other);
        return new Money(this.amount.add(other.amount), this.currency);
    }
    public Money multiply(int quantity) {
        return new Money(this.amount.multiply(BigDecimal.valueOf(quantity)), this.currency);
    }
    private void assertSameCurrency(Money other) {
        if (!this.currency.equals(other.currency))
            throw new IllegalArgumentException("Currency mismatch");
    }
}

public record EmailAddress(String value) {
    private static final Pattern PATTERN = Pattern.compile("^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+$");
    public EmailAddress {
        Objects.requireNonNull(value);
        if (!PATTERN.matcher(value).matches())
            throw new IllegalArgumentException("Invalid email: " + value);
        value = value.toLowerCase(Locale.ROOT);
    }
}
```

### TypeScript Implementation

```typescript
class Money {
  private constructor(readonly amount: number, readonly currency: string) {
    Object.freeze(this);
  }
  static of(amount: number, currency: string): Money {
    if (!Number.isFinite(amount)) throw new DomainError("Amount must be finite");
    return new Money(Math.round(amount * 100) / 100, currency.toUpperCase());
  }
  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.amount + other.amount, this.currency);
  }
  equals(other: Money): boolean {
    return this.amount === other.amount && this.currency === other.currency;
  }
  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency)
      throw new DomainError(`Currency mismatch: ${this.currency} vs ${other.currency}`);
  }
}
```

### Choosing Between Entity and Value Object

| Question                              | Entity | Value Object |
|---------------------------------------|--------|--------------|
| Does it have a lifecycle?             | Yes    | No           |
| Does identity matter?                 | Yes    | No           |
| Is it interchangeable?               | No     | Yes          |
| Should it be immutable?              | Maybe  | Always       |

## Domain Services

A domain service encapsulates logic that does not naturally belong to any single entity. It is **stateless** and operates on entities/value objects passed to it.

```java
public class TransferService {
    public TransferResult transfer(Account source, Account dest, Money amount) {
        if (!source.hasBalance(amount)) return TransferResult.insufficientFunds();
        source.debit(amount);
        dest.credit(amount);
        return TransferResult.success(source.getId(), dest.getId(), amount);
    }
}
```

```typescript
class PricingService {
  calculateOrderTotal(
    lines: ReadonlyArray<OrderLine>,
    discount: DiscountPolicy,
    taxRate: TaxRate
  ): Money {
    const subtotal = lines.reduce(
      (sum, line) => sum.add(line.unitPrice.multiply(line.quantity)),
      Money.of(0, lines[0].unitPrice.currency)
    );
    return discount.apply(subtotal).add(taxRate.calculateTax(subtotal));
  }
}
```

### Domain Service vs Application Service

| Domain Service                    | Application Service            |
|-----------------------------------|--------------------------------|
| Contains business rules           | Orchestrates use cases          |
| No infrastructure dependencies    | Calls repos, external services  |
| Part of the domain layer          | Part of the application layer   |
| Example: `PricingService`         | Example: `PlaceOrderUseCase`    |

## Factories

Factories encapsulate complex object creation logic.

### Factory Method on the Entity

```java
public class Order {
    public static Order place(CustomerId customerId, List<OrderLine> lines, Money total) {
        if (lines.isEmpty()) throw new IllegalArgumentException("Order must have lines");
        Order order = new Order(OrderId.generate(), customerId);
        lines.forEach(order::addLine);
        order.totalAmount = total;
        order.status = OrderStatus.PLACED;
        return order;
    }
}
```

### Standalone Factory (for complex creation)

```typescript
class OrderFactory {
  constructor(private readonly pricingService: PricingService) {}

  async createOrder(customerId: CustomerId, items: OrderItemRequest[]): Promise<Order> {
    const lines = items.map((item) =>
      OrderLine.create(item.productId, item.quantity, item.unitPrice)
    );
    const total = this.pricingService.calculateSubtotal(lines);
    return Order.place(customerId, lines, total);
  }
}
```

## Specification Pattern

Encapsulates a business rule as a first-class object, composable with boolean logic.

### Java Implementation

```java
public interface Specification<T> {
    boolean isSatisfiedBy(T candidate);
    default Specification<T> and(Specification<T> other) {
        return candidate -> this.isSatisfiedBy(candidate) && other.isSatisfiedBy(candidate);
    }
    default Specification<T> or(Specification<T> other) {
        return candidate -> this.isSatisfiedBy(candidate) || other.isSatisfiedBy(candidate);
    }
    default Specification<T> not() {
        return candidate -> !this.isSatisfiedBy(candidate);
    }
}

public class CustomerIsActive implements Specification<Customer> {
    @Override public boolean isSatisfiedBy(Customer c) {
        return c.getStatus() == CustomerStatus.ACTIVE;
    }
}

public class CustomerHasMinOrders implements Specification<Customer> {
    private final int min;
    public CustomerHasMinOrders(int min) { this.min = min; }
    @Override public boolean isSatisfiedBy(Customer c) {
        return c.getOrderCount() >= min;
    }
}

// Compose
Specification<Customer> eligible = new CustomerIsActive().and(new CustomerHasMinOrders(5));
boolean canDiscount = eligible.isSatisfiedBy(customer);
```

### TypeScript Implementation

```typescript
abstract class CompositeSpecification<T> {
  abstract isSatisfiedBy(candidate: T): boolean;
  and(other: CompositeSpecification<T>) {
    return { isSatisfiedBy: (c: T) => this.isSatisfiedBy(c) && other.isSatisfiedBy(c) };
  }
}

class OrderExceedsAmount extends CompositeSpecification<Order> {
  constructor(private readonly threshold: Money) { super(); }
  isSatisfiedBy(order: Order): boolean {
    return order.totalAmount.isGreaterThan(this.threshold);
  }
}
```

## Anti-Patterns to Avoid

### 1. Anemic Domain Model

Entities with only getters/setters and no behavior. All logic in services.

```java
// BAD                                    // GOOD
public class Order {                      public class Order {
    private String status;                    private OrderStatus status;
    public void setStatus(String s) {         public void cancel(String reason) {
        this.status = s;                          if (!status.isCancellable())
    }                                                 throw new DomainException(...);
}                                                 this.status = OrderStatus.CANCELLED;
                                              }
                                          }
```

### 2. Primitive Obsession

Using `String email`, `double amount`, `String id` instead of value objects. Validation scatters and type safety is lost.

### 3. Domain Service Overuse

Putting logic in a service when the entity has all the information needed.

### 4. Mutable Value Objects

A value object with setters breaks its fundamental contract. Always create new instances.

### 5. Business Logic in Application Services

Application services orchestrate; they should not contain `if/else` business rule chains.

## Production Checklist

- [ ] Entities use strongly-typed IDs, never raw `String`/`long`/`UUID`
- [ ] Entity equality is based on identity only
- [ ] Value objects are immutable with equality based on all attributes
- [ ] Value objects are self-validating (invariants enforced in constructor)
- [ ] Domain services are stateless with no infrastructure dependencies
- [ ] Complex creation logic is encapsulated in factories
- [ ] Business rules are explicit (specifications or guard clauses on entities)
- [ ] No anemic domain model: entities contain behavior
- [ ] Application services orchestrate; they do not contain business rules
- [ ] Domain layer has zero dependencies on infrastructure
