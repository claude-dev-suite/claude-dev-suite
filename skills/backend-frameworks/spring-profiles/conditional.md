# Conditional Beans

## @ConditionalOnProperty

```java
@Configuration
public class FeatureConfig {

    // Bean created only if property is true
    @Bean
    @ConditionalOnProperty(name = "feature.email.enabled", havingValue = "true")
    public EmailService emailService() {
        return new RealEmailService();
    }

    // Bean created if property is false or absent
    @Bean
    @ConditionalOnProperty(
        name = "feature.email.enabled",
        havingValue = "false",
        matchIfMissing = true
    )
    public EmailService noOpEmailService() {
        return new NoOpEmailService();
    }

    // Bean created if property exists (any value)
    @Bean
    @ConditionalOnProperty(name = "app.custom-datasource.url")
    public DataSource customDataSource(
            @Value("${app.custom-datasource.url}") String url) {
        return DataSourceBuilder.create().url(url).build();
    }
}
```

---

## @ConditionalOnProfile

```java
@Configuration
public class ProfileConditionalConfig {

    @Bean
    @Profile("dev")
    public CacheManager devCacheManager() {
        return new ConcurrentMapCacheManager();
    }

    @Bean
    @Profile("prod")
    public CacheManager prodCacheManager(RedisConnectionFactory factory) {
        return RedisCacheManager.create(factory);
    }

    @Bean
    @Profile("!test")  // All except test
    public AuditService auditService() {
        return new RealAuditService();
    }
}
```

---

## @ConditionalOnMissingBean

```java
@Configuration
public class DefaultConfig {

    @Bean
    @ConditionalOnMissingBean(UserService.class)
    public UserService defaultUserService() {
        return new DefaultUserService();
    }
}

// In another module - overrides the default
@Configuration
@Profile("custom")
public class CustomConfig {

    @Bean
    public UserService customUserService() {
        return new CustomUserService();
    }
}
```

---

## Custom Condition

```java
public class OnFeatureFlagCondition implements Condition {

    @Override
    public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
        String featureName = (String) metadata.getAnnotationAttributes(
            ConditionalOnFeatureFlag.class.getName()
        ).get("value");

        String enabled = context.getEnvironment()
            .getProperty("feature." + featureName + ".enabled", "false");

        return Boolean.parseBoolean(enabled);
    }
}

@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@Conditional(OnFeatureFlagCondition.class)
public @interface ConditionalOnFeatureFlag {
    String value();
}

// Usage
@Bean
@ConditionalOnFeatureFlag("new-algorithm")
public AlgorithmService newAlgorithm() {
    return new NewAlgorithmService();
}
```

---

## Configuration Validation

```java
@ConfigurationProperties(prefix = "app")
@Validated
public class ValidatedAppProperties {

    @NotBlank(message = "App name is required")
    private String name;

    @Email(message = "Admin email must be valid")
    private String adminEmail;

    @Min(value = 1, message = "Min threads must be at least 1")
    @Max(value = 100, message = "Max threads cannot exceed 100")
    private int maxThreads = 10;

    @Pattern(regexp = "^[A-Z]{3}$", message = "Currency must be 3 uppercase letters")
    private String defaultCurrency = "USD";

    @Valid
    @NotNull
    private Server server = new Server();

    public static class Server {
        @NotBlank
        private String host;

        @Min(1)
        @Max(65535)
        private int port;

        @DurationMin(seconds = 1)
        @DurationMax(minutes = 5)
        private Duration timeout = Duration.ofSeconds(30);
    }
}

// Custom validator
@Constraint(validatedBy = ValidPortRangeValidator.class)
@Target({ElementType.FIELD, ElementType.PARAMETER})
@Retention(RetentionPolicy.RUNTIME)
public @interface ValidPortRange {
    String message() default "Port must be in valid range";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
    int min() default 1;
    int max() default 65535;
}
```

---

## Testing Configuration

```java
// Test with specific profile
@SpringBootTest
@ActiveProfiles("test")
class ServiceTest {
    // Uses application-test.yml
}

// Test with properties override
@SpringBootTest(properties = {
    "app.feature.enabled=true",
    "app.timeout=5000"
})
class FeatureTest {}

// Test with @TestPropertySource
@SpringBootTest
@TestPropertySource(locations = "classpath:test-config.properties")
class ConfiguredTest {}

// Test with @TestPropertySource inline
@SpringBootTest
@TestPropertySource(properties = {
    "app.name=test-app",
    "app.debug=true"
})
class InlineConfigTest {}

// Test ConfigurationProperties
@SpringBootTest
class ConfigurationPropertiesTest {

    @Autowired
    private AppProperties appProperties;

    @Test
    void shouldLoadProperties() {
        assertThat(appProperties.getName()).isNotBlank();
        assertThat(appProperties.getSecurity().getJwtExpiration()).isPositive();
    }
}

// Test with Environment
@SpringBootTest
class EnvironmentTest {

    @Autowired
    private Environment environment;

    @Test
    void shouldHaveTestProfile() {
        assertThat(environment.getActiveProfiles()).contains("test");
    }
}
```
