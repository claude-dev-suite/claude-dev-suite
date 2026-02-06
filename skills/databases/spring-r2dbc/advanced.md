# Advanced Configuration

## Auditing

```java
@Configuration
@EnableR2dbcAuditing
public class R2dbcAuditingConfig {

    @Bean
    public ReactiveAuditorAware<String> auditorAware() {
        return () -> ReactiveSecurityContextHolder.getContext()
            .map(SecurityContext::getAuthentication)
            .filter(Authentication::isAuthenticated)
            .map(Authentication::getName)
            .switchIfEmpty(Mono.just("system"));
    }
}
```

```java
@Table("products")
public class Product {

    @Id
    private Long id;

    private String name;

    @CreatedDate
    private Instant createdAt;

    @LastModifiedDate
    private Instant updatedAt;

    @CreatedBy
    private String createdBy;

    @LastModifiedBy
    private String updatedBy;

    @Version
    private Long version;  // Optimistic locking
}
```

---

## Custom Converters

```java
@Configuration
public class R2dbcConvertersConfig {

    @Bean
    public R2dbcCustomConversions r2dbcCustomConversions(DatabaseClient databaseClient) {
        List<Object> converters = new ArrayList<>();

        // JSON to Object
        converters.add(new JsonToMapConverter());
        converters.add(new MapToJsonConverter());

        // Enum converters
        converters.add(new OrderStatusReadConverter());
        converters.add(new OrderStatusWriteConverter());

        return R2dbcCustomConversions.of(
            PostgresDialect.INSTANCE,
            converters
        );
    }
}

// JSON <-> Map conversion (per colonne JSONB PostgreSQL)
@ReadingConverter
public class JsonToMapConverter implements Converter<io.r2dbc.postgresql.codec.Json, Map<String, Object>> {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public Map<String, Object> convert(io.r2dbc.postgresql.codec.Json source) {
        try {
            return objectMapper.readValue(source.asString(), new TypeReference<>() {});
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Failed to parse JSON", e);
        }
    }
}

@WritingConverter
public class MapToJsonConverter implements Converter<Map<String, Object>, io.r2dbc.postgresql.codec.Json> {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public io.r2dbc.postgresql.codec.Json convert(Map<String, Object> source) {
        try {
            return io.r2dbc.postgresql.codec.Json.of(objectMapper.writeValueAsString(source));
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Failed to serialize JSON", e);
        }
    }
}

// Enum converters
@ReadingConverter
public class OrderStatusReadConverter implements Converter<String, OrderStatus> {
    @Override
    public OrderStatus convert(String source) {
        return OrderStatus.valueOf(source);
    }
}

@WritingConverter
public class OrderStatusWriteConverter implements Converter<OrderStatus, String> {
    @Override
    public String convert(OrderStatus source) {
        return source.name();
    }
}
```

---

## Connection Pool Configuration

```yaml
spring:
  r2dbc:
    url: r2dbc:pool:postgresql://localhost:5432/mydb
    username: ${DB_USERNAME}
    password: ${DB_PASSWORD}
    pool:
      enabled: true
      initial-size: 10
      max-size: 50
      max-idle-time: 30m
      max-create-connection-time: 30s
      max-acquire-time: 30s
      validation-query: SELECT 1
```

```java
@Configuration
public class R2dbcPoolConfig {

    @Bean
    public ConnectionFactory connectionFactory() {
        return ConnectionFactories.get(ConnectionFactoryOptions.builder()
            .option(ConnectionFactoryOptions.DRIVER, "pool")
            .option(ConnectionFactoryOptions.PROTOCOL, "postgresql")
            .option(ConnectionFactoryOptions.HOST, "localhost")
            .option(ConnectionFactoryOptions.PORT, 5432)
            .option(ConnectionFactoryOptions.DATABASE, "mydb")
            .option(ConnectionFactoryOptions.USER, "user")
            .option(ConnectionFactoryOptions.PASSWORD, "password")
            // Pool options
            .option(PoolingConnectionFactoryProvider.MAX_SIZE, 50)
            .option(PoolingConnectionFactoryProvider.INITIAL_SIZE, 10)
            .option(PoolingConnectionFactoryProvider.MAX_IDLE_TIME, Duration.ofMinutes(30))
            .option(PoolingConnectionFactoryProvider.VALIDATION_QUERY, "SELECT 1")
            .build());
    }
}
```

---

## Schema Management

```java
@Configuration
public class R2dbcSchemaConfig {

    @Bean
    public ConnectionFactoryInitializer initializer(ConnectionFactory connectionFactory) {
        ConnectionFactoryInitializer initializer = new ConnectionFactoryInitializer();
        initializer.setConnectionFactory(connectionFactory);

        CompositeDatabasePopulator populator = new CompositeDatabasePopulator();
        populator.addPopulators(new ResourceDatabasePopulator(new ClassPathResource("schema.sql")));
        populator.addPopulators(new ResourceDatabasePopulator(new ClassPathResource("data.sql")));

        initializer.setDatabasePopulator(populator);
        return initializer;
    }
}
```

```sql
-- schema.sql
CREATE TABLE IF NOT EXISTS products (
    id BIGSERIAL PRIMARY KEY,
    product_name VARCHAR(255) NOT NULL,
    description TEXT,
    price NUMERIC(10, 2) NOT NULL,
    category_id BIGINT REFERENCES categories(id),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    version BIGINT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
```

---

## Testing

### With Testcontainers

```java
@DataR2dbcTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
class ProductRepositoryTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15")
        .withDatabaseName("testdb")
        .withUsername("test")
        .withPassword("test");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.r2dbc.url", () ->
            "r2dbc:postgresql://" + postgres.getHost() + ":" +
            postgres.getMappedPort(5432) + "/testdb");
        registry.add("spring.r2dbc.username", postgres::getUsername);
        registry.add("spring.r2dbc.password", postgres::getPassword);
    }

    @Autowired
    private ProductRepository productRepository;

    @Test
    void findByActiveTrue_shouldReturnOnlyActiveProducts() {
        // Given
        Product active = Product.create("Active", "desc", BigDecimal.TEN);
        active.setActive(true);

        Product inactive = Product.create("Inactive", "desc", BigDecimal.TEN);
        inactive.setActive(false);

        productRepository.saveAll(List.of(active, inactive)).blockLast();

        // When & Then
        StepVerifier.create(productRepository.findByActiveTrue())
            .expectNextMatches(p -> p.getName().equals("Active"))
            .verifyComplete();
    }

    @Test
    void save_shouldGenerateId() {
        Product product = Product.create("Test", "desc", BigDecimal.valueOf(99.99));

        StepVerifier.create(productRepository.save(product))
            .assertNext(saved -> {
                assertThat(saved.getId()).isNotNull();
                assertThat(saved.getName()).isEqualTo("Test");
            })
            .verifyComplete();
    }
}
```

### With H2 In-Memory

```java
@DataR2dbcTest
class ProductRepositoryH2Test {

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private DatabaseClient databaseClient;

    @BeforeEach
    void setUp() {
        databaseClient.sql("""
            CREATE TABLE IF NOT EXISTS products (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                product_name VARCHAR(255),
                description TEXT,
                price DECIMAL(10,2),
                category_id BIGINT,
                active BOOLEAN DEFAULT true,
                created_at TIMESTAMP,
                updated_at TIMESTAMP
            )
            """)
            .then()
            .block();
    }

    @Test
    void crudOperations() {
        Product product = Product.create("Test", "desc", BigDecimal.TEN);

        // Create
        Product saved = productRepository.save(product).block();
        assertThat(saved.getId()).isNotNull();

        // Read
        Product found = productRepository.findById(saved.getId()).block();
        assertThat(found.getName()).isEqualTo("Test");

        // Update
        found.setName("Updated");
        Product updated = productRepository.save(found).block();
        assertThat(updated.getName()).isEqualTo("Updated");

        // Delete
        productRepository.deleteById(saved.getId()).block();
        assertThat(productRepository.findById(saved.getId()).block()).isNull();
    }
}
```

---

## WebFlux Controller Integration

```java
@RestController
@RequestMapping("/api/products")
@RequiredArgsConstructor
public class ProductController {

    private final ProductService productService;

    @GetMapping
    public Flux<ProductResponse> getAllProducts(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return productService.getActiveProducts(page, size)
            .flatMapMany(p -> Flux.fromIterable(p.getContent()))
            .map(ProductResponse::from);
    }

    @GetMapping("/{id}")
    public Mono<ResponseEntity<ProductResponse>> getProduct(@PathVariable Long id) {
        return productService.getProduct(id)
            .map(ProductResponse::from)
            .map(ResponseEntity::ok)
            .onErrorResume(ProductNotFoundException.class,
                e -> Mono.just(ResponseEntity.notFound().build()));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Mono<ProductResponse> createProduct(@Valid @RequestBody CreateProductRequest request) {
        return productService.createProduct(request)
            .map(ProductResponse::from);
    }

    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ProductResponse> streamProducts() {
        return productService.getAllActiveProducts()
            .map(ProductResponse::from)
            .delayElements(Duration.ofMillis(100));
    }
}
```
