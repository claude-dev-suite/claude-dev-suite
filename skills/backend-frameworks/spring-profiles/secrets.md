# Secrets Management

## Environment Variables (Base)

```yaml
# application.yml
spring:
  datasource:
    password: ${DB_PASSWORD}

app:
  security:
    jwt-secret: ${JWT_SECRET}
    api-key: ${API_KEY}
```

---

## Encrypted Properties (Jasypt)

```xml
<!-- pom.xml -->
<dependency>
    <groupId>com.github.ulisesbocchio</groupId>
    <artifactId>jasypt-spring-boot-starter</artifactId>
    <version>3.0.5</version>
</dependency>
```

```yaml
# application.yml
jasypt:
  encryptor:
    password: ${JASYPT_PASSWORD}
    algorithm: PBEWithMD5AndDES

spring:
  datasource:
    password: ENC(encrypted_password_here)
```

```bash
# Encrypt a value
java -cp jasypt.jar org.jasypt.intf.cli.JasyptPBEStringEncryptionCLI \
  input="mypassword" password="master-password" algorithm=PBEWithMD5AndDES
```

---

## Spring Cloud Vault Integration

```java
@Configuration
@EnableConfigurationProperties
public class VaultConfig {

    @Bean
    public VaultTemplate vaultTemplate(VaultEndpoint endpoint, ClientAuthentication auth) {
        return new VaultTemplate(endpoint, auth);
    }
}

@ConfigurationProperties(prefix = "vault-secrets")
public class VaultSecrets {
    private String dbPassword;
    private String jwtSecret;
    private String apiKey;
    // Getters and setters
}
```

---

## Immutable Configuration

```java
@ConfigurationProperties(prefix = "app.mail")
public record MailProperties(
    @NotBlank String host,
    @Min(1) @Max(65535) int port,
    String username,
    String password,
    @DefaultValue("false") boolean starttls,
    @DefaultValue("smtp") String protocol,
    Map<String, String> properties
) {}
```

---

## Nested Configuration con Builder

```java
@ConfigurationProperties(prefix = "app.http-client")
@ConstructorBinding
public class HttpClientProperties {

    private final Duration connectTimeout;
    private final Duration readTimeout;
    private final Retry retry;
    private final Proxy proxy;

    public HttpClientProperties(
            @DefaultValue("5s") Duration connectTimeout,
            @DefaultValue("30s") Duration readTimeout,
            Retry retry,
            Proxy proxy) {
        this.connectTimeout = connectTimeout;
        this.readTimeout = readTimeout;
        this.retry = retry != null ? retry : new Retry(3, Duration.ofSeconds(1));
        this.proxy = proxy;
    }

    public record Retry(
        @DefaultValue("3") int maxAttempts,
        @DefaultValue("1s") Duration delay
    ) {}

    public record Proxy(
        String host,
        int port,
        String username,
        String password
    ) {}

    // Getters
}
```
