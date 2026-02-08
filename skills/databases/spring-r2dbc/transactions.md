# Reactive Transactions & Relations

## Declarative Transactions (@Transactional)

```java
@Service
@RequiredArgsConstructor
@Slf4j
public class OrderService {

    private final OrderRepository orderRepository;
    private final OrderItemRepository orderItemRepository;
    private final ProductRepository productRepository;

    @Transactional
    public Mono<Order> createOrder(CreateOrderRequest request) {
        return validateProducts(request.items())
            .then(calculateTotal(request.items()))
            .flatMap(total -> {
                Order order = new Order(
                    null,
                    request.customerId(),
                    total,
                    OrderStatus.PENDING,
                    null
                );
                return orderRepository.save(order);
            })
            .flatMap(order -> saveOrderItems(order.id(), request.items())
                .then(Mono.just(order)));
    }

    private Mono<Void> validateProducts(List<OrderItemRequest> items) {
        return Flux.fromIterable(items)
            .flatMap(item -> productRepository.findById(item.productId())
                .switchIfEmpty(Mono.error(new ProductNotFoundException(item.productId())))
                .filter(Product::isActive)
                .switchIfEmpty(Mono.error(new ProductNotAvailableException(item.productId()))))
            .then();
    }

    private Mono<BigDecimal> calculateTotal(List<OrderItemRequest> items) {
        return Flux.fromIterable(items)
            .flatMap(item -> productRepository.findById(item.productId())
                .map(product -> product.getPrice().multiply(BigDecimal.valueOf(item.quantity()))))
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private Flux<OrderItem> saveOrderItems(Long orderId, List<OrderItemRequest> items) {
        return Flux.fromIterable(items)
            .flatMap(item -> productRepository.findById(item.productId())
                .map(product -> new OrderItem(
                    null, orderId, product.getId(),
                    item.quantity(), product.getPrice()
                )))
            .collectList()
            .flatMapMany(orderItemRepository::saveAll);
    }
}
```

---

## Programmatic Transactions (TransactionalOperator)

```java
@Configuration
public class R2dbcConfig {

    @Bean
    public TransactionalOperator transactionalOperator(ReactiveTransactionManager txManager) {
        return TransactionalOperator.create(txManager);
    }
}
```

```java
@Service
@RequiredArgsConstructor
public class OrderService {

    private final TransactionalOperator transactionalOperator;

    public Mono<Order> createOrderProgrammatic(CreateOrderRequest request) {
        return validateProducts(request.items())
            .then(calculateTotal(request.items()))
            .flatMap(total -> {
                Order order = new Order(null, request.customerId(), total, OrderStatus.PENDING, null);
                return orderRepository.save(order)
                    .flatMap(savedOrder -> saveOrderItems(savedOrder.id(), request.items())
                        .then(Mono.just(savedOrder)));
            })
            .as(transactionalOperator::transactional)
            .doOnError(e -> log.error("Order creation failed", e));
    }
}
```

---

## Conditional Rollback

```java
@Transactional
public Mono<Order> updateOrderStatus(Long orderId, OrderStatus newStatus) {
    return orderRepository.findById(orderId)
        .switchIfEmpty(Mono.error(new OrderNotFoundException(orderId)))
        .flatMap(order -> {
            if (!isValidStatusTransition(order.status(), newStatus)) {
                return Mono.error(new InvalidStatusTransitionException(order.status(), newStatus));
            }
            return orderRepository.save(order.withStatus(newStatus));
        });
}

private boolean isValidStatusTransition(OrderStatus from, OrderStatus to) {
    return switch (from) {
        case PENDING -> to == OrderStatus.CONFIRMED || to == OrderStatus.CANCELLED;
        case CONFIRMED -> to == OrderStatus.SHIPPED || to == OrderStatus.CANCELLED;
        case SHIPPED -> to == OrderStatus.DELIVERED;
        case DELIVERED, CANCELLED -> false;
    };
}
```

---

## Relations (One-to-Many, Many-to-One)

R2DBC doesn't support automatic relations like JPA. Manage them manually:

```java
// Entity with relation ID
@Table("order_items")
public record OrderItem(
    @Id Long id,
    @Column("order_id") Long orderId,
    @Column("product_id") Long productId,
    Integer quantity,
    BigDecimal unitPrice
) {}

// Aggregate with loaded data
public record OrderAggregate(
    Order order,
    List<OrderItemDetail> items,
    Customer customer
) {}

public record OrderItemDetail(
    OrderItem item,
    Product product
) {}
```

```java
@Service
@RequiredArgsConstructor
public class OrderAggregateService {

    private final OrderRepository orderRepository;
    private final OrderItemRepository orderItemRepository;
    private final ProductRepository productRepository;
    private final CustomerRepository customerRepository;

    public Mono<OrderAggregate> getOrderAggregate(Long orderId) {
        Mono<Order> orderMono = orderRepository.findById(orderId)
            .switchIfEmpty(Mono.error(new OrderNotFoundException(orderId)))
            .cache();

        Mono<List<OrderItemDetail>> itemsMono = orderMono
            .flatMapMany(order -> orderItemRepository.findByOrderId(order.id()))
            .flatMap(item -> productRepository.findById(item.productId())
                .map(product -> new OrderItemDetail(item, product)))
            .collectList();

        Mono<Customer> customerMono = orderMono
            .flatMap(order -> customerRepository.findById(order.customerId()));

        return Mono.zip(orderMono, itemsMono, customerMono)
            .map(tuple -> new OrderAggregate(tuple.getT1(), tuple.getT2(), tuple.getT3()));
    }
}
```

---

## Batch Loading to Avoid N+1

```java
public Flux<OrderAggregate> getOrdersWithDetails(List<Long> orderIds) {
    return orderRepository.findAllById(orderIds)
        .collectList()
        .flatMapMany(orders -> {
            Set<Long> customerIds = orders.stream()
                .map(Order::customerId)
                .collect(Collectors.toSet());

            Mono<Map<Long, Customer>> customersMap = customerRepository
                .findAllById(customerIds)
                .collectMap(Customer::id);

            Mono<Map<Long, List<OrderItemDetail>>> itemsMap = orderItemRepository
                .findByOrderIdIn(orderIds)
                .flatMap(item -> productRepository.findById(item.productId())
                    .map(product -> new OrderItemDetail(item, product)))
                .collectMultimap(detail -> detail.item().orderId())
                .map(map -> map.entrySet().stream()
                    .collect(Collectors.toMap(
                        Map.Entry::getKey,
                        e -> new ArrayList<>(e.getValue())
                    )));

            return Mono.zip(Mono.just(orders), customersMap, itemsMap)
                .flatMapMany(tuple -> Flux.fromIterable(tuple.getT1())
                    .map(order -> new OrderAggregate(
                        order,
                        tuple.getT3().getOrDefault(order.id(), List.of()),
                        tuple.getT2().get(order.customerId())
                    )));
        });
}
```

---

## Pagination

```java
public interface ProductRepository extends R2dbcRepository<Product, Long> {

    Flux<Product> findByActiveTrue(Pageable pageable);

    @Query("SELECT COUNT(*) FROM products WHERE active = true")
    Mono<Long> countActive();
}

@Service
@RequiredArgsConstructor
public class ProductService {

    private final ProductRepository productRepository;

    public Mono<Page<Product>> getActiveProducts(int page, int size) {
        Pageable pageable = PageRequest.of(page, size, Sort.by("createdAt").descending());

        Mono<List<Product>> contentMono = productRepository
            .findByActiveTrue(pageable)
            .collectList();

        Mono<Long> countMono = productRepository.countActive();

        return Mono.zip(contentMono, countMono)
            .map(tuple -> new PageImpl<>(tuple.getT1(), pageable, tuple.getT2()));
    }

    // Slice (without total count - more efficient)
    public Mono<Slice<Product>> getActiveProductsSlice(int page, int size) {
        Pageable pageable = PageRequest.of(page, size + 1); // +1 to determine hasNext

        return productRepository.findByActiveTrue(pageable)
            .collectList()
            .map(products -> {
                boolean hasNext = products.size() > size;
                List<Product> content = hasNext
                    ? products.subList(0, size)
                    : products;
                return new SliceImpl<>(content, PageRequest.of(page, size), hasNext);
            });
    }
}
```
