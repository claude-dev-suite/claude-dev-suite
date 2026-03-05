# CQRS Commands

## Overview

Command Query Responsibility Segregation (CQRS) separates the write side (commands that mutate state) from the read side (queries that return data). Each side has its own model optimized for its workload. Commands pass through handlers that validate, enforce business rules, and produce events. Queries hit dedicated read models (projections) tuned for specific UI or API needs.

The key insight is that reads and writes have fundamentally different scaling, consistency, and optimization requirements. A single model that serves both is always a compromise.

### Why CQRS Pairs with Event Sourcing

When the write side persists events rather than state snapshots, the read side can project those same events into any shape it needs: a denormalized table, a search index, a graph, a cache. The event log becomes the single source of truth, and read models become disposable, rebuildable views.

---

## Command Design Principles

### Intent-Revealing Names

Commands express user intent, not technical operations. They are imperative verbs in the business domain.

| Bad | Good |
|-----|------|
| `UpdateOrder` | `PlaceOrder`, `CancelOrder`, `AddLineItem` |
| `SetStatus` | `ApproveApplication`, `RejectApplication` |
| `ModifyAccount` | `ChangeShippingAddress`, `UpgradePlan` |

### Immutability

Commands are value objects. Once created, they are not modified. This prevents subtle bugs from shared mutable state and makes logging and replay straightforward.

### TypeScript Command Types

```typescript
// Base command interface
interface Command {
  readonly commandId: string;
  readonly timestamp: string;
  readonly metadata: CommandMetadata;
}

interface CommandMetadata {
  readonly correlationId: string;
  readonly userId: string;
  readonly traceId?: string;
}

// Concrete commands
interface PlaceOrder extends Command {
  readonly type: 'PlaceOrder';
  readonly customerId: string;
  readonly items: ReadonlyArray<{ productId: string; quantity: number }>;
  readonly shippingAddress: Address;
}

interface CancelOrder extends Command {
  readonly type: 'CancelOrder';
  readonly orderId: string;
  readonly reason: string;
}

type OrderCommand = PlaceOrder | CancelOrder | AddLineItem | RemoveLineItem;
```

### Java Command Records

```java
public sealed interface OrderCommand {

    record PlaceOrder(
        UUID commandId,
        UUID customerId,
        List<LineItem> items,
        Address shippingAddress,
        CommandMetadata metadata
    ) implements OrderCommand {}

    record CancelOrder(
        UUID commandId,
        UUID orderId,
        String reason,
        CommandMetadata metadata
    ) implements OrderCommand {}

    record AddLineItem(
        UUID commandId,
        UUID orderId,
        UUID productId,
        int quantity,
        CommandMetadata metadata
    ) implements OrderCommand {}
}

public record CommandMetadata(
    UUID correlationId,
    String userId,
    String traceId
) {}
```

---

## Command Validation

Validation happens at two layers:

1. **Structural validation** -- Is the command well-formed? Correct types, required fields present, format constraints (email, UUID). This runs before the handler.
2. **Domain validation** -- Does the command make business sense given the current aggregate state? (e.g., "Can this order be cancelled?"). This runs inside the handler after loading the aggregate.

### NestJS Structural Validation with Pipes

```typescript
import { IsUUID, IsNotEmpty, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

class LineItemDto {
  @IsUUID()
  productId: string;

  @Min(1)
  quantity: number;
}

class PlaceOrderDto {
  @IsUUID()
  customerId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  items: LineItemDto[];

  @IsNotEmpty()
  shippingAddress: AddressDto;
}
```

### Spring Boot Structural Validation

```java
public record PlaceOrderRequest(
    @NotNull UUID customerId,
    @NotEmpty @Valid List<LineItemRequest> items,
    @NotNull @Valid AddressRequest shippingAddress
) {}

public record LineItemRequest(
    @NotNull UUID productId,
    @Positive int quantity
) {}
```

---

## Command Handlers

A command handler receives one command type, loads the relevant aggregate (from the event store), invokes domain logic, and persists the resulting events.

### NestJS Command Handler (CQRS Module)

```typescript
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EventStore } from '../infrastructure/event-store';
import { OrderAggregate } from '../domain/order.aggregate';

// The command class
export class PlaceOrderCommand {
  constructor(
    public readonly customerId: string,
    public readonly items: Array<{ productId: string; quantity: number }>,
    public readonly shippingAddress: Address,
    public readonly metadata: CommandMetadata,
  ) {}
}

@CommandHandler(PlaceOrderCommand)
export class PlaceOrderHandler implements ICommandHandler<PlaceOrderCommand> {
  constructor(
    private readonly eventStore: EventStore,
    private readonly inventoryService: InventoryService,
  ) {}

  async execute(command: PlaceOrderCommand): Promise<string> {
    // Domain validation: check inventory
    for (const item of command.items) {
      const available = await this.inventoryService.checkAvailability(
        item.productId,
        item.quantity,
      );
      if (!available) {
        throw new InsufficientInventoryError(item.productId);
      }
    }

    // Create aggregate and apply business logic
    const order = OrderAggregate.create(
      command.customerId,
      command.items,
      command.shippingAddress,
    );

    // Persist events
    await this.eventStore.append(
      order.id,
      0, // new aggregate, expected version is 0
      order.uncommittedEvents,
    );

    return order.id;
  }
}
```

### Spring Boot Command Handler (Axon-style)

```java
@Service
public class OrderCommandHandler {

    private final EventStore eventStore;
    private final InventoryClient inventoryClient;

    public OrderCommandHandler(EventStore eventStore, InventoryClient inventoryClient) {
        this.eventStore = eventStore;
        this.inventoryClient = inventoryClient;
    }

    @Transactional
    public UUID handle(OrderCommand.PlaceOrder command) {
        // Domain validation
        for (var item : command.items()) {
            if (!inventoryClient.isAvailable(item.productId(), item.quantity())) {
                throw new InsufficientInventoryException(item.productId());
            }
        }

        // Create aggregate
        var order = OrderAggregate.create(
            command.customerId(),
            command.items(),
            command.shippingAddress()
        );

        // Persist events
        eventStore.append(
            order.getId(),
            0L,
            order.getUncommittedEvents()
        );

        return order.getId();
    }

    @Transactional
    public void handle(OrderCommand.CancelOrder command) {
        // Load aggregate from event history
        List<StoredEvent> history = eventStore.loadStream(command.orderId());
        var order = OrderAggregate.rehydrate(history);

        // Domain validation happens inside the aggregate
        order.cancel(command.reason());

        // Persist new events
        eventStore.append(
            command.orderId(),
            order.getLoadedVersion(),
            order.getUncommittedEvents()
        );
    }
}
```

---

## Command Bus

A command bus decouples the sender from the handler. It routes commands to the correct handler, applies cross-cutting concerns (logging, authorization, metrics), and can be extended with middleware.

### TypeScript Command Bus

```typescript
type CommandHandlerFn<T extends Command = Command> = (command: T) => Promise<unknown>;

type Middleware = (
  command: Command,
  next: (command: Command) => Promise<unknown>
) => Promise<unknown>;

export class CommandBus {
  private handlers = new Map<string, CommandHandlerFn>();
  private middlewares: Middleware[] = [];

  register<T extends Command>(commandType: string, handler: CommandHandlerFn<T>): void {
    if (this.handlers.has(commandType)) {
      throw new Error(`Handler already registered for ${commandType}`);
    }
    this.handlers.set(commandType, handler as CommandHandlerFn);
  }

  use(middleware: Middleware): void {
    this.middlewares.push(middleware);
  }

  async dispatch(command: Command & { type: string }): Promise<unknown> {
    const handler = this.handlers.get(command.type);
    if (!handler) {
      throw new Error(`No handler registered for command type: ${command.type}`);
    }

    // Build middleware chain
    const chain = this.middlewares.reduceRight<(cmd: Command) => Promise<unknown>>(
      (next, mw) => (cmd) => mw(cmd, next),
      (cmd) => handler(cmd)
    );

    return chain(command);
  }
}

// Middleware examples
const loggingMiddleware: Middleware = async (command, next) => {
  const start = Date.now();
  console.log(`[CMD] Dispatching ${(command as any).type}`, command.metadata.correlationId);
  try {
    const result = await next(command);
    console.log(`[CMD] Completed in ${Date.now() - start}ms`);
    return result;
  } catch (err) {
    console.error(`[CMD] Failed: ${(err as Error).message}`);
    throw err;
  }
};

const authMiddleware: Middleware = async (command, next) => {
  if (!command.metadata.userId) {
    throw new UnauthorizedError('Command requires authenticated user');
  }
  return next(command);
};

// Wire it up
const bus = new CommandBus();
bus.use(loggingMiddleware);
bus.use(authMiddleware);
bus.register<PlaceOrder>('PlaceOrder', placeOrderHandler.execute.bind(placeOrderHandler));
bus.register<CancelOrder>('CancelOrder', cancelOrderHandler.execute.bind(cancelOrderHandler));
```

### Spring Boot Command Bus (Simplified)

```java
@Component
public class CommandBus {

    private final Map<Class<?>, CommandHandler<?>> handlers = new HashMap<>();
    private final List<CommandMiddleware> middlewares = new ArrayList<>();

    public <T> void register(Class<T> commandType, CommandHandler<T> handler) {
        handlers.put(commandType, handler);
    }

    @SuppressWarnings("unchecked")
    public <R> R dispatch(Object command) {
        var handler = (CommandHandler<Object>) handlers.get(command.getClass());
        if (handler == null) {
            throw new IllegalArgumentException(
                "No handler for " + command.getClass().getSimpleName()
            );
        }

        // Apply middleware chain
        CommandExecution execution = cmd -> (R) handler.handle(cmd);
        for (var mw : middlewares.reversed()) {
            final var next = execution;
            execution = cmd -> (R) mw.execute(cmd, next::execute);
        }

        return execution.execute(command);
    }
}

@FunctionalInterface
public interface CommandHandler<T> {
    Object handle(T command);
}

@FunctionalInterface
public interface CommandMiddleware {
    Object execute(Object command, Function<Object, Object> next);
}
```

---

## Separate Read and Write Models

### Write Model (Aggregate)

The write model is the aggregate, rebuilt from events. It enforces all invariants and produces new events.

```typescript
export class OrderAggregate {
  private id: string;
  private status: OrderStatus;
  private items: Map<string, number> = new Map();
  private uncommitted: DomainEvent[] = [];
  private version = 0;

  static create(customerId: string, items: LineItem[], address: Address): OrderAggregate {
    const order = new OrderAggregate();
    const orderId = crypto.randomUUID();

    order.apply({
      eventType: 'OrderPlaced',
      aggregateId: orderId,
      payload: { customerId, items, shippingAddress: address },
    });

    return order;
  }

  static rehydrate(events: DomainEvent[]): OrderAggregate {
    const order = new OrderAggregate();
    for (const event of events) {
      order.applyEvent(event);
      order.version = event.version;
    }
    return order;
  }

  cancel(reason: string): void {
    if (this.status !== 'placed') {
      throw new InvalidOperationError(`Cannot cancel order in status: ${this.status}`);
    }
    this.apply({
      eventType: 'OrderCancelled',
      aggregateId: this.id,
      payload: { reason },
    });
  }

  private apply(partial: Partial<DomainEvent>): void {
    const event = this.toFullEvent(partial);
    this.applyEvent(event);
    this.uncommitted.push(event);
  }

  private applyEvent(event: DomainEvent): void {
    switch (event.eventType) {
      case 'OrderPlaced':
        this.id = event.aggregateId;
        this.status = 'placed';
        for (const item of event.payload.items) {
          this.items.set(item.productId, item.quantity);
        }
        break;
      case 'OrderCancelled':
        this.status = 'cancelled';
        break;
    }
  }

  get uncommittedEvents(): DomainEvent[] { return [...this.uncommitted]; }
  get loadedVersion(): number { return this.version; }
}
```

### Read Model (Projection)

The read model is a denormalized view built by processing events. It is optimized for specific queries.

```typescript
// Read model: flat order summary for a dashboard list
interface OrderSummary {
  orderId: string;
  customerId: string;
  customerName: string;
  status: string;
  itemCount: number;
  totalAmount: number;
  placedAt: string;
  cancelledAt?: string;
}

// This projection builds OrderSummary rows from events
// See projections.md for full projection infrastructure
```

The write model (aggregate) does not contain fields like `customerName` or `totalAmount` because the aggregate only cares about invariant enforcement. The read model adds those fields by joining with other data sources during projection.

---

## Anti-Patterns

1. **Returning query data from commands** -- Commands should return at most an ID or acknowledgment. If the caller needs data, issue a separate query against the read model.
2. **Using the write model for reads** -- Loading an aggregate from events just to display data is wasteful and couples UI concerns to domain logic.
3. **Anemic command handlers** -- Handlers that just pass data through without validation or invariant checking. The handler is where domain rules are enforced.
4. **Overly generic commands** -- `UpdateEntity { fields: Map<string, any> }` destroys intent and makes validation impossible.
5. **Synchronous read model updates in the command handler** -- This couples write and read sides, defeating the purpose of CQRS. Let projections handle read model updates asynchronously.
6. **Missing idempotency** -- Commands may be retried (network failures, message broker redelivery). Handlers should be idempotent or use deduplication via command IDs.

---

## Production Checklist

- [ ] Every command class is immutable and carries a unique `commandId`.
- [ ] Structural validation runs before the handler (DTOs with validation annotations or Zod schemas).
- [ ] Domain validation runs inside the handler after loading current aggregate state.
- [ ] Command handlers are idempotent or guard against duplicate processing.
- [ ] The command bus logs every dispatch with correlation ID and duration.
- [ ] Authorization middleware checks permissions before the handler executes.
- [ ] Write and read models use separate database connections or schemas.
- [ ] Commands that fail validation return clear, typed error responses (not generic 500s).
- [ ] Metrics track command throughput, latency, and failure rate per command type.
- [ ] No query logic exists in command handlers; read models serve all queries.
