---
name: java-security
description: |
  Java and Spring Boot security patterns. Covers Spring Security, dependency auditing,
  secure coding practices, and OWASP for Java ecosystem.

  USE WHEN: user works with "Java", "Spring Boot", "Spring Security", asks about "Java vulnerabilities", "Maven security", "Gradle security", "Java injection", "Java authentication"

  DO NOT USE FOR: general OWASP concepts - use `owasp` or `owasp-top-10` instead, Node.js/Python security - use language-specific skills
allowed-tools: Read, Grep, Glob, Bash
---
# Java Security - Quick Reference

## When NOT to Use This Skill
- **General OWASP concepts** - Use `owasp` or `owasp-top-10` skill
- **Node.js/TypeScript security** - Use base security skills
- **Python security** - Use `python-security` skill
- **Secrets management** - Use `secrets-management` skill

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `spring-boot` for Spring Security documentation.

## Dependency Auditing

```bash
# Maven - OWASP Dependency Check
mvn dependency-check:check

# Maven - check for updates
mvn versions:display-dependency-updates

# Gradle - dependency check plugin
./gradlew dependencyCheckAnalyze

# Snyk for Java
snyk test --all-projects
```

### Maven Plugin Configuration

```xml
<plugin>
    <groupId>org.owasp</groupId>
    <artifactId>dependency-check-maven</artifactId>
    <version>9.0.9</version>
    <configuration>
        <failBuildOnCVSS>7</failBuildOnCVSS>
        <suppressionFile>dependency-check-suppression.xml</suppressionFile>
    </configuration>
</plugin>
```

## Spring Security Configuration

### Basic Security Config (Spring Boot 3.x)

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
            .csrf(csrf -> csrf
                .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
            )
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .headers(headers -> headers
                .contentSecurityPolicy(csp ->
                    csp.policyDirectives("default-src 'self'; script-src 'self'"))
                .frameOptions(frame -> frame.deny())
                .xssProtection(xss -> xss.disable()) // Use CSP instead
                .contentTypeOptions(Customizer.withDefaults())
            )
            .sessionManagement(session -> session
                .sessionCreationPolicy(SessionCreationPolicy.STATELESS)
            )
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/public/**").permitAll()
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated()
            )
            .build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(List.of("https://myapp.com"));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE"));
        config.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return source;
    }
}
```

### Password Encoding

```java
@Bean
public PasswordEncoder passwordEncoder() {
    // BCrypt with strength 12 (recommended)
    return new BCryptPasswordEncoder(12);
}

// Usage
String encoded = passwordEncoder.encode(rawPassword);
boolean matches = passwordEncoder.matches(rawPassword, encoded);
```

### Method-Level Security

```java
@Configuration
@EnableMethodSecurity(prePostEnabled = true)
public class MethodSecurityConfig {}

// Usage in service
@PreAuthorize("hasRole('ADMIN')")
public void deleteUser(Long id) { ... }

@PreAuthorize("#userId == authentication.principal.id or hasRole('ADMIN')")
public User getUser(Long userId) { ... }

@PostAuthorize("returnObject.owner == authentication.principal.username")
public Document getDocument(Long id) { ... }
```

## SQL Injection Prevention

### JPA/Hibernate - Safe

```java
// SAFE - Named parameters
@Query("SELECT u FROM User u WHERE u.email = :email")
Optional<User> findByEmail(@Param("email") String email);

// SAFE - Criteria API
CriteriaBuilder cb = em.getCriteriaBuilder();
CriteriaQuery<User> query = cb.createQuery(User.class);
Root<User> root = query.from(User.class);
query.where(cb.equal(root.get("email"), email));

// SAFE - Spring Data JPA method names
Optional<User> findByEmailAndStatus(String email, Status status);
```

### JPA/Hibernate - UNSAFE

```java
// UNSAFE - String concatenation
@Query("SELECT u FROM User u WHERE u.email = '" + email + "'")  // NEVER!

// UNSAFE - Native query without parameters
@Query(value = "SELECT * FROM users WHERE email = " + email, nativeQuery = true)  // NEVER!
```

### JDBC Template - Safe

```java
// SAFE - Parameterized query
jdbcTemplate.query(
    "SELECT * FROM users WHERE email = ? AND status = ?",
    new Object[]{email, status},
    userRowMapper
);

// SAFE - Named parameters
namedParameterJdbcTemplate.query(
    "SELECT * FROM users WHERE email = :email",
    Map.of("email", email),
    userRowMapper
);
```

## XSS Prevention

### Thymeleaf (Auto-escaping)

```html
<!-- SAFE - Auto-escaped -->
<p th:text="${userInput}"></p>

<!-- UNSAFE - Unescaped HTML -->
<p th:utext="${userInput}"></p>  <!-- Avoid if possible -->
```

### API Response Sanitization

```java
// Use OWASP Java HTML Sanitizer
import org.owasp.html.PolicyFactory;
import org.owasp.html.Sanitizers;

PolicyFactory policy = Sanitizers.FORMATTING.and(Sanitizers.LINKS);
String safeHtml = policy.sanitize(userInput);
```

## Authentication Best Practices

### JWT Configuration

```java
@Component
public class JwtTokenProvider {

    @Value("${jwt.secret}")
    private String secret;

    @Value("${jwt.expiration:3600000}") // 1 hour
    private long expiration;

    public String generateToken(Authentication auth) {
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + expiration);

        return Jwts.builder()
            .setSubject(auth.getName())
            .setIssuedAt(now)
            .setExpiration(expiryDate)
            .signWith(Keys.hmacShaKeyFor(secret.getBytes()), SignatureAlgorithm.HS512)
            .compact();
    }

    public boolean validateToken(String token) {
        try {
            Jwts.parserBuilder()
                .setSigningKey(Keys.hmacShaKeyFor(secret.getBytes()))
                .build()
                .parseClaimsJws(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }
}
```

### Rate Limiting with Resilience4j

```java
@RateLimiter(name = "loginRateLimiter", fallbackMethod = "loginFallback")
public AuthResponse login(LoginRequest request) {
    // login logic
}

public AuthResponse loginFallback(LoginRequest request, RequestNotPermitted ex) {
    throw new TooManyRequestsException("Too many login attempts. Try again later.");
}
```

```yaml
# application.yml
resilience4j:
  ratelimiter:
    instances:
      loginRateLimiter:
        limitForPeriod: 5
        limitRefreshPeriod: 15m
        timeoutDuration: 0
```

## Input Validation

```java
public record CreateUserRequest(
    @NotBlank
    @Email
    @Size(max = 255)
    String email,

    @NotBlank
    @Size(min = 12, max = 128)
    @Pattern(regexp = "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&]).*$",
             message = "Password must contain uppercase, lowercase, number and special char")
    String password,

    @NotBlank
    @Size(min = 2, max = 100)
    @Pattern(regexp = "^[a-zA-Z\\s-']+$")
    String name
) {}

@PostMapping("/users")
public ResponseEntity<User> createUser(@Valid @RequestBody CreateUserRequest request) {
    // request is already validated
}
```

## Secure File Upload

```java
@PostMapping("/upload")
public ResponseEntity<String> uploadFile(@RequestParam("file") MultipartFile file) {
    // Validate file type
    String contentType = file.getContentType();
    if (!ALLOWED_TYPES.contains(contentType)) {
        throw new InvalidFileTypeException("File type not allowed");
    }

    // Validate file size (also configure in application.yml)
    if (file.getSize() > MAX_FILE_SIZE) {
        throw new FileTooLargeException("File exceeds maximum size");
    }

    // Generate safe filename
    String originalName = file.getOriginalFilename();
    String safeName = UUID.randomUUID() + getExtension(originalName);

    // Store outside web root
    Path destination = uploadPath.resolve(safeName);
    Files.copy(file.getInputStream(), destination);

    return ResponseEntity.ok(safeName);
}
```

## Logging Security Events

```java
@Slf4j
@Component
public class SecurityEventLogger {

    public void logLoginAttempt(String username, boolean success, HttpServletRequest request) {
        log.info("Login attempt: user={}, success={}, ip={}, userAgent={}",
            username,
            success,
            request.getRemoteAddr(),
            request.getHeader("User-Agent")
        );
    }

    public void logAccessDenied(String username, String resource, HttpServletRequest request) {
        log.warn("Access denied: user={}, resource={}, ip={}",
            username,
            resource,
            request.getRemoteAddr()
        );
    }

    // NEVER log sensitive data
    // log.info("Password: {}", password);  // NEVER!
    // log.info("Token: {}", jwt);          // NEVER!
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| `@Query` with string concat | SQL injection | Use named parameters `:param` |
| `th:utext` for user content | XSS vulnerability | Use `th:text` (auto-escaped) |
| MD5/SHA1 for passwords | Easily cracked | Use BCrypt with strength 12+ |
| Storing JWT secret in code | Secret exposure | Use environment variables |
| `permitAll()` for sensitive endpoints | Unauthorized access | Define explicit auth rules |
| Disabling CSRF for stateful apps | CSRF attacks | Keep CSRF enabled for sessions |
| Catching `Exception` silently | Hides security issues | Log and handle specifically |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| 403 on valid request | CSRF token missing | Include CSRF token in requests |
| 401 with valid JWT | Token expired or wrong key | Check expiration and secret key |
| CORS error in browser | Missing CORS config | Add origin to `allowedOrigins` |
| Password validation fails | BCrypt version mismatch | Use same encoder version |
| Method security not working | `@EnableMethodSecurity` missing | Add annotation to config class |
| Dependency check fails build | CVSS threshold too low | Adjust `failBuildOnCVSS` or suppress |

## Security Scanning Commands

```bash
# OWASP Dependency Check
mvn dependency-check:check
./gradlew dependencyCheckAnalyze

# SpotBugs with Security Plugin
mvn spotbugs:check -Dspotbugs.plugins=com.h3xstream.findsecbugs:findsecbugs-plugin:1.12.0

# Snyk
snyk test --all-projects

# SonarQube (if configured)
mvn sonar:sonar -Dsonar.host.url=http://localhost:9000
```

## Related Skills
- [OWASP Top 10:2025](../owasp-top-10/SKILL.md)
- [OWASP General](../owasp/SKILL.md)
- [Secrets Management](../secrets-management/SKILL.md)
- [Supply Chain Security](../supply-chain/SKILL.md)
