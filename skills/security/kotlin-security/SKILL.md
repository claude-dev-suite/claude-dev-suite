# Kotlin Security Skill

> **USE WHEN:** Securing Kotlin applications (backend/Android), reviewing code for vulnerabilities, or implementing security best practices.
> **DO NOT USE FOR:** Code quality issues (use kotlin-quality), general Kotlin patterns, UI/UX concerns.

## OWASP Top 10 for Kotlin

### A01: Broken Access Control

```kotlin
// Bad: No authorization check
@GetMapping("/orders/{id}")
fun getOrder(@PathVariable id: Long): Order {
    return orderRepository.findById(id).orElseThrow()
}

// Good: Ownership verification
@GetMapping("/orders/{id}")
fun getOrder(@PathVariable id: Long, @AuthenticationPrincipal user: UserDetails): Order {
    val order = orderRepository.findById(id).orElseThrow { NotFoundException() }

    if (order.userId != user.id && !user.hasRole("ADMIN")) {
        throw AccessDeniedException("Cannot access this order")
    }

    return order
}

// Good: Spring Security method security
@PreAuthorize("hasRole('ADMIN') or @orderSecurity.isOwner(#id, principal)")
@GetMapping("/orders/{id}")
fun getOrder(@PathVariable id: Long): Order {
    return orderRepository.findById(id).orElseThrow()
}

// Good: Repository-level filtering
interface OrderRepository : JpaRepository<Order, Long> {
    fun findByIdAndUserId(id: Long, userId: Long): Order?
}
```

### A03: Injection Prevention

```kotlin
// Bad: String concatenation in queries
fun findUser(name: String): List<User> {
    return entityManager
        .createQuery("SELECT u FROM User u WHERE u.name = '$name'")
        .resultList as List<User>
}

// Good: Parameterized queries
fun findUser(name: String): List<User> {
    return entityManager
        .createQuery("SELECT u FROM User u WHERE u.name = :name", User::class.java)
        .setParameter("name", name)
        .resultList
}

// Good: Spring Data JPA
interface UserRepository : JpaRepository<User, Long> {
    fun findByEmail(email: String): User?

    @Query("SELECT u FROM User u WHERE u.status = :status")
    fun findByStatus(@Param("status") status: UserStatus): List<User>
}

// Bad: Command injection
fun runCommand(userInput: String) {
    Runtime.getRuntime().exec("ls $userInput")
}

// Good: Avoid shell, use ProcessBuilder with array
fun listDirectory(directory: Path): List<String> {
    require(directory.isAbsolute && directory.exists()) { "Invalid directory" }

    return ProcessBuilder("ls", "-la", directory.toString())
        .redirectErrorStream(true)
        .start()
        .inputStream.bufferedReader().readLines()
}
```

### A04: Cryptographic Failures

```kotlin
// Bad: Weak hashing
val hash = MessageDigest.getInstance("MD5").digest(password.toByteArray())

// Good: BCrypt or Argon2
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder

val encoder = Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8()
val hash = encoder.encode(password)
val valid = encoder.matches(inputPassword, hash)

// Good: Secure random
import java.security.SecureRandom

val secureRandom = SecureRandom()
val token = ByteArray(32).also { secureRandom.nextBytes(it) }
val tokenString = Base64.getUrlEncoder().encodeToString(token)

// Good: AES-GCM encryption
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

class AesGcmEncryption(private val key: ByteArray) {
    private val cipher = Cipher.getInstance("AES/GCM/NoPadding")

    fun encrypt(plaintext: ByteArray): ByteArray {
        val iv = ByteArray(12).also { SecureRandom().nextBytes(it) }
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
        return iv + cipher.doFinal(plaintext)
    }

    fun decrypt(ciphertext: ByteArray): ByteArray {
        val iv = ciphertext.copyOfRange(0, 12)
        val encrypted = ciphertext.copyOfRange(12, ciphertext.size)
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
        return cipher.doFinal(encrypted)
    }
}
```

### A05: XSS Prevention (Kotlin/JS & Server Templates)

```kotlin
// Good: Thymeleaf auto-escaping (enabled by default)
// In template: th:text="${user.name}" - automatically escaped

// Manual escaping when needed
import org.springframework.web.util.HtmlUtils

val safeHtml = HtmlUtils.htmlEscape(userInput)

// CSP headers in Spring Security
@Bean
fun securityFilterChain(http: HttpSecurity): SecurityFilterChain {
    http.headers { headers ->
        headers.contentSecurityPolicy { csp ->
            csp.policyDirectives("default-src 'self'; script-src 'self'")
        }
    }
    return http.build()
}
```

### A07: Authentication Failures

```kotlin
// Good: Spring Security configuration
@Configuration
@EnableWebSecurity
class SecurityConfig {

    @Bean
    fun securityFilterChain(http: HttpSecurity): SecurityFilterChain {
        http
            .csrf { it.csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse()) }
            .sessionManagement { session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS)
            }
            .authorizeHttpRequests { auth ->
                auth
                    .requestMatchers("/api/public/**").permitAll()
                    .requestMatchers("/api/admin/**").hasRole("ADMIN")
                    .anyRequest().authenticated()
            }
            .oauth2ResourceServer { it.jwt() }

        return http.build()
    }

    @Bean
    fun passwordEncoder(): PasswordEncoder = Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8()
}

// Good: Rate limiting
@Component
class RateLimitFilter(
    private val rateLimiter: RateLimiter
) : OncePerRequestFilter() {

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain
    ) {
        val clientIp = request.remoteAddr

        if (!rateLimiter.tryAcquire(clientIp)) {
            response.status = HttpStatus.TOO_MANY_REQUESTS.value()
            return
        }

        filterChain.doFilter(request, response)
    }
}
```

### A08: Software Integrity

```kotlin
// Good: Validate JWT signatures
@Bean
fun jwtDecoder(): JwtDecoder {
    val decoder = NimbusJwtDecoder.withPublicKey(publicKey).build()

    decoder.setJwtValidator(
        DelegatingOAuth2TokenValidator(
            JwtTimestampValidator(),
            JwtIssuerValidator(issuer),
            JwtClaimValidator<List<String>>("aud") { aud ->
                aud.contains(expectedAudience)
            }
        )
    )

    return decoder
}

// Good: Avoid Java serialization, use JSON
import kotlinx.serialization.json.Json
import kotlinx.serialization.Serializable

@Serializable
data class UserDTO(val id: Long, val name: String)

val json = Json { ignoreUnknownKeys = true }
val user = json.decodeFromString<UserDTO>(jsonString)
```

## Kotlin-Specific Security

### Null Safety for Security
```kotlin
// Good: Use null safety to prevent NPE-based bypasses
fun authenticate(token: String?): User {
    val validToken = token ?: throw UnauthorizedException("Token required")

    return tokenService.validate(validToken)
        ?: throw UnauthorizedException("Invalid token")
}

// Good: requireNotNull for security checks
fun processPayment(userId: Long?, amount: BigDecimal?) {
    val validUserId = requireNotNull(userId) { "User ID required" }
    val validAmount = requireNotNull(amount) { "Amount required" }
    require(validAmount > BigDecimal.ZERO) { "Amount must be positive" }

    // Process payment
}
```

### Immutability for Security
```kotlin
// Good: Immutable data prevents tampering
data class PaymentRequest(
    val orderId: Long,
    val amount: BigDecimal,
    val currency: Currency,
) {
    init {
        require(amount > BigDecimal.ZERO) { "Amount must be positive" }
    }
}

// Good: Defensive copying
class SecureConfig(permissions: Set<String>) {
    val permissions: Set<String> = permissions.toSet()  // Immutable copy
}
```

### Sealed Classes for Security States
```kotlin
sealed class AuthResult {
    data class Success(val user: User, val token: String) : AuthResult()
    data class Failure(val reason: String) : AuthResult()
    data object MfaRequired : AuthResult()
    data object AccountLocked : AuthResult()
}

fun handleAuth(result: AuthResult): Response = when (result) {
    is AuthResult.Success -> ok(result.token)
    is AuthResult.Failure -> unauthorized(result.reason)
    AuthResult.MfaRequired -> status(428, "MFA required")
    AuthResult.AccountLocked -> forbidden("Account locked")
}
```

## Input Validation

```kotlin
// Good: Validation with Jakarta Validation
data class CreateUserRequest(
    @field:NotBlank
    @field:Size(min = 2, max = 50)
    val name: String,

    @field:Email
    @field:NotBlank
    val email: String,

    @field:Size(min = 12)
    @field:Pattern(regexp = "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@\$!%*?&]).*$")
    val password: String,
)

// Good: Custom validation
class SecureInputValidator {
    companion object {
        private val SAFE_FILENAME = Regex("^[a-zA-Z0-9._-]+$")

        fun validateFilename(name: String): String {
            require(SAFE_FILENAME.matches(name)) { "Invalid filename" }
            require(!name.contains("..")) { "Path traversal detected" }
            return name
        }

        fun validateRedirectUrl(url: String, allowedHosts: Set<String>): String {
            val parsed = URI(url)
            require(parsed.host in allowedHosts) { "Invalid redirect host" }
            require(parsed.scheme in listOf("http", "https")) { "Invalid scheme" }
            return url
        }
    }
}
```

## Coroutines Security

```kotlin
// Good: Secure context propagation
class SecurityContextHolder {
    companion object {
        private val context = ThreadLocal<SecurityContext>()

        fun getContext(): SecurityContext? = context.get()
        fun setContext(ctx: SecurityContext) = context.set(ctx)
        fun clear() = context.remove()
    }
}

// Coroutine context element for security
class SecurityContextElement(val context: SecurityContext) : ThreadContextElement<SecurityContext?> {
    companion object Key : CoroutineContext.Key<SecurityContextElement>

    override val key: CoroutineContext.Key<*> = Key

    override fun updateThreadContext(context: CoroutineContext): SecurityContext? {
        val old = SecurityContextHolder.getContext()
        SecurityContextHolder.setContext(this.context)
        return old
    }

    override fun restoreThreadContext(context: CoroutineContext, oldState: SecurityContext?) {
        if (oldState != null) {
            SecurityContextHolder.setContext(oldState)
        } else {
            SecurityContextHolder.clear()
        }
    }
}
```

## Security Testing

```kotlin
// Security-focused tests
@SpringBootTest
@AutoConfigureMockMvc
class SecurityTests {
    @Autowired lateinit var mockMvc: MockMvc

    @Test
    fun `should reject unauthenticated requests`() {
        mockMvc.get("/api/orders")
            .andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `should prevent IDOR`() {
        mockMvc.get("/api/orders/999") {
            with(jwt().jwt { it.subject("user1") })
        }.andExpect {
            status { isForbidden() }  // Order belongs to different user
        }
    }

    @Test
    fun `should sanitize SQL injection attempts`() {
        mockMvc.get("/api/users") {
            param("search", "'; DROP TABLE users; --")
        }.andExpect {
            status { isOk() }
            // Should return empty results, not error
        }
    }
}
```

## CI/CD Security

```yaml
name: Security Scan
on: [push, pull_request]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup JDK
        uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'

      - name: OWASP Dependency Check
        run: ./gradlew dependencyCheckAnalyze

      - name: SpotBugs with FindSecBugs
        run: ./gradlew spotbugsMain

      - name: Check for secrets
        uses: trufflesecurity/trufflehog@main
```
