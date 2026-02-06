# Event-Driven Architecture - Advanced Patterns

## Saga Implementation (Node.js)

```typescript
// Saga Orchestrator
class OrderSaga {
  private steps: SagaStep[] = [
    { execute: this.createOrder, compensate: this.cancelOrder },
    { execute: this.reserveInventory, compensate: this.releaseInventory },
    { execute: this.processPayment, compensate: this.refundPayment },
  ];

  async execute(orderData: OrderData): Promise<void> {
    const completedSteps: SagaStep[] = [];

    try {
      for (const step of this.steps) {
        await step.execute(orderData);
        completedSteps.push(step);
      }
    } catch (error) {
      // Compensate in reverse order
      for (const step of completedSteps.reverse()) {
        await step.compensate(orderData);
      }
      throw error;
    }
  }
}
```

## Saga Implementation (Java/Spring)

```java
@Service
public class OrderSagaOrchestrator {

    @Transactional
    public void executeOrderSaga(OrderRequest request) {
        String sagaId = UUID.randomUUID().toString();

        try {
            // Step 1: Create Order
            orderService.createOrder(request, sagaId);

            // Step 2: Reserve Inventory
            inventoryService.reserve(request.getItems(), sagaId);

            // Step 3: Process Payment
            paymentService.process(request.getPayment(), sagaId);

            // Complete
            orderService.confirmOrder(sagaId);

        } catch (Exception e) {
            compensate(sagaId);
            throw new SagaFailedException(e);
        }
    }

    private void compensate(String sagaId) {
        paymentService.refund(sagaId);
        inventoryService.release(sagaId);
        orderService.cancel(sagaId);
    }
}
```

## Outbox Implementation (Node.js + Prisma)

```typescript
// Service with Outbox
class OrderService {
  async createOrder(data: CreateOrderDto): Promise<Order> {
    return await prisma.$transaction(async (tx) => {
      // Business operation
      const order = await tx.order.create({ data });

      // Write to outbox (same transaction)
      await tx.outbox.create({
        data: {
          aggregateType: 'Order',
          aggregateId: order.id,
          eventType: 'OrderCreated',
          payload: { orderId: order.id, items: data.items },
        },
      });

      return order;
    });
  }
}

// Outbox Relay (separate process)
class OutboxRelay {
  async processOutbox(): Promise<void> {
    const messages = await prisma.outbox.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    for (const msg of messages) {
      try {
        await kafka.send({
          topic: `${msg.aggregateType}.${msg.eventType}`,
          messages: [{ value: JSON.stringify(msg.payload) }],
        });

        await prisma.outbox.update({
          where: { id: msg.id },
          data: { status: 'PROCESSED', processedAt: new Date() },
        });
      } catch (error) {
        // Retry logic
      }
    }
  }
}
```

## Outbox Implementation (Java/Spring)

```java
@Entity
@Table(name = "outbox")
public class OutboxMessage {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private String aggregateType;
    private String aggregateId;
    private String eventType;

    @Column(columnDefinition = "jsonb")
    private String payload;

    private LocalDateTime createdAt;
    private LocalDateTime processedAt;
    private String status;
}

@Service
@Transactional
public class OrderService {

    public Order createOrder(OrderRequest request) {
        Order order = orderRepository.save(new Order(request));

        outboxRepository.save(OutboxMessage.builder()
            .aggregateType("Order")
            .aggregateId(order.getId().toString())
            .eventType("OrderCreated")
            .payload(objectMapper.writeValueAsString(order))
            .status("PENDING")
            .createdAt(LocalDateTime.now())
            .build());

        return order;
    }
}

@Scheduled(fixedDelay = 1000)
public void processOutbox() {
    List<OutboxMessage> messages = outboxRepository
        .findByStatusOrderByCreatedAt("PENDING", PageRequest.of(0, 100));

    for (OutboxMessage msg : messages) {
        kafkaTemplate.send(msg.getAggregateType() + "." + msg.getEventType(),
                          msg.getPayload());
        msg.setStatus("PROCESSED");
        msg.setProcessedAt(LocalDateTime.now());
        outboxRepository.save(msg);
    }
}
```

## Event Sourcing Implementation

```typescript
// Aggregate
class Order extends AggregateRoot {
  private status: OrderStatus;
  private items: OrderItem[];

  static create(data: CreateOrderData): Order {
    const order = new Order();
    order.apply(new OrderCreatedEvent(data));
    return order;
  }

  confirm(): void {
    if (this.status !== OrderStatus.PENDING) {
      throw new InvalidOperationError('Order cannot be confirmed');
    }
    this.apply(new OrderConfirmedEvent(this.id));
  }

  // Event handlers
  onOrderCreated(event: OrderCreatedEvent): void {
    this.id = event.orderId;
    this.status = OrderStatus.PENDING;
    this.items = event.items;
  }

  onOrderConfirmed(event: OrderConfirmedEvent): void {
    this.status = OrderStatus.CONFIRMED;
  }
}

// Repository
class EventSourcedRepository {
  async save(aggregate: AggregateRoot): Promise<void> {
    const events = aggregate.getUncommittedEvents();

    await prisma.event.createMany({
      data: events.map((event, index) => ({
        aggregateId: aggregate.id,
        aggregateType: aggregate.constructor.name,
        eventType: event.constructor.name,
        eventData: event,
        version: aggregate.version + index + 1,
      })),
    });

    // Publish events
    for (const event of events) {
      await this.eventBus.publish(event);
    }
  }

  async load(aggregateId: string): Promise<Order> {
    const events = await prisma.event.findMany({
      where: { aggregateId },
      orderBy: { version: 'asc' },
    });

    const order = new Order();
    for (const event of events) {
      order.apply(event.eventData, false);
    }
    return order;
  }
}
```

## Idempotency Pattern

```typescript
// Middleware
async function idempotencyMiddleware(req, res, next) {
  const idempotencyKey = req.headers['idempotency-key'];

  if (!idempotencyKey) {
    return next();
  }

  const cached = await redis.get(`idempotency:${idempotencyKey}`);
  if (cached) {
    return res.json(JSON.parse(cached));
  }

  // Store response after processing
  const originalJson = res.json.bind(res);
  res.json = (data) => {
    redis.setex(`idempotency:${idempotencyKey}`, 86400, JSON.stringify(data));
    return originalJson(data);
  };

  next();
}

// Consumer idempotency
class OrderConsumer {
  async consume(message: OrderMessage): Promise<void> {
    const messageId = message.headers.messageId;

    // Check if already processed
    const processed = await redis.get(`processed:${messageId}`);
    if (processed) {
      return; // Skip duplicate
    }

    // Process with lock
    const lock = await redlock.acquire(`lock:${messageId}`, 30000);
    try {
      await this.processOrder(message);
      await redis.setex(`processed:${messageId}`, 86400, '1');
    } finally {
      await lock.release();
    }
  }
}
```

## CQRS Implementation

```typescript
// Command Side
class OrderCommandHandler {
  async handle(command: CreateOrderCommand): Promise<void> {
    const order = Order.create(command);
    await this.writeRepository.save(order);

    // Publish event for read model
    await this.eventBus.publish(new OrderCreatedEvent(order));
  }
}

// Query Side
class OrderQueryHandler {
  async handle(query: GetOrderQuery): Promise<OrderReadModel> {
    return await this.readRepository.findById(query.orderId);
  }
}

// Event Handler (updates read model)
class OrderProjection {
  @EventHandler(OrderCreatedEvent)
  async onOrderCreated(event: OrderCreatedEvent): Promise<void> {
    await this.readRepository.upsert({
      id: event.orderId,
      status: event.status,
      customerName: event.customerName,
      totalAmount: event.totalAmount,
      // Denormalized for fast reads
    });
  }
}
```
