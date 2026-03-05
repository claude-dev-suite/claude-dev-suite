# Bounded Contexts in Domain-Driven Design

## Overview

A bounded context defines an explicit boundary within which a domain model applies. Inside that boundary, every term has a precise meaning. Outside, the same word may mean something entirely different. A single unified model for an entire enterprise is neither achievable nor desirable.

```
+-----------------------------------------------------------------------+
|                        E-Commerce Domain                              |
|  +-------------------+  +------------------+  +--------------------+  |
|  |   Sales Context   |  | Shipping Context |  | Inventory Context  |  |
|  | - Order           |  | - Shipment       |  | - StockItem        |  |
|  | - Customer        |  | - Parcel         |  | - Warehouse        |  |
|  | - LineItem        |  | - Address        |  | - Reservation      |  |
|  | - Price           |  | - TrackingNumber |  | - Reorder          |  |
|  +-------------------+  +------------------+  +--------------------+  |
|           |                     |                      |              |
|           +----------+----------+----------+-----------+              |
|                      |  Domain Events  |                              |
|                      +-----------------+                              |
+-----------------------------------------------------------------------+
"Order" in Sales != "Order" in Shipping. Sales cares about pricing;
Shipping cares about weight, dimensions, and destination.
```

## Identifying Boundaries

The most reliable signal is **language divergence** -- when the same term means different things to different teams, you have crossed a context boundary.

| Term     | Sales Context         | Shipping Context       | Inventory Context       |
|----------|-----------------------|------------------------|-------------------------|
| Order    | Items + pricing       | Destination + weight   | Reserved quantities     |
| Customer | Buyer with payment    | Recipient with address | Not relevant            |
| Product  | SKU + price + images  | Dimensions + fragility | Quantity + location     |

**Rules of thumb:**
1. **Different lifecycle** -- "Order" finalized at checkout vs. evolving through packing/shipping/delivery.
2. **Different invariants** -- Rules governing the concept differ between teams.
3. **Different rate of change** -- Pricing rules change weekly; warehouse layout changes yearly.
4. **Different data authority** -- Who is the source of truth?

## Context Mapping Patterns

### Shared Kernel

Two contexts share a small, explicitly defined subset of the model. Both teams must agree on changes.

```java
// shared-kernel module -- only immutable value objects
public record Money(BigDecimal amount, Currency currency) {
    public Money {
        Objects.requireNonNull(amount);
        Objects.requireNonNull(currency);
    }
    public Money add(Money other) {
        assertSameCurrency(other);
        return new Money(this.amount.add(other.amount), this.currency);
    }
    private void assertSameCurrency(Money other) {
        if (!this.currency.equals(other.currency))
            throw new IllegalArgumentException("Currency mismatch");
    }
}
```

**Risk:** Creates tight coupling. Keep shared kernels small -- value objects and basic types only.

### Anti-Corruption Layer (ACL)

A translation layer that isolates your model from an external or legacy model.

```typescript
// sales-context/infrastructure/acl/LegacyBillingAdapter.ts
class LegacyBillingACL {
  constructor(private readonly legacyClient: LegacyBillingClient) {}

  async submitOrder(order: SalesOrder): Promise<string> {
    // Translate FROM our model TO legacy model
    const legacyInvoice = {
      inv_no: `INV-${order.orderId}`,
      cust_id: parseInt(order.customerId, 10),
      line_items: order.lines.map((line) => ({
        sku: line.productId,
        qty: line.quantity,
        unit_price: line.unitPrice.amount,
      })),
      tax_pct: 0,
    };
    const result = await this.legacyClient.createInvoice(legacyInvoice);
    return result.inv_no; // Translate response back
  }
}
```

### Open Host Service / Published Language

A context exposes a well-defined protocol (REST, gRPC, event schema) for any consumer.

```protobuf
// tracking/proto/tracking.proto
syntax = "proto3";
service TrackingService {
  rpc GetShipmentStatus (GetShipmentStatusRequest) returns (ShipmentStatusResponse);
}
message ShipmentStatusResponse {
  string shipment_id = 1;
  ShipmentStatus status = 2;
  string estimated_delivery = 3;
}
enum ShipmentStatus {
  SHIPMENT_STATUS_UNSPECIFIED = 0;
  SHIPMENT_STATUS_IN_TRANSIT = 2;
  SHIPMENT_STATUS_DELIVERED = 3;
}
```

### Customer/Supplier

Upstream (supplier) provides data; downstream (customer) depends on it. Downstream can negotiate but does not control releases.

### Conformist

Downstream adopts upstream's model without translation. Use only when ACL cost is not justified and the domain is not core.

## Communication Between Contexts

### Event-Driven (Preferred -- Loosest Coupling)

```java
// Sales context publishes
events.publishEvent(new OrderPlacedIntegrationEvent(
    order.getId().value(), order.getCustomerId().value(), Instant.now()));

// Shipping context reacts
@EventListener
public void handle(OrderPlacedIntegrationEvent event) {
    shipmentService.prepareShipment(
        new ShipmentRequest(event.orderId(), event.customerId()));
}
```

For cross-service boundaries, use a message broker (Kafka, RabbitMQ) instead of in-process events.

### Synchronous (REST/gRPC with ACL)

```python
class InventoryACL:
    def __init__(self, base_url: str):
        self._client = httpx.Client(base_url=base_url, timeout=5.0)

    def check_availability(self, product_id: str, quantity: int) -> StockAvailability:
        response = self._client.get(f"/api/v1/stock/{product_id}")
        response.raise_for_status()
        data = response.json()
        return StockAvailability(
            product_id=product_id,
            available_quantity=data["qty_on_hand"] - data["qty_reserved"],
            is_available=(data["qty_on_hand"] - data["qty_reserved"]) >= quantity,
        )
```

## Strategic Design: Subdomain Classification

```
CORE DOMAIN              SUPPORTING              GENERIC
(Competitive edge)       (Necessary, not         (Commodity -- buy/outsource)
                          differentiating)
- Pricing Engine         - Customer Onboarding   - Authentication
- Recommendation         - Reporting             - Email Sending
- Risk Assessment        - Notifications         - Payment Gateway

Invest heavily.          Build pragmatically.    Minimize custom code.
```

## Implementation: Modular Monolith

Enforce boundaries within a single deployable unit before splitting into microservices.

```java
// ArchUnit -- enforce that Sales does not depend on Shipping
@ArchTest
static final ArchRule sales_does_not_depend_on_shipping =
    noClasses().that().resideInAPackage("..sales..")
        .should().dependOnClassesThat().resideInAPackage("..shipping..");
```

```jsonc
// TypeScript -- eslint-plugin-boundaries
{ "rules": { "boundaries/element-types": ["error", {
    "default": "disallow",
    "rules": [
      { "from": "sales", "allow": ["sales", "shared-kernel"] },
      { "from": "shipping", "allow": ["shipping", "shared-kernel"] }
    ]
}]}}
```

## Anti-Patterns to Avoid

1. **God Context** -- One context modeling everything. Symptoms: a `User` entity with 50+ fields.
2. **Premature Decomposition** -- Microservices before understanding boundaries. Start with a modular monolith.
3. **Shared Database** -- Two contexts reading/writing the same tables creates hidden coupling.
4. **Leaky Abstractions** -- Sales code importing Shipping classes without an ACL.
5. **Ignoring Conway's Law** -- Context boundaries that conflict with team structure.

## Production Checklist

- [ ] Each bounded context has a documented boundary and ubiquitous language glossary
- [ ] Context map drawn showing all relationships (ACL, Shared Kernel, Customer/Supplier)
- [ ] No shared databases between contexts -- each context owns its schema
- [ ] Integration points use well-defined contracts (event schemas, API specs, protobuf)
- [ ] Anti-corruption layers exist for legacy/external integrations
- [ ] Module boundaries enforced (ArchUnit, ESLint boundaries, or build-time checks)
- [ ] Core domain identified and receives highest engineering investment
- [ ] Team ownership aligns with context boundaries
- [ ] Events between contexts are versioned and backward-compatible
- [ ] Each context can be tested in isolation
