# Spring Data Redis - Advanced Patterns

## Hash Operations

```java
public void saveUser(User user) {
    String key = "user:" + user.getId();
    redisTemplate.opsForHash().putAll(key, Map.of(
        "name", user.getName(),
        "email", user.getEmail(),
        "status", user.getStatus()
    ));
    redisTemplate.expire(key, Duration.ofHours(24));
}

public User getUser(String userId) {
    String key = "user:" + userId;
    Map<Object, Object> entries = redisTemplate.opsForHash().entries(key);
    if (entries.isEmpty()) return null;

    return User.builder()
        .id(userId)
        .name((String) entries.get("name"))
        .email((String) entries.get("email"))
        .status((String) entries.get("status"))
        .build();
}

public void updateUserField(String userId, String field, String value) {
    redisTemplate.opsForHash().put("user:" + userId, field, value);
}
```

## List Operations (Queue/Stack)

```java
// Queue (FIFO)
public void enqueue(String queueName, Object item) {
    redisTemplate.opsForList().rightPush(queueName, item);
}

public Object dequeue(String queueName) {
    return redisTemplate.opsForList().leftPop(queueName);
}

// Blocking dequeue
public Object blockingDequeue(String queueName, Duration timeout) {
    return redisTemplate.opsForList().leftPop(queueName, timeout);
}

// Stack (LIFO)
public void push(String stackName, Object item) {
    redisTemplate.opsForList().leftPush(stackName, item);
}

public Object pop(String stackName) {
    return redisTemplate.opsForList().leftPop(stackName);
}
```

## Set Operations

```java
// Add to set
public void addToSet(String key, Object... values) {
    redisTemplate.opsForSet().add(key, values);
}

// Check membership
public boolean isMember(String key, Object value) {
    return Boolean.TRUE.equals(redisTemplate.opsForSet().isMember(key, value));
}

// Get all members
public Set<Object> getSetMembers(String key) {
    return redisTemplate.opsForSet().members(key);
}

// Remove from set
public void removeFromSet(String key, Object... values) {
    redisTemplate.opsForSet().remove(key, values);
}
```

## Sorted Set (Leaderboard)

```java
// Leaderboard
public void addScore(String leaderboard, String player, double score) {
    redisTemplate.opsForZSet().add(leaderboard, player, score);
}

public void incrementScore(String leaderboard, String player, double delta) {
    redisTemplate.opsForZSet().incrementScore(leaderboard, player, delta);
}

public Set<Object> getTopPlayers(String leaderboard, int count) {
    return redisTemplate.opsForZSet().reverseRange(leaderboard, 0, count - 1);
}

public Long getRank(String leaderboard, String player) {
    return redisTemplate.opsForZSet().reverseRank(leaderboard, player);
}

public Double getScore(String leaderboard, String player) {
    return redisTemplate.opsForZSet().score(leaderboard, player);
}
```

## Repository Pattern (@RedisHash)

```java
@RedisHash(value = "product", timeToLive = 3600)
public class Product {
    @Id
    private String id;

    @Indexed
    private String category;

    @Indexed
    private String name;

    private BigDecimal price;
    private Integer stock;

    @TimeToLive
    private Long expiration;
}

public interface ProductRepository extends CrudRepository<Product, String> {
    List<Product> findByCategory(String category);
    List<Product> findByName(String name);
}

@Service
@RequiredArgsConstructor
public class ProductService {

    private final ProductRepository productRepository;

    public Product save(Product product) {
        return productRepository.save(product);
    }

    public Optional<Product> findById(String id) {
        return productRepository.findById(id);
    }

    public List<Product> findByCategory(String category) {
        return productRepository.findByCategory(category);
    }
}
```

## Pub/Sub Configuration

```java
@Configuration
public class RedisPubSubConfig {

    @Bean
    public RedisMessageListenerContainer container(
            RedisConnectionFactory connectionFactory,
            MessageListenerAdapter listenerAdapter) {

        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(connectionFactory);
        container.addMessageListener(listenerAdapter, new PatternTopic("events.*"));
        container.addMessageListener(listenerAdapter, new ChannelTopic("notifications"));
        return container;
    }

    @Bean
    public MessageListenerAdapter listenerAdapter(RedisMessageSubscriber subscriber) {
        return new MessageListenerAdapter(subscriber, "handleMessage");
    }
}

@Service
public class RedisMessageSubscriber {

    public void handleMessage(String message, String channel) {
        log.info("Received message: {} from channel: {}", message, channel);
        // Process message
    }
}

@Service
@RequiredArgsConstructor
public class RedisMessagePublisher {

    private final RedisTemplate<String, Object> redisTemplate;

    public void publish(String channel, Object message) {
        redisTemplate.convertAndSend(channel, message);
    }
}
```

## Distributed Lock

```java
@Service
@RequiredArgsConstructor
public class DistributedLockService {

    private final StringRedisTemplate redisTemplate;

    public boolean acquireLock(String lockKey, String lockValue, Duration timeout) {
        return Boolean.TRUE.equals(
            redisTemplate.opsForValue().setIfAbsent(lockKey, lockValue, timeout));
    }

    public void releaseLock(String lockKey, String lockValue) {
        String script = """
            if redis.call('get', KEYS[1]) == ARGV[1] then
                return redis.call('del', KEYS[1])
            else
                return 0
            end
            """;

        redisTemplate.execute(
            new DefaultRedisScript<>(script, Long.class),
            List.of(lockKey),
            lockValue);
    }

    public <T> T executeWithLock(String lockKey, Duration timeout, Supplier<T> action) {
        String lockValue = UUID.randomUUID().toString();

        if (!acquireLock(lockKey, lockValue, timeout)) {
            throw new LockAcquisitionException("Could not acquire lock: " + lockKey);
        }

        try {
            return action.get();
        } finally {
            releaseLock(lockKey, lockValue);
        }
    }
}
```

## Testcontainers Integration

```java
@SpringBootTest
@Testcontainers
class RedisIntegrationTest {

    @Container
    @ServiceConnection
    static GenericContainer<?> redis = new GenericContainer<>("redis:7-alpine")
        .withExposedPorts(6379);

    @Autowired
    private RedisTemplate<String, Object> redisTemplate;

    @Test
    void shouldSetAndGetValue() {
        redisTemplate.opsForValue().set("test-key", "test-value");
        Object value = redisTemplate.opsForValue().get("test-key");
        assertThat(value).isEqualTo("test-value");
    }
}
```
