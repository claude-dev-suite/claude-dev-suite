# Sagas for Distributed Transactions

## Overview

In a microservices or event-sourced architecture, a single business operation often spans multiple aggregates or services. Traditional database transactions cannot coordinate across these boundaries. The saga pattern replaces a single ACID transaction with a sequence of local transactions, each publishing events or commands. If any step fails, previously completed steps are reversed by compensating actions.

There are two coordination approaches:

- **Choreography** -- Each service listens to events and decides independently what to do next. No central coordinator.
- **Orchestration** -- A dedicated saga orchestrator directs each step, telling services what to do and reacting to their responses.

---

## Choreography Sagas

Each service publishes events after completing its local transaction. Other services subscribe to those events and react.

### Example: Order Fulfillment Choreography

```
OrderService           PaymentService          InventoryService         ShippingService
     |                       |                        |                       |
     |-- OrderPlaced ------->|                        |                       |
     |                       |-- PaymentCharged ----->|                       |
     |                       |                        |-- InventoryReserved ->|
     |                       |                        |                       |-- ShipmentCreated
     |<------------------------------- OrderFulfilled -------------------------|
```

If payment fails:
```
     |-- OrderPlaced ------->|
     |                       |-- PaymentFailed
     |<-- OrderCancelled ----|
```

If inventory reservation fails after payment:
```
     |-- OrderPlaced ------->|
     |                       |-- PaymentCharged ----->|
     |                       |                        |-- InsufficientInventory
     |                       |<-- RefundIssued -------|  (compensating action)
     |<-- OrderCancelled ----|
```

### TypeScript Choreography Handlers

```typescript
// In PaymentService
class PaymentEventHandler {
  constructor(
    private paymentService: PaymentService,
    private eventBus: EventBus,
  ) {}

  async onOrderPlaced(event: OrderPlacedEvent): Promise<void> {
    try {
      const charge = await this.paymentService.charge(
        event.payload.customerId,
        event.payload.totalAmount,
        event.payload.paymentMethod,
      );

      await this.eventBus.publish({
        eventType: 'PaymentCharged',
        aggregateId: charge.paymentId,
        payload: {
          orderId: event.aggregateId,
          paymentId: charge.paymentId,
          amount: charge.amount,
        },
        metadata: { correlationId: event.metadata.correlationId },
      });
    } catch (err) {
      await this.eventBus.publish({
        eventType: 'PaymentFailed',
        aggregateId: event.aggregateId,
        payload: {
          orderId: event.aggregateId,
          reason: (err as Error).message,
        },
        metadata: { correlationId: event.metadata.correlationId },
      });
    }
  }
}

// In InventoryService
class InventoryEventHandler {
  constructor(
    private inventoryService: InventoryService,
    private eventBus: EventBus,
  ) {}

  async onPaymentCharged(event: PaymentChargedEvent): Promise<void> {
    try {
      await this.inventoryService.reserve(
        event.payload.orderId,
        event.payload.items,
      );

      await this.eventBus.publish({
        eventType: 'InventoryReserved',
        aggregateId: event.payload.orderId,
        payload: { orderId: event.payload.orderId },
        metadata: { correlationId: event.metadata.correlationId },
      });
    } catch (err) {
      // Compensate: trigger refund
      await this.eventBus.publish({
        eventType: 'InventoryReservationFailed',
        aggregateId: event.payload.orderId,
        payload: {
          orderId: event.payload.orderId,
          paymentId: event.payload.paymentId,
          reason: (err as Error).message,
        },
        metadata: { correlationId: event.metadata.correlationId },
      });
    }
  }
}
```

### Choreography Trade-Offs

**Advantages:** No single point of failure, services are fully decoupled, easy to add new reactions.

**Disadvantages:** Hard to visualize the full workflow, difficult to debug (events scatter across services), cyclic event chains can emerge, no central place to see saga status.

---

## Orchestration Sagas

A saga orchestrator (a stateful process manager) controls the workflow. It sends commands to services, waits for responses, and decides the next step or triggers compensation.

### Saga State Machine

```typescript
type SagaStatus =
  | 'STARTED'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_CHARGED'
  | 'INVENTORY_PENDING'
  | 'INVENTORY_RESERVED'
  | 'SHIPPING_PENDING'
  | 'COMPLETED'
  | 'COMPENSATING_INVENTORY'
  | 'COMPENSATING_PAYMENT'
  | 'FAILED';

interface SagaState {
  sagaId: string;
  orderId: string;
  status: SagaStatus;
  paymentId?: string;
  shipmentId?: string;
  failureReason?: string;
  startedAt: string;
  updatedAt: string;
}
```

### TypeScript Saga Orchestrator

```typescript
export class OrderFulfillmentSaga {
  constructor(
    private sagaStore: SagaStore,
    private commandBus: CommandBus,
    private deadLetterQueue: DeadLetterQueue,
  ) {}

  // Entry point: triggered by OrderPlaced event
  async start(event: OrderPlacedEvent): Promise<void> {
    const sagaState: SagaState = {
      sagaId: crypto.randomUUID(),
      orderId: event.aggregateId,
      status: 'STARTED',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.sagaStore.save(sagaState);
    await this.requestPayment(sagaState, event);
  }

  // Step 1: Request payment
  private async requestPayment(saga: SagaState, event: OrderPlacedEvent): Promise<void> {
    saga.status = 'PAYMENT_PENDING';
    await this.sagaStore.save(saga);

    await this.commandBus.dispatch({
      type: 'ChargePayment',
      orderId: saga.orderId,
      customerId: event.payload.customerId,
      amount: event.payload.totalAmount,
      metadata: { correlationId: saga.sagaId },
    });
  }

  // Step 1 response: payment succeeded
  async onPaymentCharged(event: PaymentChargedEvent): Promise<void> {
    const saga = await this.sagaStore.findByCorrelation(event.metadata.correlationId);
    if (!saga || saga.status !== 'PAYMENT_PENDING') return;

    saga.status = 'PAYMENT_CHARGED';
    saga.paymentId = event.payload.paymentId;
    await this.sagaStore.save(saga);

    await this.requestInventoryReservation(saga);
  }

  // Step 2: Reserve inventory
  private async requestInventoryReservation(saga: SagaState): Promise<void> {
    saga.status = 'INVENTORY_PENDING';
    await this.sagaStore.save(saga);

    await this.commandBus.dispatch({
      type: 'ReserveInventory',
      orderId: saga.orderId,
      metadata: { correlationId: saga.sagaId },
    });
  }

  // Step 2 response: inventory reserved
  async onInventoryReserved(event: InventoryReservedEvent): Promise<void> {
    const saga = await this.sagaStore.findByCorrelation(event.metadata.correlationId);
    if (!saga || saga.status !== 'INVENTORY_PENDING') return;

    saga.status = 'INVENTORY_RESERVED';
    await this.sagaStore.save(saga);

    await this.requestShipment(saga);
  }

  // Step 3: Create shipment
  private async requestShipment(saga: SagaState): Promise<void> {
    saga.status = 'SHIPPING_PENDING';
    await this.sagaStore.save(saga);

    await this.commandBus.dispatch({
      type: 'CreateShipment',
      orderId: saga.orderId,
      metadata: { correlationId: saga.sagaId },
    });
  }

  // Step 3 response: shipment created
  async onShipmentCreated(event: ShipmentCreatedEvent): Promise<void> {
    const saga = await this.sagaStore.findByCorrelation(event.metadata.correlationId);
    if (!saga || saga.status !== 'SHIPPING_PENDING') return;

    saga.status = 'COMPLETED';
    saga.shipmentId = event.payload.shipmentId;
    await this.sagaStore.save(saga);
  }

  // Compensation: payment failed
  async onPaymentFailed(event: PaymentFailedEvent): Promise<void> {
    const saga = await this.sagaStore.findByCorrelation(event.metadata.correlationId);
    if (!saga) return;

    saga.status = 'FAILED';
    saga.failureReason = event.payload.reason;
    await this.sagaStore.save(saga);

    await this.commandBus.dispatch({
      type: 'CancelOrder',
      orderId: saga.orderId,
      reason: `Payment failed: ${event.payload.reason}`,
      metadata: { correlationId: saga.sagaId },
    });
  }

  // Compensation: inventory reservation failed after payment
  async onInventoryReservationFailed(event: InventoryReservationFailedEvent): Promise<void> {
    const saga = await this.sagaStore.findByCorrelation(event.metadata.correlationId);
    if (!saga) return;

    saga.status = 'COMPENSATING_PAYMENT';
    saga.failureReason = event.payload.reason;
    await this.sagaStore.save(saga);

    // Compensate: refund payment
    await this.commandBus.dispatch({
      type: 'RefundPayment',
      paymentId: saga.paymentId!,
      orderId: saga.orderId,
      reason: event.payload.reason,
      metadata: { correlationId: saga.sagaId },
    });
  }

  // After refund completes, cancel the order
  async onPaymentRefunded(event: PaymentRefundedEvent): Promise<void> {
    const saga = await this.sagaStore.findByCorrelation(event.metadata.correlationId);
    if (!saga) return;

    saga.status = 'FAILED';
    await this.sagaStore.save(saga);

    await this.commandBus.dispatch({
      type: 'CancelOrder',
      orderId: saga.orderId,
      reason: `Inventory unavailable. Payment refunded.`,
      metadata: { correlationId: saga.sagaId },
    });
  }
}
```

### Spring State Machine Saga

```java
@Configuration
@EnableStateMachineFactory
public class OrderSagaStateMachineConfig
        extends EnumStateMachineConfigurerAdapter<SagaStatus, SagaEvent> {

    @Override
    public void configure(StateMachineStateConfigurer<SagaStatus, SagaEvent> states)
            throws Exception {
        states.withStates()
            .initial(SagaStatus.STARTED)
            .state(SagaStatus.PAYMENT_PENDING)
            .state(SagaStatus.PAYMENT_CHARGED)
            .state(SagaStatus.INVENTORY_PENDING)
            .state(SagaStatus.INVENTORY_RESERVED)
            .state(SagaStatus.SHIPPING_PENDING)
            .end(SagaStatus.COMPLETED)
            .state(SagaStatus.COMPENSATING_PAYMENT)
            .end(SagaStatus.FAILED);
    }

    @Override
    public void configure(StateMachineTransitionConfigurer<SagaStatus, SagaEvent> transitions)
            throws Exception {
        transitions
            // Happy path
            .withExternal()
                .source(SagaStatus.STARTED).target(SagaStatus.PAYMENT_PENDING)
                .event(SagaEvent.ORDER_PLACED)
                .action(chargePaymentAction())
                .and()
            .withExternal()
                .source(SagaStatus.PAYMENT_PENDING).target(SagaStatus.PAYMENT_CHARGED)
                .event(SagaEvent.PAYMENT_CHARGED)
                .and()
            .withExternal()
                .source(SagaStatus.PAYMENT_CHARGED).target(SagaStatus.INVENTORY_PENDING)
                .event(SagaEvent.RESERVE_INVENTORY)
                .action(reserveInventoryAction())
                .and()
            .withExternal()
                .source(SagaStatus.INVENTORY_PENDING).target(SagaStatus.INVENTORY_RESERVED)
                .event(SagaEvent.INVENTORY_RESERVED)
                .and()
            .withExternal()
                .source(SagaStatus.INVENTORY_RESERVED).target(SagaStatus.SHIPPING_PENDING)
                .event(SagaEvent.CREATE_SHIPMENT)
                .action(createShipmentAction())
                .and()
            .withExternal()
                .source(SagaStatus.SHIPPING_PENDING).target(SagaStatus.COMPLETED)
                .event(SagaEvent.SHIPMENT_CREATED)
                .and()

            // Compensation path
            .withExternal()
                .source(SagaStatus.PAYMENT_PENDING).target(SagaStatus.FAILED)
                .event(SagaEvent.PAYMENT_FAILED)
                .action(cancelOrderAction())
                .and()
            .withExternal()
                .source(SagaStatus.INVENTORY_PENDING).target(SagaStatus.COMPENSATING_PAYMENT)
                .event(SagaEvent.INVENTORY_FAILED)
                .action(refundPaymentAction())
                .and()
            .withExternal()
                .source(SagaStatus.COMPENSATING_PAYMENT).target(SagaStatus.FAILED)
                .event(SagaEvent.PAYMENT_REFUNDED)
                .action(cancelOrderAction());
    }

    @Bean
    public Action<SagaStatus, SagaEvent> chargePaymentAction() {
        return context -> {
            var orderId = (UUID) context.getExtendedState()
                .getVariables().get("orderId");
            commandBus.dispatch(new ChargePaymentCommand(orderId));
        };
    }

    @Bean
    public Action<SagaStatus, SagaEvent> refundPaymentAction() {
        return context -> {
            var paymentId = (UUID) context.getExtendedState()
                .getVariables().get("paymentId");
            commandBus.dispatch(new RefundPaymentCommand(paymentId));
        };
    }
}
```

### Java Saga Orchestrator (without Spring State Machine)

```java
@Service
public class OrderFulfillmentSaga {

    private final SagaStore sagaStore;
    private final CommandBus commandBus;

    @EventHandler
    public void on(OrderPlacedEvent event) {
        var saga = new SagaState(
            UUID.randomUUID(),
            event.aggregateId(),
            SagaStatus.STARTED,
            Instant.now()
        );

        sagaStore.save(saga);
        transition(saga, SagaStatus.PAYMENT_PENDING);

        commandBus.dispatch(new ChargePaymentCommand(
            saga.orderId(),
            event.payload().customerId(),
            event.payload().totalAmount(),
            saga.sagaId()
        ));
    }

    @EventHandler
    public void on(PaymentChargedEvent event) {
        var saga = sagaStore.findByCorrelation(event.correlationId());
        if (saga == null || saga.status() != SagaStatus.PAYMENT_PENDING) return;

        saga = saga.withPaymentId(event.paymentId());
        transition(saga, SagaStatus.INVENTORY_PENDING);

        commandBus.dispatch(new ReserveInventoryCommand(
            saga.orderId(), saga.sagaId()
        ));
    }

    @EventHandler
    public void on(InventoryReservationFailedEvent event) {
        var saga = sagaStore.findByCorrelation(event.correlationId());
        if (saga == null) return;

        transition(saga, SagaStatus.COMPENSATING_PAYMENT);

        commandBus.dispatch(new RefundPaymentCommand(
            saga.paymentId(), saga.orderId(), saga.sagaId()
        ));
    }

    private void transition(SagaState saga, SagaStatus newStatus) {
        var updated = saga.withStatus(newStatus).withUpdatedAt(Instant.now());
        sagaStore.save(updated);
    }
}
```

---

## Compensating Actions

Compensating actions undo the effect of a previously completed step. They are not rollbacks; they are new forward actions that semantically reverse earlier work.

### Compensation Table

| Step | Action | Compensation |
|------|--------|--------------|
| Charge payment | `ChargePayment` | `RefundPayment` |
| Reserve inventory | `ReserveInventory` | `ReleaseInventory` |
| Create shipment | `CreateShipment` | `CancelShipment` |
| Debit account | `DebitAccount` | `CreditAccount` |
| Send notification | `SendConfirmation` | `SendCancellationNotice` |

### Rules for Compensating Actions

1. **Compensations must be idempotent.** They may be retried on failure.
2. **Compensations must always succeed** (eventually). If a refund fails, it must be retried until it succeeds or escalated to manual intervention.
3. **Order matters.** Compensations run in reverse order of the original steps.
4. **Not all steps need compensation.** Sending an email confirmation is not reversible, but you can send a follow-up cancellation notice.

---

## Error Handling and Dead Letter Queues

### Timeout Handling

Sagas can stall if a service never responds. Implement timeouts.

```typescript
export class SagaTimeoutMonitor {
  constructor(
    private sagaStore: SagaStore,
    private saga: OrderFulfillmentSaga,
    private timeoutMs = 30_000,
  ) {}

  async checkForStuckSagas(): Promise<void> {
    const stuckSagas = await this.sagaStore.findStuck(this.timeoutMs);

    for (const saga of stuckSagas) {
      console.warn(`Saga ${saga.sagaId} stuck in ${saga.status} for over ${this.timeoutMs}ms`);

      switch (saga.status) {
        case 'PAYMENT_PENDING':
          // Payment service not responding, cancel the order
          saga.status = 'FAILED';
          saga.failureReason = 'Payment service timeout';
          await this.sagaStore.save(saga);
          break;

        case 'INVENTORY_PENDING':
          // Inventory service timeout, compensate payment
          await this.saga.onInventoryReservationFailed({
            metadata: { correlationId: saga.sagaId },
            payload: { orderId: saga.orderId, reason: 'Inventory service timeout' },
          } as any);
          break;

        case 'COMPENSATING_PAYMENT':
          // Refund is stuck, send to dead letter for manual intervention
          await this.deadLetterQueue.enqueue({
            type: 'STUCK_COMPENSATION',
            sagaId: saga.sagaId,
            status: saga.status,
            payload: saga,
            enqueuedAt: new Date().toISOString(),
          });
          break;
      }
    }
  }
}
```

### Dead Letter Queue

Events or commands that cannot be processed after all retries go to a dead letter queue for manual inspection and resolution.

```typescript
interface DeadLetterEntry {
  id: string;
  type: string;
  sagaId: string;
  originalEvent: string; // serialized
  error: string;
  retryCount: number;
  enqueuedAt: string;
  resolvedAt?: string;
  resolution?: 'retried' | 'skipped' | 'manual';
}

export class DeadLetterQueue {
  constructor(private pool: Pool) {}

  async enqueue(entry: Omit<DeadLetterEntry, 'id'>): Promise<void> {
    await this.pool.query(
      `INSERT INTO dead_letter_queue
         (id, type, saga_id, original_event, error, retry_count, enqueued_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        crypto.randomUUID(),
        entry.type,
        entry.sagaId,
        entry.originalEvent,
        entry.error,
        entry.retryCount,
        entry.enqueuedAt,
      ]
    );
  }

  async getUnresolved(): Promise<DeadLetterEntry[]> {
    const { rows } = await this.pool.query(
      'SELECT * FROM dead_letter_queue WHERE resolved_at IS NULL ORDER BY enqueued_at'
    );
    return rows;
  }

  async resolve(id: string, resolution: 'retried' | 'skipped' | 'manual'): Promise<void> {
    await this.pool.query(
      `UPDATE dead_letter_queue
       SET resolved_at = now(), resolution = $1
       WHERE id = $2`,
      [resolution, id]
    );
  }
}
```

### Dead Letter Table Schema

```sql
CREATE TABLE dead_letter_queue (
    id              UUID PRIMARY KEY,
    type            VARCHAR(100) NOT NULL,
    saga_id         UUID NOT NULL,
    original_event  JSONB NOT NULL,
    error           TEXT NOT NULL,
    retry_count     INT NOT NULL DEFAULT 0,
    enqueued_at     TIMESTAMPTZ NOT NULL,
    resolved_at     TIMESTAMPTZ,
    resolution      VARCHAR(50),

    CHECK (resolution IN ('retried', 'skipped', 'manual'))
);

CREATE INDEX idx_dlq_unresolved ON dead_letter_queue (enqueued_at) WHERE resolved_at IS NULL;
CREATE INDEX idx_dlq_saga ON dead_letter_queue (saga_id);
```

---

## Choreography vs Orchestration Decision Guide

| Factor | Choreography | Orchestration |
|--------|-------------|---------------|
| Coupling | Very loose | Orchestrator depends on all participants |
| Visibility | Distributed, hard to trace | Centralized state, easy to monitor |
| Complexity | Grows with number of services | Contained in orchestrator |
| Adding steps | Just subscribe a new service | Modify orchestrator logic |
| Failure handling | Each service handles its own | Orchestrator manages all compensations |
| Testing | Integration tests across services | Unit test the orchestrator |
| Debugging | Requires distributed tracing | Query saga store |
| Best for | Simple flows (2-3 steps) | Complex flows (4+ steps, branching, timeouts) |

---

## Anti-Patterns

1. **Missing compensations** -- Every step that has side effects must have a defined compensation. Skipping compensation design leads to inconsistent state after failures.
2. **Synchronous saga steps** -- Calling services synchronously in a saga defeats the purpose. Each step should be an async command/event exchange with timeout handling.
3. **Saga modifies aggregates directly** -- A saga should dispatch commands, not reach into aggregate internals. Let the aggregate's command handler enforce its own invariants.
4. **No saga persistence** -- If the orchestrator process dies, in-flight sagas are lost. Always persist saga state to a durable store.
5. **Infinite retry loops** -- Retrying a failed compensation forever without escalation. Implement max retries and then dead-letter the failure for human review.
6. **Choreography spaghetti** -- Using choreography for complex, multi-step workflows with branching logic. Beyond 3-4 steps, switch to orchestration.
7. **Ignoring idempotency** -- Saga steps and compensations may be executed more than once. Every handler must be idempotent or use deduplication.

---

## Production Checklist

- [ ] Every saga step has a documented compensating action.
- [ ] Saga state is persisted durably (database, not in-memory).
- [ ] Timeouts are configured for every pending state.
- [ ] A dead letter queue captures events/commands that fail all retries.
- [ ] Saga state transitions are logged with correlation IDs for tracing.
- [ ] The saga store supports querying by status (to find stuck sagas).
- [ ] A monitoring dashboard shows active sagas, completion rates, and failure rates.
- [ ] Compensating actions are idempotent and tested independently.
- [ ] Integration tests cover the full happy path and each compensation path.
- [ ] Manual resolution tooling exists for dead-lettered saga failures.
- [ ] Saga orchestrators are horizontally scalable (e.g., partition by saga ID).
- [ ] Event/command delivery is at-least-once, and all handlers tolerate duplicates.
